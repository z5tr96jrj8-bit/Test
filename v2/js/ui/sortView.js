/* Page « Sort » : les clips de tous les matchs d'un projet, rangés par tag.
   Lecture à la suite, étoiles « Keep », export du montage des clips affichés. */

import { store } from "../core/store.js";
import { $, el, fmt, downloadFile, pickFile, cleanName, normLabel } from "../core/util.js";
import { t, tn } from "../core/i18n.js";
import { buttons } from "../model/panel.js";
import { isVideo, matchSeconds, pre, post } from "../model/match.js";
import { projectMatches, shortLabel, starKey } from "../model/project.js";
import { vault } from "../video/vault.js";
import { recordClips, recorderOk } from "../video/recorder.js";
import { icon } from "./icons.js";
import { toast, modal } from "./dialogs.js";

let go = null, built = false, dom = {};
const S = { pid: null, cat: null, match: "all", star: false, cur: null, end: null, back: null, urls: {} };
export function initSortView(nav) { go = nav; }
const P = () => store.get(S.pid);

function build() {
  const r = $("view-sort"); r.innerHTML = "";
  const top = el("header", "topbar");
  const b = el("button", "ib", null, { type: "button", title: t("Back"), "aria-label": t("Back") }); b.innerHTML = icon("back");
  b.addEventListener("click", () => { const p = P(); const back = S.back && store.get(S.back) ? S.back : (p && projectMatches(p)[0] ? projectMatches(p)[0].id : null); if (back) go("match", { id: back, projectId: S.pid }); else go("projects"); });
  dom.head = el("b", "page-title");
  dom.exp = el("button", "btn small primary", t("Export the montage"), { type: "button" });
  dom.exp.addEventListener("click", exportMontage);
  top.append(b, dom.head, el("span", "flex"), dom.exp);
  r.appendChild(top);
  const board = el("div", "sort-board");
  const side = el("section", "card sort-side");
  const sh = el("div", "card-head");
  dom.catBack = el("button", "ib small", null, { type: "button", "aria-label": t("All tags") }); dom.catBack.innerHTML = icon("back", 18);
  dom.catBack.addEventListener("click", () => { S.cat = null; render(); });
  dom.sideTitle = el("span", "card-title");
  dom.starOnly = el("button", "chip", null, { type: "button" });
  dom.starOnly.addEventListener("click", () => { S.star = !S.star; render(); });
  sh.append(dom.catBack, dom.sideTitle, el("span", "flex"), dom.starOnly);
  side.appendChild(sh);
  dom.list = el("ul", "sort-list");
  dom.list.addEventListener("click", onListClick);
  side.appendChild(dom.list);
  board.appendChild(side);
  const main = el("section", "sort-main");
  dom.seg = el("div", "seg wrap");
  main.appendChild(dom.seg);
  const pl = el("div", "videobox");
  dom.video = el("video", "", null, { playsinline: "", preload: "metadata" });
  dom.empty = el("div", "video-ask");
  dom.emptyText = el("p");
  dom.emptyBtn = el("button", "btn primary", t("Choose the video"), { type: "button" });
  dom.emptyBtn.addEventListener("click", pickMissing);
  dom.empty.append(dom.emptyText, dom.emptyBtn);
  pl.append(dom.video, dom.empty);
  main.appendChild(pl);
  const bar = el("div", "transport");
  const ib = (ic, title, fn) => { const x = el("button", "ib", null, { type: "button", title, "aria-label": title }); x.innerHTML = icon(ic); x.addEventListener("click", fn); return x; };
  dom.play = ib("play", t("Play / pause"), toggle);
  dom.now = el("span", "sort-now");
  dom.star = el("button", "chip", null, { type: "button" });
  dom.star.addEventListener("click", () => { if (S.cur) star(S.cur.key); });
  bar.append(ib("first", t("Previous clip"), () => step(-1)), dom.play, ib("last", t("Next clip"), () => step(1)), dom.now, el("span", "flex"), dom.star);
  main.appendChild(bar);
  board.appendChild(main);
  r.appendChild(board);
  dom.video.addEventListener("timeupdate", () => { if (S.end != null && dom.video.currentTime >= S.end) { dom.video.pause(); S.end = null; step(1, true); } });
  dom.video.addEventListener("play", renderBar);
  dom.video.addEventListener("pause", renderBar);
  dom.video.addEventListener("click", toggle);
  built = true;
}

export function showSort(opts) {
  if (!built) build();
  S.pid = opts.projectId; S.back = opts.back || null; S.cur = null; S.end = null;
  const p = P(); if (!p) { go("projects"); return; }
  if (S.match !== "all" && !p.matchIds.includes(S.match)) S.match = "all";
  dom.video.pause(); dom.video.removeAttribute("src"); delete dom.video.dataset.match; dom.video.load();
  empty(t("Choose a tag on the left, then a clip."), false);
  render();
}
export function leaveSort() {
  if (!built) return;
  dom.video.pause(); dom.video.removeAttribute("src"); dom.video.load();
  Object.values(S.urls).forEach((u) => URL.revokeObjectURL(u)); S.urls = {};
}

