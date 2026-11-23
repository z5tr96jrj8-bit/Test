/* Panel de codage : grille libre de boutons et de titres.
   Mode « code » : un toucher = un tag ; les lignes s'agrandissent pour remplir la hauteur.
   Mode « edit » : sélection, déplacement, redimensionnement (souris ou doigt). */

import { el } from "../core/util.js";
import { activePanel, COLS, ROW_H, PAD_GAP, MAX_ROW, paint, editPanel } from "../model/panel.js";

export class Pad {
  constructor(host, opts) {
    this.opts = opts;           // { mode, onTap(btn), onSelect(id) }
    this.grid = el("div", "pad-grid");
    host.appendChild(this.grid);
    this.nodes = new Map();      // id -> élément
    this.sel = null;
    this.enabled = true;
    this.drag = null;
    this.grid.addEventListener("click", (e) => this.click(e));
    this.grid.addEventListener("pointerdown", (e) => this.down(e));
    this.grid.addEventListener("pointermove", (e) => this.move(e));
    this.grid.addEventListener("pointerup", () => this.up());
    this.grid.addEventListener("pointercancel", () => this.up());
    if (window.ResizeObserver) new ResizeObserver(() => this.fit()).observe(this.grid);
  }
  get editing() { return this.opts.mode === "edit"; }

  /** Reconstruit le panel (seulement quand le panel change, pas à chaque tag). */
  render() {
    const items = activePanel().buttons;
    this.grid.textContent = "";
    this.nodes.clear();
    this.grid.classList.toggle("editing", this.editing);
    let maxRow = 0;
    items.forEach((it) => {
      let node;
      if (it.type === "label") {
        node = el("div", "pad-label" + (it.color ? " filled" : ""));
        node.appendChild(el("span", "", it.label));
      } else {
        node = el("button", "pad-btn", null, { type: "button" });
        node.dataset.side = it.side;
        node.appendChild(el("span", "lab", it.label));
        node.appendChild(el("i", "count"));
        if (it.key) node.appendChild(el("kbd", "", it.key));
        node.setAttribute("aria-label", it.label);
      }
      paint(node, it);
      node.dataset.id = it.id;
      node.style.gridColumn = (it.c + 1) + " / span " + it.w;
      node.style.gridRow = (it.r + 1) + " / span " + it.h;
      if (this.editing && it.id === this.sel) { node.classList.add("sel"); node.appendChild(el("span", "rs")); }
      this.grid.appendChild(node);
      this.nodes.set(it.id, node);
      maxRow = Math.max(maxRow, it.r + it.h);
    });
    this.maxRow = maxRow;
    this.setEnabled(this.enabled);
    this.fit();
  }

  /** Compteurs sur les boutons : Map(id -> nombre). */
  setCounts(counts) {
    this.nodes.forEach((n, id) => {
      const c = n.querySelector(".count"); if (!c) return;
      const v = counts.get(id) || 0;
      const txt = v ? String(v) : "";
      if (c.textContent !== txt) c.textContent = txt;
    });
  }
  setCount(id, v) { const n = this.nodes.get(id); const c = n && n.querySelector(".count"); if (c) c.textContent = v ? String(v) : ""; }
  flash(id) { const n = this.nodes.get(id); if (!n) return; n.classList.remove("hit"); void n.offsetWidth; n.classList.add("hit"); }
  setEnabled(on) {
    this.enabled = on;
    if (this.editing) return;
    this.nodes.forEach((n) => { if (n.tagName === "BUTTON") n.disabled = !on; });
  }
  markSelected(id) { this.nodes.forEach((n, k) => n.classList.toggle("current", k === id)); }

  /** Code : les lignes se partagent la hauteur disponible. Édition : taille fixe + place pour ajouter. */
  fit() {
    const g = this.grid, max = this.maxRow || 1;
    if (this.editing) {
      g.style.gridTemplateRows = `repeat(${max + 18}, ${ROW_H}px)`;
      g.style.rowGap = PAD_GAP + "px"; g.style.columnGap = PAD_GAP + "px";
      return;
    }
    const avail = g.clientHeight;
    if (avail <= 0) return;
    const k = Math.max(0.45, (avail + PAD_GAP) / (max * (ROW_H + PAD_GAP)));
    g.style.rowGap = (PAD_GAP * k).toFixed(2) + "px"; g.style.columnGap = Math.max(PAD_GAP, PAD_GAP * k).toFixed(2) + "px";
    g.style.gridTemplateRows = `repeat(${max}, ${(ROW_H * k).toFixed(2)}px)`;
  }

