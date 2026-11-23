/* Écran du match : vidéo (ou chrono du direct), panel de codage, détails du tag, timeline, listes.
   Deux mises en page : « Coding » (vidéo + panel) et « Analysis » (vidéo + listes, timeline plus haute).
   Chaque modification arrive par un événement du store et ne met à jour que la partie concernée. */

import { store } from "../core/store.js";
import { $, el, fmt, fmtLong, r1, clamp, debounce, downloadFile, pickFile, cleanName } from "../core/util.js";
import { t, tn } from "../core/i18n.js";
import { activePanel, buttons, buttonForTag, DEF_PRE, DEF_POST } from "../model/panel.js";
import { PERIODS, THIRDS, LANES, isVideo, findTag, makeTag, tagRows, rowKeyOfTag, matchSeconds, tagPeriod, pre, post, clipOf, liveSeconds, clockMs, score, listTags, axisDuration } from "../model/match.js";
import { projectOf, projectMatches, shortLabel, starKey } from "../model/project.js";
import { Player, RATES } from "../video/player.js";
import { vault } from "../video/vault.js";
import { recordClips, recorderOk } from "../video/recorder.js";
import { Pad } from "./pad.js";
import { Timeline } from "./timeline.js";
import { icon } from "./icons.js";
import { toast, modal, menu, confirmBox, promptBox } from "./dialogs.js";
import { openPanelMenu } from "./panelMenu.js";
import { saveCsv, saveMatchJson, buildCsv, baseName } from "../export/files.js";

let go = null;                 // navigation (fournie par main.js)
const S = { id: null, cur: null, layout: "code", tab: "codes", open: null, list: null, projectId: null, starOnly: false, built: false, liveTimer: 0, lastPos: 0 };
let player, pad, tl, dom = {};

const M = () => (S.id ? store.get(S.id) : null);
const curTag = () => { const m = M(); return m ? findTag(m, S.cur) : null; };
const project = () => { const m = M(); if (!m) return null; const p = S.projectId && store.get(S.projectId); return p && (p.matchIds || []).includes(m.id) ? p : projectOf(m.id); };
const isStar = (tg) => { const p = project(), m = M(); return !!(p && m && p.stars && p.stars[starKey(m, tg)]); };
const iconBtn = (name, title, fn, cls) => { const b = el("button", "ib " + (cls || ""), null, { type: "button", title, "aria-label": title }); b.innerHTML = icon(name); if (fn) b.addEventListener("click", fn); return b; };
const textBtn = (label, fn, cls) => { const b = el("button", "btn " + (cls || ""), label, { type: "button" }); if (fn) b.addEventListener("click", fn); return b; };

/* =================================================================== Construction */
function build() {
  const root = $("view-match");
  root.innerHTML = "";
  // ---- Barre du haut
  const top = el("header", "topbar");
  top.appendChild(iconBtn("home", t("Home"), () => go("home")));
  dom.title = el("button", "match-title", null, { type: "button" });
  dom.title.addEventListener("click", () => matchMenu(dom.title));
  top.appendChild(dom.title);
  dom.score = el("span", "score-pill");
  top.appendChild(dom.score);
  dom.tabs = el("nav", "ptabs");
  top.appendChild(dom.tabs);
  top.appendChild(el("span", "flex"));
  dom.undo = iconBtn("undo", t("Undo"), () => doUndo());
  dom.redo = iconBtn("redo", t("Redo"), () => doRedo());
  top.append(dom.undo, dom.redo, el("span", "sep"));
  dom.seg = el("div", "seg");
  [["code", "tag", t("Coding")], ["ana", "film", t("Analysis")]].forEach(([k, ic, lab]) => {
    const b = el("button", "", null, { type: "button" }); b.dataset.lay = k; b.innerHTML = icon(ic, 16) + "<span>" + lab + "</span>";
    b.addEventListener("click", () => setLayout(k)); dom.seg.appendChild(b);
  });
  top.appendChild(dom.seg);
  top.appendChild(el("span", "sep"));
  dom.sortBtn = iconBtn("sort", t("Sort project clips"), () => { const p = project(); if (p) go("sort", { projectId: p.id, back: S.id }); else toast(t("Add this match to a project first to sort its clips.")); });
  top.appendChild(dom.sortBtn);
  top.appendChild(iconBtn("camera", t("Capture image"), capture));
  dom.saveState = el("span", "save-state", t("Saved"));
  top.appendChild(dom.saveState);
  top.appendChild(iconBtn("export", t("Export"), () => exportDialog()));
  top.appendChild(iconBtn("more", t("More"), (e) => moreMenu(e.currentTarget)));
  root.appendChild(top);

  // ---- Plateau
  const board = el("div", "board");
  dom.board = board;

  // Vidéo + transport
  const stage = el("section", "stage");
  const vbox = el("div", "videobox");
  const video = el("video", "", null, { playsinline: "", "webkit-playsinline": "", disablepictureinpicture: "", preload: "metadata" });
  vbox.appendChild(video);
  dom.ask = el("div", "video-ask");
  dom.askText = el("p");
  dom.askBtn = textBtn(t("Choose the video"), pickVideo, "primary");
  dom.askNote = el("p", "small muted", t("The video stays on this device. It is never uploaded."));
  dom.ask.append(dom.askText, dom.askBtn, dom.askNote);
  vbox.appendChild(dom.ask);
  dom.vaultBadge = el("span", "vault-badge"); dom.vaultBadge.hidden = true;
  vbox.appendChild(dom.vaultBadge);
  video.addEventListener("click", () => player.toggle());
  stage.appendChild(vbox);
  dom.vbox = vbox;
  dom.seek = el("div", "seekbar");
  dom.seekFill = el("span", "fill"); dom.seekMarks = el("span", "marks");
  dom.seek.append(el("span", "track"), dom.seekMarks, dom.seekFill);
  bindSeekbar(dom.seek);
  stage.appendChild(dom.seek);
  dom.transport = el("div", "transport");
  stage.appendChild(dom.transport);
  board.appendChild(stage);

  // Panel + détails du tag
  const padcol = el("section", "padcol card");
  const ph = el("div", "card-head");
  ph.appendChild(el("span", "card-title", t("Panel")));
  dom.panelPick = el("button", "picker", null, { type: "button" });
  dom.panelPick.addEventListener("click", () => openPanelMenu(dom.panelPick));
  ph.appendChild(dom.panelPick);
  ph.appendChild(el("span", "flex"));
  ph.appendChild(textBtn(t("Edit"), () => go("panel", { back: S.id }), "small quiet"));
  padcol.appendChild(ph);
  const padHost = el("div", "pad-host");
  padcol.appendChild(padHost);
  dom.padcol = padcol;
  dom.insp = el("div", "inspector");
  padcol.appendChild(dom.insp);
  board.appendChild(padcol);

  // Colonne d'analyse (onglets)
  const side = el("section", "side card");
  dom.sideTabs = el("div", "tabs");
  [["codes", "tag", t("Codes")], ["details", "info", t("Details")], ["last", "clock", t("Last tags")], ["lists", "list", t("Playlists")], ["sum", "report", t("Summary")]].forEach(([k, ic, lab]) => {
    const b = el("button", "", null, { type: "button", title: lab }); b.dataset.tab = k; b.innerHTML = icon(ic, 16) + "<span>" + lab + "</span>";
    b.addEventListener("click", () => setTab(k)); dom.sideTabs.appendChild(b);
  });
  side.appendChild(dom.sideTabs);
  dom.sideBody = el("div", "side-body");
  side.appendChild(dom.sideBody);
  dom.detailsHost = el("div", "details-host");
  board.appendChild(side);
  dom.side = side;

  // Timeline
  const tlc = el("section", "tlcol card");
  const bar = el("div", "tl-bar");
  dom.tlFilter = iconBtn("filter", t("Filter the timeline"), (e) => filterMenu(e.currentTarget));
  bar.append(dom.tlFilter, iconBtn("prev", t("Previous tag"), () => jump(-1)), iconBtn("next", t("Next tag"), () => jump(1)), el("span", "sep"));
  dom.sel = el("span", "tl-sel");
  bar.appendChild(dom.sel);
  dom.editBar = el("span", "tl-editbar");
  bar.appendChild(dom.editBar);
  bar.appendChild(el("span", "flex"));
  dom.pps = el("span", "pps muted small");
  dom.zoom = el("input", "zoom", null, { type: "range", min: "1", max: "60", step: "0.1", "aria-label": t("Timeline zoom") });
  dom.zoom.addEventListener("input", () => tl.setZoom(Number(dom.zoom.value)));
  bar.append(dom.pps, iconBtn("zout", t("Zoom out"), () => tl.setZoom(tl.zoom / 1.5)), dom.zoom, iconBtn("zin", t("Zoom in"), () => tl.setZoom(tl.zoom * 1.5)));
  tlc.appendChild(bar);
  const tlHost = el("div", "tl-host");
  tlc.appendChild(tlHost);
  board.appendChild(tlc);
  root.appendChild(board);

  // ---- Composants
  player = new Player(video);
  player.on("ready", onVideoReady);
  player.on("error", () => { toast(t("This video cannot be played here. Try an MP4 file.")); renderStage(); });
  player.on("state", renderTransport);
  player.on("time", onTime);
  pad = new Pad(padHost, { mode: "code", onTap: tapButton });
  tl = new Timeline(tlHost, {
    match: M,
    onSelect: (tg, play) => { select(tg.id); if (play) playTag(tg); },
    onSeek: (sec) => { if (isVideo(M()) && player.ready) { player.stopClips(); player.seek(sec); } },
    onEdit: (tg, span) => mutateTag(t("Edit clip"), tg.id, (x, m) => setSpan(m, x, span)),
    onEditMode: renderSelection,
    onRenameRow: renameRow,
    onZoom: renderZoom,
    isStar
  });
  bindStore();
  S.built = true;
}

