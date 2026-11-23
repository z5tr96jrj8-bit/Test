/* Timeline par catégorie.
   Performances : le zoom ne change que la largeur d'un conteneur (aucun bloc redessiné) ;
   ajouter / modifier / supprimer un tag ne touche que sa ligne ; la tête de lecture est déplacée
   par une simple transformation CSS. */

import { el, fmt, textOn, tint, clamp } from "../core/util.js";
import { tagRows, rowKeyOfTag, matchSeconds } from "../model/match.js";
import { onDoubleTap, inlineRename } from "./dialogs.js";

const LABEL_W = 190, ROW_H = 24, ZMAX = 60;

export class Timeline {
  constructor(host, opts) {
    this.o = opts;        // { match(), onSelect(t), onSeek(sec), onEdit(t,{start,end,at}), onRenameRow(row, name), isStar(t) }
    this.dur = 600;
    this.zoom = Number(localStorage.getItem("rl2.tlZoom")) || 1;
    this.filter = { side: "all", hideEmpty: false, hidden: new Set(), starOnly: false };
    this.rows = new Map();     // key -> { row, el, track, count }
    this.blocks = new Map();   // tagId -> élément
    this.current = null;
    this.editing = null;
    this.scroll = el("div", "tl-scroll");
    this.inner = el("div", "tl-inner");
    this.head = el("div", "tl-row tl-head");
    this.head.appendChild(el("div", "tl-lab tl-corner"));
    this.ticks = el("div", "tl-track tl-ticks");
    this.head.appendChild(this.ticks);
    this.body = el("div", "tl-rows");
    this.playhead = el("div", "tl-playhead");
    this.inner.append(this.head, this.body, this.playhead);
    this.scroll.appendChild(this.inner);
    host.appendChild(this.scroll);
    this.bind();
    if (window.ResizeObserver) new ResizeObserver(() => this.layout()).observe(this.scroll);
  }

  /* ---------- Construction complète (changement de match, de panel, de filtre) ---------- */
  build() {
    const m = this.o.match(); if (!m) return;
    this.body.textContent = ""; this.rows.clear(); this.blocks.clear();
    const rows = tagRows(m);
    rows.forEach((r) => this.makeRow(r));
    this.applyFilter();
    this.layout();
    this.setCurrent(this.current);
  }
  makeRow(r, before) {
    const rowEl = el("div", "tl-row");
    rowEl.dataset.key = r.key;
    const lab = el("div", "tl-lab");
    lab.style.setProperty("--c", r.color || "#64748B");
    lab.appendChild(el("span", "n", String(r.n)));
    lab.appendChild(el("span", "nm", r.label, { title: r.label }));
    const count = el("i", "ct", String(r.tags.length));
    lab.appendChild(count);
    const track = el("div", "tl-track");
    track.style.background = tint(r.color || "#64748B", 0.12);
    rowEl.append(lab, track);
    if (before) this.body.insertBefore(rowEl, before); else this.body.appendChild(rowEl);
    const entry = { row: r, el: rowEl, track, count, lab };
    this.rows.set(r.key, entry);
    r.tags.forEach((t) => this.makeBlock(entry, t));
    this.renumber(entry);
    return entry;
  }
  makeBlock(entry, t) {
    const b = el("button", "tl-block", null, { type: "button" });
    b.dataset.id = t.id;
    const c = entry.row.color || t.color || "#64748B";
    b.style.background = c; b.style.color = textOn(c);
    b.appendChild(el("b"));
    b.appendChild(el("span", "", entry.row.label));
    this.place(b, t);
    entry.track.appendChild(b);
    this.blocks.set(t.id, b);
    return b;
  }
  place(b, t) {
    b.style.left = clamp(t.start / this.dur * 100, 0, 100) + "%";
    b.style.width = Math.max(0, (t.end - t.start) / this.dur * 100) + "%";
    const m = this.o.match();
    b.setAttribute("aria-label", t.label + ", " + fmt(m ? matchSeconds(m, t) : t.at));
  }
  renumber(entry) {
    const tags = entry.row.tags;
    tags.forEach((t, i) => { const b = this.blocks.get(t.id); if (b) b.firstChild.textContent = String(i + 1); });
    entry.count.textContent = String(tags.length);
    entry.el.classList.toggle("no-tags", !tags.length);
  }