  click(e) {
    const node = e.target.closest("[data-id]");
    if (this.editing) {
      if (this.justDragged) { this.justDragged = false; return; }
      const id = node ? node.dataset.id : null;
      if (id !== this.sel) { this.sel = id; this.render(); this.opts.onSelect && this.opts.onSelect(id); }
      return;
    }
    if (!node || node.disabled || node.tagName !== "BUTTON") return;
    const it = activePanel().buttons.find((b) => b.id === node.dataset.id);
    if (it) { this.flash(it.id); this.opts.onTap(it); }
  }

  /* ---------- Édition : glisser pour déplacer, coin bas-droit pour redimensionner ---------- */
  cellAt(e) {
    const r = this.grid.getBoundingClientRect();
    const cw = (r.width - PAD_GAP * (COLS - 1)) / COLS;
    return { c: Math.floor((e.clientX - r.left) / (cw + PAD_GAP)), r: Math.floor((e.clientY - r.top) / (ROW_H + PAD_GAP)) };
  }
  down(e) {
    if (!this.editing) return;
    const node = e.target.closest("[data-id]"); if (!node) return;
    const it = activePanel().buttons.find((b) => b.id === node.dataset.id); if (!it) return;
    if (e.pointerType !== "mouse" && it.id !== this.sel) return; // au doigt : sélectionner d'abord
    const cell = this.cellAt(e);
    this.drag = { id: it.id, node, mode: e.target.classList.contains("rs") ? "resize" : "move", dc: cell.c - it.c, dr: cell.r - it.r, sx: e.clientX, sy: e.clientY, moved: false, box: { c: it.c, r: it.r, w: it.w, h: it.h }, type: it.type };
    try { node.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
    e.preventDefault();
  }
  move(e) {
    const d = this.drag; if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 6) return;
    d.moved = true;
    const cell = this.cellAt(e), b = d.box;
    if (d.mode === "move") {
      b.c = Math.min(COLS - b.w, Math.max(0, cell.c - d.dc));
      b.r = Math.min(MAX_ROW, Math.max(0, cell.r - d.dr));
    } else {
      b.w = Math.min(COLS - b.c, Math.max(d.type === "label" ? 6 : 4, cell.c - b.c + 1));
      b.h = Math.min(200, Math.max(3, cell.r - b.r + 1));
    }
    d.node.style.gridColumn = (b.c + 1) + " / span " + b.w;
    d.node.style.gridRow = (b.r + 1) + " / span " + b.h;
  }
  up() {
    const d = this.drag; this.drag = null;
    if (!d || !d.moved) return;
    this.justDragged = true;
    setTimeout(() => { this.justDragged = false; }, 50);
    editPanel(d.mode === "move" ? "Move button" : "Resize button", (p) => {
      const it = p.buttons.find((x) => x.id === d.id); if (!it) return false;
      Object.assign(it, d.box);
      if (d.mode === "move") fitToGap(p.buttons, it);
    });
  }
}

/* Posé dans un vide trop étroit entre deux éléments : le bouton prend la largeur du vide au lieu de chevaucher. */
function fitToGap(all, it) {
  const others = all.filter((x) => x !== it);
  const overlaps = (a, b) => a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.h && b.r < a.r + a.h;
  if (!others.some((o) => overlaps(it, o))) return;
  const occ = (c) => others.some((o) => o.c <= c && c < o.c + o.w && it.r < o.r + o.h && o.r < it.r + it.h);
  const col = Math.min(COLS - 1, Math.max(0, it.c));
  if (occ(col)) return;
  let L = col, R = col;
  while (L > 0 && !occ(L - 1)) L--;
  while (R < COLS - 1 && !occ(R + 1)) R++;
  const free = R - L + 1;
  if (free >= it.w) it.c = Math.min(R - it.w + 1, Math.max(L, it.c)); else { it.c = L; it.w = free; }
}