/* =================================================================== Ouverture */
export function initMatchView(nav) { go = nav; }

export function openMatch(id, opts) {
  if (!S.built) build();
  const m = store.get(id); if (!m) { go("home"); return; }
  if (S.id !== id) { player.unload(); S.cur = null; S.open = null; S.list = null; tl.setEditing(null); tl.filter.hidden = new Set(); }
  S.id = id;
  if (opts && opts.projectId) S.projectId = opts.projectId;
  const p = project(); if (p) { S.projectId = p.id; if (p.last !== id) store.mutate(p.id, "", (x) => { x.last = id; return { type: "pos" }; }, { history: false }); }
  try { S.layout = localStorage.getItem("rl2.layout") === "ana" ? "ana" : "code"; } catch (e) { /* rien */ }
  renderAll();
  if (opts && opts.file) loadVideo(opts.file, false);
  else if (isVideo(m) && !player.ready) loadStoredVideo(m);
  requestWake();
}
export function leaveMatch() {
  savePos(true);
  player && player.unload();
  clearInterval(S.liveTimer); S.liveTimer = 0;
  S.id = null;
  releaseWake();
}

function renderAll() {
  const m = M(); if (!m) return;
  setLayout(S.layout, true);
  renderTop();
  pad.render(); renderCounts();
  renderPanelName();
  tl.build();
  tl.setDuration(axisDuration(m, player.duration));
  renderStage();
  renderSelection();
  renderSide();
  renderHistory(store.historyState());
}

/* =================================================================== Store → écran */
function bindStore() {
  store.on("tag:add", (e) => { if (e.id !== S.id) return; const m = M(), tg = findTag(m, e.tagId); if (!tg) return; tl.addTag(tg); bumpCount(tg); addMark(tg); select(tg.id); renderLastStrip(); renderScore(); sideSoon(); });
  store.on("tag:update", (e) => { if (e.id !== S.id) return; const m = M(), tg = findTag(m, e.tagId); if (!tg) return; if (e.quiet) { sideSoon(); return; } tl.updateTag(tg); if (e.recount) renderCounts(); renderMarks(); renderSelection(); renderScore(); sideSoon(); });
  store.on("tag:remove", (e) => { if (e.id !== S.id) return; tl.removeTag(e.tagId); if (S.cur === e.tagId) S.cur = null; renderCounts(); renderMarks(); renderSelection(); renderLastStrip(); renderScore(); sideSoon(); });
  store.on("match", (e) => { if (e.id !== S.id) return; renderTop(); renderStage(); tl.build(); renderSelection(); renderMarks(); sideSoon(); });
  store.on("panel", () => { if (!S.id) return; pad.render(); renderCounts(); renderPanelName(); tl.build(); sideSoon(); });
  store.on("restore", (e) => { if (!S.id) return; if (e.id === S.id || e.id === "panels" || e.id === S.projectId) renderAll(); });
  store.on("doc", (e) => { if (S.id && e.kind === "project") renderTop(); });
  store.on("history", renderHistory);
  store.on("save", (e) => {
    if (!dom.saveState) return;
    dom.saveState.textContent = e.state === "error" ? t("Not saved!") : (e.state === "saving" ? t("Saving…") : t("Saved"));
    dom.saveState.classList.toggle("error", e.state === "error");
    if (e.state === "error") toast(t("Saving failed on this device. Export a backup now (⋯ → Export)."));
  });
}
function renderHistory(h) {
  if (!dom.undo) return;
  dom.undo.disabled = !h.canUndo; dom.redo.disabled = !h.canRedo;
  dom.undo.title = h.canUndo ? t("Undo") + " : " + h.undoLabel : t("Undo");
  dom.redo.title = h.canRedo ? t("Redo") + " : " + h.redoLabel : t("Redo");
}
function doUndo() { const s = store.undo(); if (s) toast(t("Undone: {a}", { a: s.label })); }
function doRedo() { const s = store.redo(); if (s) toast(t("Redone: {a}", { a: s.label })); }