/* Regroupement : tous les boutons du panel (même sans clip), puis les autres libellés. */
function groups() {
  const p = P(), g = new Map();
  buttons().forEach((b) => { const k = normLabel(b.label); if (!g.has(k)) g.set(k, { key: k, label: b.label, color: b.color, clips: [] }); });
  projectMatches(p).forEach((m) => m.tags.forEach((tg) => {
    const k = normLabel(tg.label);
    if (!g.has(k)) g.set(k, { key: k, label: tg.label, color: tg.color, clips: [] });
    g.get(k).clips.push({ m, t: tg, key: starKey(m, tg) });
  }));
  const order = p.matchIds;
  g.forEach((x) => x.clips.sort((a, b) => (order.indexOf(a.m.id) - order.indexOf(b.m.id)) || (a.t.at - b.t.at)));
  return [...g.values()];
}
const visible = (clips) => clips.filter((c) => (S.match === "all" || c.m.id === S.match) && (!S.star || (P().stars || {})[c.key]));
function shown() { const g = groups().find((x) => x.key === S.cat); return g ? visible(g.clips) : []; }

function render() {
  const p = P(); if (!p) return;
  dom.head.textContent = t("Sort") + " · " + p.name;
  dom.seg.textContent = "";
  const mk = (id, label) => { const b = el("button", S.match === id ? "on" : "", null, { type: "button" }); if (id !== "all" && vault.meta(id)) b.appendChild(el("i", "dot")); b.appendChild(document.createTextNode(label)); b.addEventListener("click", () => { S.match = id; render(); }); dom.seg.appendChild(b); };
  mk("all", t("All matches"));
  projectMatches(p).forEach((m) => mk(m.id, shortLabel(p, m)));
  dom.starOnly.innerHTML = icon(S.star ? "star" : "staro", 14) + " " + t("Kept");
  dom.starOnly.classList.toggle("on", S.star);
  dom.catBack.hidden = !S.cat;
  dom.list.textContent = "";
  const gs = groups();
  if (!S.cat) {
    dom.sideTitle.textContent = t("By tag");
    gs.forEach((g, i) => {
      const n = visible(g.clips).length;
      const li = el("li");
      const b = el("button", "code-open" + (n ? "" : " zero"), null, { type: "button" }); b.dataset.cat = g.key;
      const sw = el("i", "sw"); sw.style.background = g.color;
      b.append(el("span", "n", String(i + 1)), sw, el("span", "nm", g.label), el("span", "ct", String(n)));
      li.appendChild(b); dom.list.appendChild(li);
    });
  } else {
    const g = gs.find((x) => x.key === S.cat), clips = shown();
    dom.sideTitle.textContent = (g ? g.label : "") + " · " + clips.length;
    let last = null;
    clips.forEach((c) => {
      if (c.m !== last) { last = c.m; dom.list.appendChild(el("li", "grp muted small", c.m.home + " – " + c.m.away)); }
      const li = el("li", "sort-clip" + (S.cur && S.cur.key === c.key ? " on" : ""));
      const b = el("button", "clip-item", null, { type: "button" }); b.dataset.clip = c.key;
      b.append(el("span", "mono", fmt(matchSeconds(c.m, c.t))), el("span", "x muted", [c.t.result, c.t.note].filter(Boolean).join(" · ")));
      const on = !!(P().stars || {})[c.key];
      const st = el("button", "ib small" + (on ? " starred" : ""), null, { type: "button", "aria-label": t("Keep this clip") }); st.innerHTML = icon(on ? "star" : "staro", 16); st.dataset.star = c.key;
      li.append(b, st); dom.list.appendChild(li);
    });
    if (!clips.length) dom.list.appendChild(el("li", "muted small empty", S.star ? t("No kept clip in this tag.") : t("No clip of this tag here.")));
  }
  renderBar();
}
function renderBar() {
  const clips = S.cat ? shown() : [];
  const dur = clips.reduce((n, c) => n + pre(c.t) + post(c.t), 0);
  dom.exp.disabled = !clips.length;
  dom.exp.textContent = clips.length ? t("Export the montage ({n} · {d})", { n: tn(clips.length, "{n} clip", "{n} clips"), d: fmt(dur) }) : t("Export the montage");
  dom.play.innerHTML = icon(dom.video.paused ? "play" : "pause");
  dom.now.textContent = "";
  dom.star.hidden = !S.cur;
  if (!S.cur) return;
  const i = clips.findIndex((c) => c.key === S.cur.key);
  dom.now.append(el("b", "", S.cur.t.label), el("span", "muted", " · " + S.cur.m.home + " – " + S.cur.m.away + " · " + fmt(matchSeconds(S.cur.m, S.cur.t)) + (i >= 0 ? " · " + (i + 1) + "/" + clips.length : "")));
  const on = !!(P().stars || {})[S.cur.key];
  dom.star.innerHTML = icon(on ? "star" : "staro", 14) + " " + (on ? t("Kept") : t("Keep"));
  dom.star.classList.toggle("on", on);
}
function empty(text, btn) { dom.empty.hidden = false; dom.emptyText.textContent = text; dom.emptyBtn.hidden = !btn; }