  /* ---------- Mises à jour ciblées ---------- */
  addTag(t) {
    const key = rowKeyOfTag(t);
    let entry = this.rows.get(key);
    if (!entry) { this.build(); return; } // nouvelle ligne « orpheline » : reconstruction (rare)
    const tags = entry.row.tags;
    let i = tags.length; while (i > 0 && tags[i - 1].at > t.at) i--;
    tags.splice(i, 0, t);
    this.makeBlock(entry, t);
    this.renumber(entry);
    this.applyFilterRow(entry);
  }
  updateTag(t) {
    const b = this.blocks.get(t.id);
    const entry = this.entryOf(t.id);
    if (!b || !entry || entry.row.key !== rowKeyOfTag(t)) { this.build(); return; }
    entry.row.tags.sort((x, y) => x.at - y.at);
    this.place(b, t);
    this.renumber(entry);
  }
  removeTag(id) {
    const entry = this.entryOf(id), b = this.blocks.get(id);
    if (b) b.remove();
    this.blocks.delete(id);
    if (entry) { entry.row.tags = entry.row.tags.filter((x) => x.id !== id); this.renumber(entry); this.applyFilterRow(entry); }
    if (this.editing === id) this.editing = null;
  }
  entryOf(tagId) { for (const e of this.rows.values()) if (e.row.tags.some((x) => x.id === tagId)) return e; return null; }

  setCurrent(id) {
    if (this.current && this.blocks.get(this.current)) this.blocks.get(this.current).classList.remove("current");
    this.rows.forEach((e) => e.el.classList.remove("sel"));
    this.current = id;
    const b = id && this.blocks.get(id);
    if (b) { b.classList.add("current"); const e = this.entryOf(id); if (e) e.el.classList.add("sel"); }
  }
  setEditing(id) {
    if (this.editing) { const old = this.blocks.get(this.editing); if (old) { old.classList.remove("editing"); old.querySelectorAll(".h").forEach((h) => h.remove()); } }
    this.editing = id;
    const b = id && this.blocks.get(id);
    if (b) { b.classList.add("editing"); b.appendChild(el("span", "h l")); b.appendChild(el("span", "h r")); }
    if (this.o.onEditMode) this.o.onEditMode(id);
  }

  /* ---------- Filtres ---------- */
  setFilter(f) { Object.assign(this.filter, f); this.applyFilter(); }
  applyFilter() { this.rows.forEach((e) => this.applyFilterRow(e)); }
  applyFilterRow(e) {
    const f = this.filter, r = e.row;
    const hide = (f.side !== "all" && r.side && r.side !== f.side) || f.hidden.has(r.key) || (f.hideEmpty && !r.tags.length);
    e.el.hidden = !!hide;
    if (f.starOnly || e.starFiltered) {
      r.tags.forEach((t) => { const b = this.blocks.get(t.id); if (b) b.hidden = f.starOnly && !this.o.isStar(t); });
      e.starFiltered = f.starOnly;
    }
  }