/* =================================================================== Barre du haut */
function renderTop() {
  const m = M(); if (!m) return;
  dom.title.innerHTML = "";
  dom.title.appendChild(el("b", "", m.home + " – " + m.away));
  const p = project();
  dom.title.appendChild(el("small", "", [m.date ? m.date.split("-").reverse().join("/") : "", p ? p.name : ""].filter(Boolean).join(" · ")));
  dom.title.insertAdjacentHTML("beforeend", icon("chevd", 14));
  renderScore();
  dom.tabs.textContent = "";
  if (p) {
    projectMatches(p).forEach((x) => {
      const b = el("button", "ptab" + (x.id === m.id ? " on" : ""), null, { type: "button", title: x.home + " – " + x.away });
      if (vault.meta(x.id)) b.appendChild(el("i", "dot"));
      b.appendChild(document.createTextNode(shortLabel(p, x)));
      b.addEventListener("click", () => { if (x.id !== S.id) { savePos(true); openMatch(x.id, { projectId: p.id }); } });
      dom.tabs.appendChild(b);
    });
    const add = el("button", "ptab add", "+", { type: "button", title: t("Add a match to the project") });
    add.addEventListener("click", () => go("projects", { editProject: p.id }));
    dom.tabs.appendChild(add);
  }
  dom.sortBtn.disabled = !p;
}
function renderScore() {
  const m = M(); if (!m) return;
  const s = score(m);
  dom.score.textContent = s.for + " – " + s.against;
  dom.score.title = t("Score from the GOAL / GOAL CONCEDED buttons");
}
function matchMenu(anchor) {
  const m = M(), p = project(), items = [];
  if (p) projectMatches(p).forEach((x) => items.push([x.home + " – " + x.away, () => { savePos(true); openMatch(x.id, { projectId: p.id }); }, false, x.id === m.id]));
  if (items.length) items.push(null);
  items.push([t("My projects"), () => go("projects")], [t("New match"), () => go("new")], [t("Rename match"), renameMatch]);
  menu(anchor, items);
}
async function renameMatch() {
  const m = M();
  const box = el("div", "form-grid");
  const fh = el("input", "", null, { maxlength: "30" }); fh.value = m.home;
  const fa = el("input", "", null, { maxlength: "30" }); fa.value = m.away;
  const fd = el("input", "", null, { type: "date" }); fd.value = m.date || "";
  const fc = el("input", "", null, { maxlength: "40" }); fc.value = m.comp || "";
  [[t("Home team"), fh], [t("Away team"), fa], [t("Date"), fd], [t("Competition"), fc]].forEach(([l, i]) => { const f = el("label", "field"); f.append(el("span", "", l), i); box.appendChild(f); });
  const ok = await modal(t("Match details"), box, [{ label: t("Cancel"), value: false }, { label: t("Save"), value: true, primary: true }]);
  if (!ok) return;
  store.mutate(m.id, t("Match details"), (x) => { x.home = fh.value.trim() || x.home; x.away = fa.value.trim() || x.away; x.date = fd.value; x.comp = fc.value.trim(); return { type: "match" }; });
}
function moreMenu(anchor) {
  const m = M(), vid = isVideo(m), ready = vid && player.ready, items = [];
  if (vid) items.push([t("Change the video"), pickVideo]);
  if (ready) {
    items.push([t("Kick-off here"), () => setMarker("k1")], [t("2nd half starts here"), () => setMarker("k2")]);
    items.push([t("Full screen"), fullScreen]);
  }
  items.push(null, [t("Edit the panel"), () => go("panel", { back: S.id })], [t("Show all rows"), () => { tl.setFilter({ hidden: new Set(), hideEmpty: false, side: "all", starOnly: false }); S.starOnly = false; sideSoon(); }]);
  items.push(null, [t("Export…"), () => exportDialog()], [t("Save now"), () => store.flush().then(() => toast(t("Saved on this device.")))]);
  menu(anchor, items);
}

/* =================================================================== Mise en page */
function setLayout(k, silent) {
  S.layout = k;
  dom.board.dataset.layout = k;
  [...dom.seg.children].forEach((b) => b.classList.toggle("on", b.dataset.lay === k));
  try { localStorage.setItem("rl2.layout", k); } catch (e) { /* rien */ }
  // Le bloc « détails du tag » est sous le panel en codage, dans l'onglet Details en analyse.
  if (k === "code") dom.padcol.appendChild(dom.insp); else dom.detailsHost.appendChild(dom.insp);
  if (!silent) { requestAnimationFrame(() => { pad.fit(); tl.layout(); }); renderSide(); }
}
function setTab(k) { S.tab = k; renderSide(); }