function onListClick(e) {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.cat) { S.cat = b.dataset.cat; render(); dom.list.scrollTop = 0; }
  else if (b.dataset.star) star(b.dataset.star);
  else if (b.dataset.clip) { const c = shown().find((x) => x.key === b.dataset.clip); if (c) playClip(c); }
}
function star(key) {
  store.mutate(S.pid, t("Keep clip"), (p) => { p.stars = p.stars || {}; if (p.stars[key]) delete p.stars[key]; else p.stars[key] = true; return { type: "doc" }; });
  render();
}
function urlOf(m) {
  if (S.urls[m.id]) return Promise.resolve(S.urls[m.id]);
  return vault.get(m.id).then((f) => { if (!f) return null; S.urls[m.id] = URL.createObjectURL(f); return S.urls[m.id]; });
}
function open(m, then) {
  const v = dom.video;
  if (!isVideo(m)) { v.pause(); empty(t("This match was tagged without a video."), false); return; }
  urlOf(m).then((url) => {
    if ($("view-sort").hidden) return;
    if (!url) { v.pause(); S.pending = { m, then }; empty(t("The video of {m} is not on this device yet.", { m: m.home + " – " + m.away }) + (m.video.name ? " (" + m.video.name + ")" : ""), true); return; }
    dom.empty.hidden = true;
    if (v.dataset.match !== m.id) { v.dataset.match = m.id; v.src = url; v.addEventListener("loadedmetadata", then, { once: true }); v.load(); } else then();
  });
}
function pickMissing() {
  const p = S.pending; if (!p) return;
  pickFile("video/*").then((f) => {
    if (!f) return;
    S.pending = null;
    if (S.urls[p.m.id]) URL.revokeObjectURL(S.urls[p.m.id]);
    S.urls[p.m.id] = URL.createObjectURL(f);
    vault.save(p.m.id, f, null, (ok) => { if (ok) toast(t("Video kept on this device: no need to choose it again.")); });
    open(p.m, p.then);
  });
}
function playClip(c) {
  S.cur = c; S.end = null;
  open(c.m, () => { const v = dom.video; try { v.currentTime = Math.max(0, c.t.start); } catch (e) { /* rien */ } S.end = c.t.end; const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); });
  render();
}
function step(d, auto) {
  const clips = shown(); if (!clips.length) return;
  const i = S.cur ? clips.findIndex((c) => c.key === S.cur.key) : -1;
  const j = i < 0 ? 0 : i + d;
  if (auto && j >= clips.length) return;
  playClip(clips[Math.max(0, Math.min(clips.length - 1, j))]);
}
function toggle() { const v = dom.video; if (!v.getAttribute("src")) { step(0); return; } if (v.paused) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } else v.pause(); }

function exportMontage() {
  const p = P(), clips = shown(); if (!clips.length) return;
  if (!recorderOk()) { toast(t("Video export is not available on this device. Use the CSV export to cut clips in another tool.")); return; }
  const ids = [...new Set(clips.map((c) => c.m.id))];
  Promise.all(ids.map((id) => urlOf(store.get(id)))).then((urls) => {
    const missing = ids.filter((id, i) => !urls[i]);
    if (missing.length) { toast(t("Missing video for: {m}", { m: missing.map((id) => store.get(id).home + " – " + store.get(id).away).join(", ") })); return; }
    const msg = el("p", "dlg-text", t("Preparing…"));
    let job;
    modal(t("Video export"), msg, [{ label: t("Cancel"), value: "cancel" }]).then((v) => { if (v === "cancel" && job) job.cancel(); });
    job = recordClips(dom.video, clips.map((c) => ({ start: c.t.start, end: c.t.end, src: () => urlOf(c.m) })), (i, n) => { S.cur = clips[i]; renderBar(); msg.textContent = t("Recording clip {i} of {n} in real time. Keep this page open and the screen on.", { i: i + 1, n }); });
    const close = () => { const o = document.querySelector(".overlay"); if (o) o.remove(); };
    job.promise.then((blob) => {
      close(); if (!blob) return;
      const g = groups().find((x) => x.key === S.cat);
      const name = cleanName(p.name + "-" + (g ? g.label : "clips")).slice(0, 80) + "." + job.ext;
      downloadFile(name, blob); toast(t("Video saved: {f}", { f: name }));
    }, () => { close(); toast(t("The video could not be recorded.")); });
  });
}