  /* ---------- Échelle, zoom, graduations, tête de lecture ---------- */
  setDuration(d) {
    if (!(d > 0) || Math.abs(d - this.dur) < 0.5) return;
    this.dur = d;
    const m = this.o.match();
    if (m) m.tags.forEach((t) => { const b = this.blocks.get(t.id); if (b) this.place(b, t); });
    this.drawTicks();
  }
  trackWidth() { return Math.max(50, (this.scroll.clientWidth - LABEL_W) * this.zoom); }
  layout() {
    this.inner.style.width = (LABEL_W + this.trackWidth()) + "px";
    this.drawTicks();
    this.setPlayhead(this.lastHead || 0);
  }
  pps() { return this.trackWidth() / this.dur; }
  setZoom(z, clientX) {
    z = clamp(z, 1, ZMAX);
    const sc = this.scroll, viewW = sc.clientWidth - LABEL_W;
    const px = clamp((clientX == null ? sc.getBoundingClientRect().left + LABEL_W + viewW / 2 : clientX) - sc.getBoundingClientRect().left - LABEL_W, 0, viewW);
    const frac = (sc.scrollLeft + px) / this.trackWidth();
    this.zoom = z;
    this.inner.style.width = (LABEL_W + this.trackWidth()) + "px";
    sc.scrollLeft = Math.max(0, frac * this.trackWidth() - px);
    clearTimeout(this.zt);
    this.zt = setTimeout(() => { this.drawTicks(); try { localStorage.setItem("rl2.tlZoom", String(this.zoom)); } catch (e) { /* rien */ } }, 80);
    if (this.o.onZoom) this.o.onZoom(this.zoom, this.pps());
  }
  drawTicks() {
    this.ticks.textContent = "";
    const vis = this.dur / this.zoom;
    const STEPS = [5, 10, 30, 60, 120, 300, 600, 900, 1800];
    let step = 3600;
    for (const s of STEPS) if (vis / s <= 10) { step = s; break; }
    for (let s = 0; s < this.dur - step * 0.4; s += step) {
      const tk = el("span", "tick", step % 60 === 0 ? Math.round(s / 60) + "'" : fmt(s));
      tk.style.left = (s / this.dur * 100) + "%";
      this.ticks.appendChild(tk);
    }
  }
  setPlayhead(sec, follow) {
    this.lastHead = sec;
    const x = LABEL_W + clamp(sec / this.dur, 0, 1) * this.trackWidth();
    this.playhead.style.transform = `translateX(${x}px)`;
    if (follow && this.zoom > 1) {
      const sc = this.scroll, viewW = sc.clientWidth - LABEL_W, rel = x - LABEL_W;
      if (rel < sc.scrollLeft || rel > sc.scrollLeft + viewW - 30) sc.scrollLeft = Math.max(0, rel - viewW * 0.15);
    }
  }
  reveal(sec) { const sc = this.scroll, rel = clamp(sec / this.dur, 0, 1) * this.trackWidth(); sc.scrollLeft = Math.max(0, rel - (sc.clientWidth - LABEL_W) * 0.4); }