/* =================================================================== Vidéo et transport */
function renderStage() {
  const m = M(); if (!m) return;
  const vid = isVideo(m);
  dom.board.dataset.mode = vid ? "video" : "live";
  dom.vbox.hidden = !vid; dom.seek.hidden = !vid;
  if (vid) {
    const loading = S.loadingVault === m.id;
    dom.ask.hidden = player.ready;
    dom.askText.textContent = loading ? t("Opening the video saved on this device…") : (m.video.name ? t("Choose the video of this match again: {n}", { n: m.video.name }) : t("Choose the video of the match to start tagging."));
    dom.askBtn.hidden = loading;
  }
  pad.setEnabled(vid ? player.ready : m.clock.phase === "live");
  renderTransport();
  if (!vid) startLiveTimer(); else { clearInterval(S.liveTimer); S.liveTimer = 0; }
}
function renderTransport() {
  const m = M(); if (!m) return;
  const box = dom.transport; box.textContent = "";
  const clock = el("span", "clock"); dom.clock = clock;
  const sub = el("span", "clock-sub"); dom.clockSub = sub;
  if (isVideo(m)) {
    if (!player.ready) { box.append(clock, sub); onTime(); renderLastStrip(); return; }
    box.append(
      iconBtn("rew", t("Back 20 s"), () => player.skip(-20)), iconBtn("prev", t("Back 5 s"), () => player.skip(-5)),
      iconBtn(player.paused ? "play" : "pause", player.paused ? t("Play") : t("Pause"), () => player.toggle(), "main"),
      iconBtn("next", t("Forward 5 s"), () => player.skip(5)), iconBtn("ff", t("Forward 20 s"), () => player.skip(20)),
      clock, sub);
    const rates = el("span", "seg small");
    RATES.forEach((r) => { const b = el("button", player.rate === r ? "on" : "", "×" + String(r).replace(".", t(".")), { type: "button" }); b.addEventListener("click", () => { player.setRate(r); renderTransport(); }); rates.appendChild(b); });
    box.append(el("span", "flex"), rates, iconBtn(player.v.muted ? "mute" : "sound", player.v.muted ? t("Sound on") : t("Mute"), () => player.toggleMute()));
  } else {
    const c = m.clock;
    const act = (label, fn, cls) => box.appendChild(textBtn(label, fn, cls));
    box.append(clock, sub);
    if (c.phase === "pre") act(t("Kick-off"), () => clock_("kickoff"), "primary");
    else if (c.phase === "live") {
      act("− 10 s", () => clock_("minus"), "small"); act("+ 10 s", () => clock_("plus"), "small");
      act(c.running ? t("Pause") : t("Resume"), () => clock_(c.running ? "pause" : "resume"), c.running ? "" : "primary");
      act(c.period === 1 ? t("Half-time") : (c.period === 3 ? t("End of period") : t("Full time")), () => clock_("end"));
    } else if (c.phase === "break") act(t("Start {p}", { p: t(PERIODS[c.period + 1].name) }), () => clock_("next"), "primary");
    else if (c.period === 2) act(t("Play extra time"), () => clock_("next"));
    if (!m.tags.length && c.phase === "pre") act(t("Tag a video instead"), () => store.mutate(m.id, t("Tag a video instead"), (x) => { x.mode = "video"; return { type: "match" }; }), "quiet");
  }
  box.appendChild(el("span", "flex"));
  dom.last = el("span", "last-strip"); box.appendChild(dom.last);
  renderLastStrip();
  onTime();
}
function onTime() {
  const m = M(); if (!m || !dom.clock) return;
  let now;
  if (isVideo(m)) {
    now = player.ready ? player.time : (m.video.pos || 0);
    dom.clock.textContent = fmtLong(now) + (player.duration ? " / " + fmtLong(player.duration) : "");
    const p = m.video.k1 != null || m.video.k2 != null ? t(PERIODS[m.video.k2 != null && now >= m.video.k2 ? 2 : 1].name) + " " + fmt(matchSeconds(m, { at: now })) : "";
    dom.clockSub.textContent = p;
    if (player.duration) dom.seekFill.style.transform = `scaleX(${now / player.duration})`;
    tl.setPlayhead(now, !player.paused);
    if (!player.paused) savePos(false);
  } else {
    now = liveSeconds(m);
    dom.clock.textContent = fmt(now);
    const c = m.clock;
    dom.clockSub.textContent = c.phase === "pre" ? t("Before kick-off") : (c.phase === "done" ? t("Full time") : t(PERIODS[c.period].name) + (c.running ? "" : " · " + t("paused")));
    if (now + 30 > tl.dur) tl.setDuration(axisDuration(m));
    tl.setPlayhead(now, c.running);
  }
}
function startLiveTimer() { if (!S.liveTimer) S.liveTimer = setInterval(() => { const m = M(); if (m && !isVideo(m) && m.clock.running) onTime(); }, 250); }
function clock_(a) {
  const m = M();
  store.mutate(m.id, t("Clock"), (x) => {
    const c = x.clock, now = clockMs(x);
    const start = () => { if (!c.running) { c.running = true; c.startedAt = Date.now(); } };
    const stop = () => { if (c.running) { c.acc = clockMs(x); c.running = false; c.startedAt = 0; } };
    if (a === "kickoff") { c.period = 1; c.phase = "live"; c.acc = 0; c.running = false; start(); }
    else if (a === "pause") stop();
    else if (a === "resume") start();
    else if (a === "end") { stop(); c.phase = c.period === 1 || c.period === 3 ? "break" : "done"; }
    else if (a === "next") { c.period = Math.min(4, c.period + 1); c.phase = "live"; c.acc = 0; c.running = false; start(); }
    else if (a === "minus" || a === "plus") { const target = Math.max(0, now + (a === "plus" ? 10000 : -10000)); c.acc = target; if (c.running) c.startedAt = Date.now(); }
    return { type: "match" };
  });
}
function bindSeekbar(bar) {
  let on = false;
  const at = (e) => { if (!player.ready || !player.duration) return; const r = bar.getBoundingClientRect(); player.stopClips(); player.seek(clamp((e.clientX - r.left) / r.width, 0, 1) * player.duration); };
  bar.addEventListener("pointerdown", (e) => { on = true; try { bar.setPointerCapture(e.pointerId); } catch (x) { /* rien */ } at(e); });
  bar.addEventListener("pointermove", (e) => { if (on) at(e); });
  bar.addEventListener("pointerup", () => { on = false; });
  bar.addEventListener("pointercancel", () => { on = false; });
}
function renderMarks() {
  const m = M(); dom.seekMarks.textContent = "";
  if (!m || !isVideo(m) || !player.duration) return;
  const frag = document.createDocumentFragment();
  m.tags.forEach((tg) => frag.appendChild(markEl(tg)));
  dom.seekMarks.appendChild(frag);
}
function markEl(tg) { const i = el("i"); i.style.left = (tg.at / player.duration * 100) + "%"; i.style.background = tg.color; return i; }
function addMark(tg) { if (isVideo(M()) && player.duration) dom.seekMarks.appendChild(markEl(tg)); }

function pickVideo() {
  pickFile("video/*").then((f) => { if (f) loadVideo(f, false); });
}
function loadVideo(file, fromVault) {
  const m = M(); if (!m) return;
  player.loadFile(file);
  if (m.video.name !== file.name || m.mode !== "video") store.mutate(m.id, "", (x) => { if (x.video.name && x.video.name !== file.name) x.video.pos = 0; x.video.name = file.name; x.mode = "video"; return { type: "match" }; }, { history: false });
  if (!fromVault) {
    const meta = vault.meta(m.id);
    if (!meta || meta.size !== file.size) {
      const id = m.id;
      (meta ? vault.remove(id) : Promise.resolve()).then(() => vault.save(id, file, renderVault, (ok, why) => {
        if (ok) toast(t("Video kept on this device: no need to choose it again."));
        else if (why === "quota") toast(t("Not enough space to keep this video on the device. It stays playable for this session."));
        renderTop();
      }));
    }
  }
}
function renderVault(job) {
  dom.vaultBadge.hidden = !(job && job.id === S.id);
  if (job) dom.vaultBadge.textContent = t("Keeping the video on this device… {p} %", { p: Math.round(job.p * 100) });
}
function loadStoredVideo(m) {
  if (!vault.meta(m.id)) { renderStage(); return; }
  S.loadingVault = m.id; renderStage();
  vault.get(m.id).then((f) => {
    S.loadingVault = null;
    if (S.id !== m.id) return;
    if (f) loadVideo(f, true); else renderStage();
  });
}
function onVideoReady() {
  const m = M(); if (!m) return;
  const pos = m.video.pos || 0;
  if (pos > 0 && pos < player.duration - 1) player.seek(pos);
  tl.setDuration(player.duration);
  if (!localStorage.getItem("rl2.tlZoomSet") && player.duration > 60) {
    try { localStorage.setItem("rl2.tlZoomSet", "1"); } catch (e) { /* rien */ }
    tl.setZoom(clamp(Math.round(6 * player.duration / Math.max(300, tl.scroll.clientWidth - 190)), 1, 60));
  }
  renderStage(); renderMarks(); renderZoom();
  if (m.tags.length && m.video.k1 == null && m.video.k2 == null && !S.markerHint) {
    S.markerHint = true;
    toast(t("Tip: set the kick-off and 2nd half markers (⋯ menu) to split the tags by half."));
  }
}
function savePos(force) {
  const m = M(); if (!m || !isVideo(m) || !player || !player.ready) return;
  const now = Date.now();
  if (!force && now - S.lastPos < 10000) return;
  S.lastPos = now;
  const pos = Math.floor(player.time);
  if (pos !== m.video.pos) store.mutate(m.id, "", (x) => { x.video.pos = pos; return { type: "pos" }; }, { history: false });
}
function setMarker(k) {
  const m = M(), v = Math.floor(player.time);
  if (k === "k2" && v <= (m.video.k1 || 0)) { toast(t("The 2nd half must start after the kick-off.")); return; }
  store.mutate(m.id, k === "k1" ? t("Kick-off marker") : t("2nd half marker"), (x) => {
    if (k === "k1") { x.video.k1 = v; if (x.video.k2 != null && x.video.k2 <= v) x.video.k2 = null; } else x.video.k2 = v;
    return { type: "match" };
  });
  toast((k === "k1" ? t("Kick-off") : t("2nd half")) + " : " + fmtLong(v));
}
function capture() {
  player.capture().then((b) => { if (!b) { toast(t("Open the video first.")); return; } const m = M(); downloadFile(baseName(m) + "_" + fmtLong(player.time).replace(/:/g, "-") + ".png", b); });
}
function fullScreen() {
  if (document.fullscreenElement) { document.exitFullscreen(); return; }
  if (dom.vbox.requestFullscreen) dom.vbox.requestFullscreen().catch(() => {}); else if (player.v.webkitEnterFullscreen) player.v.webkitEnterFullscreen();
}