  /* ---------- Gestes ---------- */
  bind() {
    let lastTap = { id: null, at: 0 };
    this.body.addEventListener("click", (e) => {
      if (this.suppressClick) { this.suppressClick = false; return; }
      const b = e.target.closest(".tl-block");
      const m = this.o.match(); if (!m) return;
      if (b) {
        const t = m.tags.find((x) => x.id === b.dataset.id); if (!t || this.editing === t.id) return;
        const now = Date.now();
        if (lastTap.id === t.id && now - lastTap.at < 450) { lastTap = { id: null, at: 0 }; this.setEditing(t.id); this.o.onSelect(t, false); return; }
        lastTap = { id: t.id, at: now };
        this.setEditing(null);
        this.o.onSelect(t, true);
        return;
      }
      if (this.editing) { this.setEditing(null); return; }
      if (e.target.closest(".tl-lab")) return;
      const track = e.target.closest(".tl-track"); if (!track) return;
      const r = track.getBoundingClientRect();
      this.o.onSeek(clamp((e.clientX - r.left) / r.width, 0, 1) * this.dur);
    });
    // Glisser un bloc en mode édition : déplacer ou tirer une poignée.
    this.body.addEventListener("pointerdown", (e) => {
      const b = e.target.closest(".tl-block.editing"); if (!b) return;
      const m = this.o.match(), t = m && m.tags.find((x) => x.id === b.dataset.id); if (!t) return;
      const w = b.parentElement.getBoundingClientRect().width;
      this.drag = { t, b, mode: e.target.classList.contains("l") ? "l" : (e.target.classList.contains("r") ? "r" : "move"), sx: e.clientX, spp: this.dur / w, s: t.start, e: t.end, ns: t.start, ne: t.end, moved: false };
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
      e.preventDefault();
    });
    this.body.addEventListener("pointermove", (e) => {
      const d = this.drag; if (!d) return;
      if (!d.moved && Math.abs(e.clientX - d.sx) < 4) return;
      d.moved = true;
      const ds = (e.clientX - d.sx) * d.spp, len = d.e - d.s;
      if (d.mode === "move") { d.ns = clamp(d.s + ds, 0, Math.max(0, this.dur - len)); d.ne = d.ns + len; }
      else if (d.mode === "l") { d.ns = clamp(d.s + ds, 0, d.e - 0.5); d.ne = d.e; }
      else { d.ne = clamp(d.e + ds, d.s + 0.5, this.dur); d.ns = d.s; }
      d.b.style.left = (d.ns / this.dur * 100) + "%";
      d.b.style.width = ((d.ne - d.ns) / this.dur * 100) + "%";
    });
    const end = () => {
      const d = this.drag; this.drag = null;
      if (!d || !d.moved) return;
      this.suppressClick = true;
      const shift = d.mode === "move" ? d.ns - d.s : 0;
      this.o.onEdit(d.t, { start: d.ns, end: d.ne, at: clamp(d.t.at + shift, d.ns, d.ne) });
    };
    this.body.addEventListener("pointerup", end);
    this.body.addEventListener("pointercancel", end);
    // Zoom : molette ou pincement sur la règle, double toucher pour revenir à 1.
    this.ticks.addEventListener("wheel", (e) => { e.preventDefault(); this.setZoom(this.zoom * Math.exp(-(e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY) / 300), e.clientX); }, { passive: false });
    this.scroll.addEventListener("wheel", (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.setZoom(this.zoom * Math.exp(-e.deltaY / 150), e.clientX); } }, { passive: false });
    const pts = new Map(); let base = null, lastTick = 0;
    this.ticks.addEventListener("pointerdown", (e) => {
      pts.set(e.pointerId, e.clientX);
      try { this.ticks.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
      const xs = [...pts.values()];
      base = xs.length >= 2 ? { pinch: true, d: Math.max(20, Math.abs(xs[0] - xs[1])), z: this.zoom } : { pinch: false, x: e.clientX, z: this.zoom, moved: false };
    });
    this.ticks.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId) || !base) return;
      pts.set(e.pointerId, e.clientX);
      const xs = [...pts.values()];
      if (base.pinch && xs.length >= 2) this.setZoom(base.z * Math.max(20, Math.abs(xs[0] - xs[1])) / base.d, (xs[0] + xs[1]) / 2);
      else if (!base.pinch) { const dx = e.clientX - base.x; if (!base.moved && Math.abs(dx) < 6) return; base.moved = true; this.setZoom(base.z * Math.exp(dx / 140), base.x); }
    });
    const up = (e) => {
      const tap = base && !base.pinch && !base.moved;
      pts.delete(e.pointerId); base = null;
      if (tap) { const now = Date.now(); if (now - lastTick < 350) { this.setZoom(1); this.scroll.scrollLeft = 0; lastTick = 0; } else lastTick = now; }
    };
    this.ticks.addEventListener("pointerup", up);
    this.ticks.addEventListener("pointercancel", up);
    // Double toucher sur le nom d'une ligne : renommer.
    onDoubleTap(this.body, ".tl-lab", () => true, (lab) => {
      const key = lab.parentElement.dataset.key, e = this.rows.get(key); if (!e) return;
      inlineRename(lab, e.row.label, (v) => this.o.onRenameRow(e.row, v));
    });
  }
}