/* =================================================================== Codage */
function tapButton(btn) {
  const m = M(); if (!m) return;
  let at;
  if (isVideo(m)) { if (!player.ready) return; at = player.time; player.stopClips(); }
  else { if (m.clock.phase !== "live") return; at = liveSeconds(m); }
  const tg = makeTag(m, btn, at);
  store.mutate(m.id, t("Tag {l}", { l: btn.label }), (x) => { x.tags.push(tg); return { type: "tag:add", tagId: tg.id }; });
}
function mutateTag(label, id, fn, opts) {
  return store.mutate(S.id, label, (m) => { const tg = findTag(m, id); if (!tg) return false; const r = fn(tg, m); return r === false ? false : Object.assign({ type: "tag:update", tagId: id }, r || {}); }, opts);
}
function setSpan(m, tg, s) {
  tg.start = Math.max(0, r1(s.start)); tg.end = Math.max(tg.start + 0.5, r1(s.end)); tg.at = clamp(r1(s.at), tg.start, tg.end);
}
function deleteTag(id) {
  const m = M(), tg = findTag(m, id); if (!tg) return;
  player.stopClips();
  store.mutate(m.id, t("Delete {l}", { l: tg.label }), (x) => {
    x.tags = x.tags.filter((y) => y.id !== id);
    x.lists.forEach((l) => { l.tagIds = l.tagIds.filter((y) => y !== id); });
    return { type: "tag:remove", tagId: id };
  });
  toast(t("Tag deleted."), { label: t("Undo"), run: doUndo });
}
function splitTag(id) {
  const m = M(), tg = findTag(m, id); if (!tg) return;
  if (tg.end - tg.start < 2) { toast(t("This clip is too short to be split.")); return; }
  let x = isVideo(m) && player.ready ? player.time : null;
  const atHead = x != null && x > tg.start + 0.5 && x < tg.end - 0.5;
  if (!atHead) x = (tg.start + tg.end) / 2;
  const copyId = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  store.mutate(m.id, t("Split clip"), (mm) => {
    const a = findTag(mm, id), b = JSON.parse(JSON.stringify(a));
    b.id = copyId; b.note = ""; b.createdAt = Date.now();
    const s = a.start, e = a.end, p = a.at;
    a.end = r1(x); a.at = clamp(p, a.start, a.end);
    b.start = r1(x); b.end = e; b.at = clamp(p, b.start, b.end);
    mm.tags.push(b);
    return { type: "match" };
  });
  toast(atHead ? t("Clip split at the playhead.") : t("Clip split in the middle."), { label: t("Undo"), run: doUndo });
}
function select(id) {
  S.cur = id; tl.setCurrent(id);
  const tg = curTag();
  pad.markSelected(tg ? (buttonForTag(tg) || {}).id : null);
  renderSelection(); sideSoon();
}
function playTag(tg) {
  const m = M();
  if (isVideo(m) && player.ready) player.playClips([clipOf(tg)], (c) => { if (c.tagId !== S.cur) select(c.tagId); });
}
function jump(dir) {
  const m = M(); if (!m) return;
  const now = isVideo(m) ? player.time : liveSeconds(m);
  const list = m.tags.slice().sort((a, b) => a.start - b.start);
  const pick = dir > 0 ? list.find((x) => x.start > now + 0.4) : list.reverse().find((x) => x.start < now - 1.5);
  if (!pick) return;
  player.stopClips(); tl.setEditing(null); select(pick.id);
  if (isVideo(m) && player.ready) player.seek(pick.start);
  tl.reveal(pick.at);
}
function renameRow(row, name) {
  const m = M();
  if (row.btn) {
    const b = row.btn;
    store.mutate("panels", t("Rename button"), (d) => {
      const p = d.items.find((i) => i.id === d.active), it = p.buttons.find((x) => x.id === b.id); if (!it) return false;
      it.label = name.slice(0, 30); return { type: "panel" };
    });
  }
  // Les tags de cette ligne prennent le nouveau nom (dans ce match).
  store.mutate(m.id, t("Rename row"), (x) => { x.tags.forEach((tg) => { if (row.tags.some((y) => y.id === tg.id)) tg.label = name.slice(0, 30); }); return { type: "match" }; });
}

/* Compteurs des boutons du panel */
function renderCounts() {
  const m = M(); if (!m) return;
  const counts = new Map();
  tagRows(m).forEach((r) => { if (r.btn) counts.set(r.btn.id, r.tags.length); });
  pad.setCounts(counts);
}
function bumpCount(tg) { const b = buttonForTag(tg); if (!b) return; const m = M(); pad.setCount(b.id, m.tags.filter((x) => buttonForTag(x) === b).length); }
function renderPanelName() { const p = activePanel(); dom.panelPick.innerHTML = ""; dom.panelPick.append(el("span", "", p.name)); dom.panelPick.insertAdjacentHTML("beforeend", icon("chevd", 14)); }

function renderLastStrip() {
  const m = M(); if (!m || !dom.last) return;
  dom.last.textContent = "";
  const lt = m.tags.length ? m.tags.reduce((a, b) => ((b.createdAt || 0) >= (a.createdAt || 0) ? b : a)) : null;
  dom.last.appendChild(el("span", "muted small", t("Last tag")));
  if (!lt) { dom.last.appendChild(el("span", "muted small", "—")); return; }
  const sw = el("i", "sw"); sw.style.background = lt.color;
  const nm = el("button", "last-name", lt.label + " · " + fmt(matchSeconds(m, lt)), { type: "button" });
  nm.addEventListener("click", () => { select(lt.id); playTag(lt); });
  dom.last.append(sw, nm, iconBtn("trash", t("Delete the last tag"), () => deleteTag(lt.id), "small"));
}

/* =================================================================== Détails du tag (inspecteur) */
function renderSelection() {
  const m = M(); if (!m) return;
  const tg = curTag();
  // Barre de la timeline
  dom.sel.textContent = "";
  dom.editBar.textContent = "";
  if (tg) {
    dom.sel.appendChild(el("b", "", tg.label));
    dom.sel.appendChild(el("span", "muted", " " + fmt(matchSeconds(m, tg)) + " · " + (Math.round((pre(tg) + post(tg)) * 10) / 10) + " s"));
    const p = project();
    if (p) dom.editBar.appendChild(iconBtn(isStar(tg) ? "star" : "staro", isStar(tg) ? t("Unstar") : t("Star this clip"), () => toggleStar(tg), isStar(tg) ? "starred" : ""));
    if (isVideo(m) && player.ready) dom.editBar.appendChild(iconBtn("play", t("Play the clip"), () => playTag(tg)));
    dom.editBar.append(iconBtn("cut", t("Split"), () => splitTag(tg.id)), iconBtn("trash", t("Delete"), () => deleteTag(tg.id)));
    if (tl.editing === tg.id) dom.editBar.appendChild(textBtn(t("Done"), () => tl.setEditing(null), "small primary"));
  } else dom.sel.appendChild(el("span", "muted", t("No clip selected. Tap a clip once to play it, twice to move or trim it.")));
  renderInspector();
}
function renderInspector() {
  const m = M(), box = dom.insp, tg = curTag();
  requestAnimationFrame(() => pad.fit());
  box.textContent = "";
  if (!tg) { box.appendChild(el("p", "muted small insp-empty", t("Tap a button: the tag is recorded at once. Result, zone and note are optional."))); return; }
  const head = el("div", "insp-head");
  const sw = el("i", "sw"); sw.style.background = tg.color;
  head.append(sw, el("b", "", tg.label), el("span", "mono muted", fmt(matchSeconds(m, tg))), el("span", "badge", tg.side === "without" ? t("Without ball") : t("With ball")));
  head.appendChild(el("span", "flex"));
  head.appendChild(iconBtn("trash", t("Delete the tag"), () => deleteTag(tg.id), "small"));
  box.appendChild(head);
  // Résultat
  const btn = buttonForTag(tg);
  const opts = btn && btn.res.length ? btn.res : [t("Success"), t("Fail")];
  const res = el("div", "chips");
  opts.forEach((r) => {
    const b = el("button", "chip" + (tg.result === r ? " on" : ""), r, { type: "button" });
    b.addEventListener("click", () => mutateTag(t("Result"), tg.id, (x) => { x.result = x.result === r ? "" : r; }));
    res.appendChild(b);
  });
  box.appendChild(res);
  // Durée du clip
  const clip = el("div", "clip-row");
  const step = (label, fn) => { const b = el("button", "", label, { type: "button" }); b.addEventListener("click", () => mutateTag(t("Clip length"), tg.id, fn)); return b; };
  const sp = el("span", "stepper");
  sp.append(step("−", (x) => { x.start = Math.min(x.at, r1(x.start + 1)); }), el("span", "", t("{s} s before", { s: String(Math.round(pre(tg) * 10) / 10) })), step("+", (x) => { x.start = Math.max(0, r1(x.start - 1)); }));
  const sp2 = el("span", "stepper");
  sp2.append(step("−", (x) => { x.end = Math.max(x.at, r1(x.end - 1)); }), el("span", "", t("{s} s after", { s: String(Math.round(post(tg) * 10) / 10) })), step("+", (x) => { x.end = r1(x.end + 1); }));
  clip.append(sp, sp2);
  if (isVideo(m) && player.ready) {
    clip.appendChild(textBtn(t("End here"), () => { const now = player.time; if (now < tg.at) { toast(t("The end of the clip must be after the tagged moment.")); return; } mutateTag(t("End here"), tg.id, (x) => { x.end = r1(now); }); }, "small"));
    clip.appendChild(textBtn(t("Export clip"), () => exportVideo([tg], tg.label + "-" + fmt(matchSeconds(m, tg)).replace(":", "m")), "small"));
  }
  box.appendChild(clip);
  // Zone, note, équipe
  const more = el("div", "insp-more");
  const pitch = el("div", "pitch");
  pitch.innerHTML = '<svg viewBox="0 0 105 68" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="rgba(255,255,255,.3)" stroke-width=".6" vector-effect="non-scaling-stroke"><rect x="1" y="1" width="103" height="66"/><line x1="52.5" y1="1" x2="52.5" y2="67"/><circle cx="52.5" cy="34" r="9.15"/><rect x="1" y="13.85" width="16.5" height="40.3"/><rect x="87.5" y="13.85" width="16.5" height="40.3"/></g></svg>';
  const zones = el("div", "zones");
  LANES.forEach((lane, li) => THIRDS.forEach((third, ti) => {
    const on = tg.zone && tg.zone.third === ti && tg.zone.lane === li;
    const z = el("button", on ? "on" : "", null, { type: "button", title: t(third) + " · " + t(lane), "aria-label": t(third) + " · " + t(lane) });
    z.addEventListener("click", () => mutateTag(t("Zone"), tg.id, (x) => { x.zone = on ? null : { third: ti, lane: li }; }));
    zones.appendChild(z);
  }));
  pitch.appendChild(zones);
  const right = el("div", "insp-right");
  const note = el("textarea", "note", null, { maxlength: "200", rows: "2", placeholder: t("Note (optional)"), "aria-label": t("Note") });
  note.value = tg.note || "";
  const saveNote = debounce(() => mutateTag("", tg.id, (x) => { x.note = note.value.slice(0, 200); return { quiet: true }; }, { history: false }), 400);
  note.addEventListener("input", saveNote);
  right.append(note, el("p", "muted small", t("Attack direction: left to right")));
  right.appendChild(textBtn(tg.side === "without" ? t("Move to With ball") : t("Move to Without ball"), () => mutateTag(t("Change phase"), tg.id, (x) => { x.side = x.side === "with" ? "without" : "with"; return { recount: true }; }), "small"));
  const addL = textBtn(t("+ Playlist"), (e) => addToListMenu(e.currentTarget, tg), "small");
  right.appendChild(addL);
  more.append(pitch, right);
  // En codage, zone et note sont repliées pour laisser la place au panel.
  if (S.layout === "code") {
    more.hidden = !S.moreOpen;
    const tg2 = textBtn((S.moreOpen ? "▾ " : "▸ ") + t("Zone, note, playlist"), () => { S.moreOpen = !S.moreOpen; renderInspector(); requestAnimationFrame(() => pad.fit()); }, "small quiet insp-toggle");
    box.appendChild(tg2);
  }
  box.appendChild(more);
}
function toggleStar(tg) {
  const p = project(), m = M(); if (!p) return;
  store.mutate(p.id, t("Star clip"), (x) => { x.stars = x.stars || {}; const k = starKey(m, tg); if (x.stars[k]) delete x.stars[k]; else x.stars[k] = true; return { type: "doc" }; });
  renderSelection(); sideSoon();
  if (S.starOnly) tl.applyFilter();
}

/* =================================================================== Colonne d'analyse */
let sideQueued = false;
function sideSoon() { if (sideQueued) return; sideQueued = true; requestAnimationFrame(() => { sideQueued = false; renderSide(); }); }
function renderSide() {
  if (S.layout !== "ana") return;
  [...dom.sideTabs.children].forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
  const body = dom.sideBody, keep = body.scrollTop;
  if (S.tab === "details" && dom.detailsHost.parentNode === body) return; // ne pas faire perdre le focus de la note
  body.textContent = "";
  const m = M(); if (!m) return;
  if (S.tab === "codes") renderCodes(body, m);
  else if (S.tab === "details") body.appendChild(dom.detailsHost);
  else if (S.tab === "last") renderLast(body, m);
  else if (S.tab === "lists") renderLists(body, m);
  else renderSummary(body, m);
  body.scrollTop = keep;
}
function renderCodes(body, m) {
  const rows = tagRows(m), cur = curTag();
  const bar = el("div", "row-tools");
  const star = el("button", "chip" + (S.starOnly ? " on" : ""), null, { type: "button" }); star.innerHTML = icon("star", 14) + " " + t("Starred only");
  star.addEventListener("click", () => { if (!project()) { toast(t("Add this match to a project to star clips.")); return; } S.starOnly = !S.starOnly; tl.setFilter({ starOnly: S.starOnly }); renderSide(); });
  bar.appendChild(star);
  const total = rows.reduce((n, r) => n + r.tags.filter((x) => !S.starOnly || isStar(x)).length, 0);
  bar.appendChild(el("span", "muted small", tn(total, "{n} tag", "{n} tags")));
  body.appendChild(bar);
  const list = el("div", "codes");
  rows.forEach((r) => {
    const tags = r.tags.filter((x) => !S.starOnly || isStar(x));
    const hidden = tl.filter.hidden.has(r.key);
    const row = el("div", "code-row" + (S.open === r.key ? " open" : "") + (cur && r.tags.includes(cur) ? " sel" : ""));
    const ck = el("button", "ck" + (hidden ? "" : " on"), null, { type: "button", title: hidden ? t("Show this row") : t("Hide this row") }); ck.innerHTML = hidden ? "" : icon("check", 12);
    ck.addEventListener("click", () => { const h = new Set(tl.filter.hidden); if (h.has(r.key)) h.delete(r.key); else h.add(r.key); tl.setFilter({ hidden: h }); renderSide(); });
    const open = el("button", "code-open", null, { type: "button" });
    open.innerHTML = icon(S.open === r.key ? "chevd" : "chevr", 12);
    const sw = el("i", "sw"); sw.style.background = r.color;
    open.append(el("span", "n", String(r.n)), sw, el("span", "nm", r.label), el("span", "ct", String(tags.length)));
    open.addEventListener("click", () => { S.open = S.open === r.key ? null : r.key; renderSide(); });
    row.append(ck, open);
    list.appendChild(row);
    if (S.open === r.key) {
      if (!tags.length) list.appendChild(el("div", "clip-item none muted small", t("No clip.")));
      tags.forEach((tg, i) => {
        const c = el("button", "clip-item" + (tg.id === S.cur ? " on" : ""), null, { type: "button" });
        c.append(el("span", "n", String(i + 1)), el("span", "mono", fmt(matchSeconds(m, tg))));
        if (isStar(tg)) c.insertAdjacentHTML("beforeend", icon("star", 12));
        c.appendChild(el("span", "x muted", [tg.result, tg.note].filter(Boolean).join(" · ")));
        c.addEventListener("click", () => { tl.setEditing(null); select(tg.id); playTag(tg); });
        list.appendChild(c);
      });
    }
  });
  body.appendChild(list);
}
function renderLast(body, m) {
  if (!m.tags.length) { body.appendChild(el("p", "muted empty", t("No tag yet. Start the video or the clock, then tap a button of the panel."))); return; }
  const ul = el("ul", "tag-list");
  m.tags.slice().sort((a, b) => b.at - a.at).forEach((tg) => {
    const li = el("li", tg.id === S.cur ? "on" : "");
    const tm = el("button", "mono tm", fmt(matchSeconds(m, tg)), { type: "button", title: t("Play the clip") });
    tm.addEventListener("click", () => { select(tg.id); playTag(tg); });
    const sw = el("i", "sw"); sw.style.background = tg.color;
    const what = el("button", "what", null, { type: "button" });
    what.appendChild(el("b", "", tg.label));
    const bits = [tg.zone ? t(THIRDS[tg.zone.third]) + ", " + t(LANES[tg.zone.lane]) : "", tg.result, tg.note ? "“" + tg.note + "”" : ""].filter(Boolean);
    what.appendChild(el("small", "muted", bits.join(" / ")));
    what.addEventListener("click", () => select(tg.id));
    li.append(tm, sw, what, iconBtn("list", t("+ Playlist"), (e) => addToListMenu(e.currentTarget, tg), "small"), iconBtn("trash", t("Delete"), () => deleteTag(tg.id), "small"));
    ul.appendChild(li);
  });
  body.appendChild(ul);
}
function addToListMenu(anchor, tg) {
  const m = M();
  const items = m.lists.map((l) => [l.name + " (" + l.tagIds.length + ")", () => addToList(l.id, tg)]);
  items.push([t("New playlist"), async () => { const n = await promptBox(t("New playlist"), t("Name"), t("Playlist {n}", { n: m.lists.length + 1 })); if (!n) return; const id = "l" + Date.now().toString(36); store.mutate(m.id, t("New playlist"), (x) => { x.lists.push({ id, name: n, tagIds: [tg.id] }); return { type: "doc" }; }); S.list = id; toast(t("Added to “{n}”.", { n })); sideSoon(); }]);
  menu(anchor, items);
}
function addToList(lid, tg) {
  const m = M();
  store.mutate(m.id, t("Add to playlist"), (x) => { const l = x.lists.find((y) => y.id === lid); if (!l || l.tagIds.includes(tg.id)) return false; l.tagIds.push(tg.id); return { type: "doc" }; });
  S.list = lid; toast(t("Added to “{n}”.", { n: m.lists.find((l) => l.id === lid).name })); sideSoon();
}
function renderLists(body, m) {
  const ls = m.lists;
  const l = ls.find((x) => x.id === S.list) || ls[0] || null;
  const bar = el("div", "row-tools");
  if (ls.length) {
    const sel = el("select", "", null, { "aria-label": t("Playlist") });
    ls.forEach((x) => { const o = el("option", "", x.name + " (" + x.tagIds.length + ")"); o.value = x.id; if (l && x.id === l.id) o.selected = true; sel.appendChild(o); });
    sel.addEventListener("change", () => { S.list = sel.value; renderSide(); });
    bar.appendChild(sel);
  }
  bar.appendChild(textBtn(t("New playlist"), async () => { const n = await promptBox(t("New playlist"), t("Name"), t("Playlist {n}", { n: ls.length + 1 })); if (!n) return; const id = "l" + Date.now().toString(36); store.mutate(m.id, t("New playlist"), (x) => { x.lists.push({ id, name: n, tagIds: [] }); return { type: "doc" }; }); S.list = id; sideSoon(); }, "small"));
  body.appendChild(bar);
  if (!l) { body.appendChild(el("p", "muted empty", t("No playlist. Create one, or use “+ Playlist” on a tag."))); return; }
  const tags = listTags(m, l), canVid = isVideo(m) && player.ready;
  const acts = el("div", "row-tools");
  const play = textBtn(t("Play all"), () => player.playClips(tags.map(clipOf), (c) => select(c.tagId)), "small primary"); play.disabled = !(canVid && tags.length);
  const exp = textBtn(t("Export video"), () => exportVideo(tags, l.name), "small"); exp.disabled = !(canVid && tags.length);
  acts.append(play, exp,
    textBtn(t("Rename"), async () => { const n = await promptBox(t("Rename"), t("Name"), l.name); if (n) store.mutate(m.id, t("Rename playlist"), (x) => { x.lists.find((y) => y.id === l.id).name = n; return { type: "doc" }; }); sideSoon(); }, "small"),
    textBtn(t("Delete"), () => { store.mutate(m.id, t("Delete playlist"), (x) => { x.lists = x.lists.filter((y) => y.id !== l.id); return { type: "doc" }; }); S.list = null; sideSoon(); toast(t("Playlist deleted."), { label: t("Undo"), run: doUndo }); }, "small quiet"));
  body.appendChild(acts);
  if (!tags.length) { body.appendChild(el("p", "muted empty", t("This playlist is empty. Use “+ Playlist” on a tag."))); return; }
  const ul = el("ul", "tag-list");
  tags.forEach((tg) => {
    const li = el("li", tg.id === S.cur ? "on" : "");
    const tm = el("button", "mono tm", fmt(matchSeconds(m, tg)), { type: "button" }); tm.addEventListener("click", () => { select(tg.id); playTag(tg); });
    const sw = el("i", "sw"); sw.style.background = tg.color;
    const what = el("span", "what"); what.append(el("b", "", tg.label), el("small", "muted", Math.round((pre(tg) + post(tg)) * 10) / 10 + " s" + (tg.result ? " / " + tg.result : "")));
    li.append(tm, sw, what, textBtn(t("Remove"), () => { store.mutate(m.id, t("Remove from playlist"), (x) => { const y = x.lists.find((z) => z.id === l.id); y.tagIds = y.tagIds.filter((z) => z !== tg.id); return { type: "doc" }; }); sideSoon(); }, "small quiet"));
    ul.appendChild(li);
  });
  body.appendChild(ul);
}
function renderSummary(body, m) {
  const rows = tagRows(m).filter((r) => r.tags.length);
  if (!rows.length) { body.appendChild(el("p", "muted empty", t("The summary fills in as you tag."))); return; }
  const tb = el("table", "sum");
  tb.innerHTML = `<thead><tr><th>#</th><th>${t("Event")}</th><th>${t("Tags")}</th><th>${t("Results")}</th></tr></thead>`;
  const body2 = el("tbody");
  rows.forEach((r) => {
    const tr = el("tr");
    tr.appendChild(el("td", "muted", String(r.n)));
    const nm = el("td"); const sw = el("i", "sw"); sw.style.background = r.color; nm.append(sw, el("span", "", r.label)); tr.appendChild(nm);
    tr.appendChild(el("td", "num", String(r.tags.length)));
    const c = new Map(); r.tags.forEach((x) => { if (x.result) c.set(x.result, (c.get(x.result) || 0) + 1); });
    tr.appendChild(el("td", "small", [...c].map(([k, v]) => k + " " + v).join(", ")));
    body2.appendChild(tr);
  });
  tb.appendChild(body2);
  body.appendChild(tb);
}

/* =================================================================== Filtres et zoom */
function filterMenu(anchor) {
  const f = tl.filter;
  menu(anchor, [
    [t("All phases"), () => applyF({ side: "all" }), false, f.side === "all"],
    [t("With ball"), () => applyF({ side: "with" }), false, f.side === "with"],
    [t("Without ball"), () => applyF({ side: "without" }), false, f.side === "without"],
    null,
    [t("Hide rows without tags"), () => applyF({ hideEmpty: !f.hideEmpty }), false, f.hideEmpty],
    [t("Starred clips only"), () => { if (!project()) { toast(t("Add this match to a project to star clips.")); return; } S.starOnly = !S.starOnly; applyF({ starOnly: S.starOnly }); }, false, S.starOnly],
    [t("Show everything"), () => { S.starOnly = false; applyF({ side: "all", hideEmpty: false, hidden: new Set(), starOnly: false }); }]
  ]);
}
function applyF(x) { tl.setFilter(x); const f = tl.filter; dom.tlFilter.classList.toggle("active", f.side !== "all" || f.hideEmpty || f.hidden.size > 0 || f.starOnly); sideSoon(); }
function renderZoom() {
  if (document.activeElement !== dom.zoom) dom.zoom.value = String(tl.zoom);
  const p = tl.pps();
  dom.pps.textContent = (p >= 10 ? Math.round(p) : Math.round(p * 10) / 10) + " px/s";
}

/* =================================================================== Exports */
function exportVideo(tags, name) {
  const m = M();
  if (!recorderOk()) { toast(t("Video export is not available on this device. Use the CSV export to cut clips in another tool.")); return; }
  if (!player.ready || !tags.length) return;
  player.stopClips();
  const msg = el("p", "dlg-text", t("Preparing…"));
  let job;
  const done = modal(t("Video export"), msg, [{ label: t("Cancel"), value: "cancel" }]);
  done.then((v) => { if (v === "cancel" && job) job.cancel(); });
  job = recordClips(player.v, tags.map(clipOf), (i, n) => { msg.textContent = t("Recording clip {i} of {n} in real time. Keep this page open and the screen on.", { i: i + 1, n }); });
  job.promise.then((blob) => {
    document.querySelector(".overlay") && document.querySelector(".overlay").remove();
    if (!blob) return;
    const file = baseName(m) + "_" + (cleanName(name) || "clips") + "." + job.ext;
    downloadFile(file, blob);
    toast(t("Video saved: {f}", { f: file }));
  }, (err) => {
    document.querySelector(".overlay") && document.querySelector(".overlay").remove();
    toast(err && err.message === "stalled" ? t("Playback stopped during recording. Try again with the page in front.") : t("The video could not be recorded."));
  });
}
export function exportDialog(matchId) {
  const m = store.get(matchId || S.id); if (!m) return;
  let sep = localStorage.getItem("rl2.sep") === "," ? "," : ";";
  const box = el("div");
  box.appendChild(el("p", "dlg-text", t("{h} – {a}, {n}. One row per tag, for Excel, Numbers or Google Sheets.", { h: m.home, a: m.away, n: tn(m.tags.length, "{n} tag", "{n} tags") })));
  const seg = el("div", "seg");
  [[";", t("Excel, French (;)")], [",", t("Standard (,)")]].forEach(([v, l]) => { const b = el("button", sep === v ? "on" : "", l, { type: "button" }); b.addEventListener("click", () => { sep = v; try { localStorage.setItem("rl2.sep", v); } catch (e) { /* rien */ } [...seg.children].forEach((c) => c.classList.toggle("on", c === b)); }); seg.appendChild(b); });
  box.appendChild(seg);
  modal(t("Export"), box, [
    { label: t("Close"), value: null },
    { label: t("Copy CSV"), value: () => { const txt = buildCsv(m, sep).replace(/^﻿/, ""); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast(t("CSV copied.")), () => toast(t("Copy is not available here."))); } },
    { label: t("Match (.json)"), value: () => saveMatchJson(m) },
    { label: t("Save CSV"), primary: true, value: () => { if (!m.tags.length) { toast(t("This match has no tag to export yet.")); return; } saveCsv(m, sep); } }
  ]);
}

/* =================================================================== Écran allumé */
let wake = null;
function requestWake() { try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then((w) => { wake = w; }, () => {}); } catch (e) { /* rien */ } }
function releaseWake() { try { if (wake) { wake.release(); wake = null; } } catch (e) { /* rien */ } }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.id) { requestWake(); onTime(); } else savePos(true); });
window.addEventListener("resize", () => { if (S.id) { pad.fit(); tl.layout(); renderZoom(); } });

export const matchViewState = S;
