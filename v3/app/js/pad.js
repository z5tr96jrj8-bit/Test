/* Panel de codage : affichage, mode Modifier (déplacer, redimensionner), inspecteur, bibliothèque de panels. */
import { $, el, uid, isHex, clampInt } from "./util.js";
import { S, cur, layout, commitLayout, begin, commit, edit, doc, save, resetLayoutCache } from "./state.js";
import { COLS, ROW_H, PAD_GAP, MAX_ROW, PRESETS, PATTERNS, isPat, defaultLayout, itemIn, teamColor, C_HOME, DEF_PRE, DEF_POST, tagButton, isVideo } from "./model.js";
import { App, paint, borderCss, toast, openPop, inlineRename, onDoubleTap } from "./ui-common.js";
import { buttonKeys, setButtonKey, labelOf, captureCombo } from "./shortcuts.js";
import { V } from "./player.js";

export function itemById(id) { return itemIn(layout(), id); }

/* ---------- Rendu ---------- */
export function renderPad(m) {
  const grid = $("event-grid"), list = layout();
  const canTag = !S.panelMode && m && (isVideo(m) ? V.ready : m.phase === "live");
  const keys = buttonKeys(list);
  const ct = S.currentTagId && m && m.tags ? m.tags.filter(function (t) { return t.id === S.currentTagId; })[0] : null;
  const ctBtn = ct ? tagButton(ct, list) : null;
  const counts = {};
  if (m && m.tags && !S.padEdit) m.tags.forEach(function (t) { if (t.status && t.status !== "accepted") return; const b = t.btn && itemIn(list, t.btn) ? itemIn(list, t.btn) : tagButton(t, list); if (b) counts[b.id] = (counts[b.id] || 0) + 1; });
  grid.textContent = "";
  grid.classList.toggle("editing", S.padEdit);
  let maxRow = 0;
  list.forEach(function (it) {
    let node;
    if (it.type === "label") {
      node = el("div", "pad-grp" + (it.color ? " filled" : ""));
      node.appendChild(el("span", "", it.label));
      if (it.color) paint(node, it.color, it.pat, it.bd, it.bw); else node.style.border = borderCss(it.bd, it.bw);
    } else {
      node = el("button", "pb" + (it.flag ? " flag" : ""));
      node.type = "button";
      paint(node, it.color, it.pat, it.bd, it.bw);
      node.appendChild(el("span", "", it.label));
      if (!S.padEdit && keys[it.id]) node.appendChild(el("span", "k", labelOf(keys[it.id])));
      if (!S.padEdit && counts[it.id]) node.appendChild(el("span", "c", String(counts[it.id])));
      node.setAttribute("aria-label", it.label + (keys[it.id] ? " (touche " + labelOf(keys[it.id]) + ")" : ""));
      if (keys[it.id]) node.title = "Touche " + labelOf(keys[it.id]);
      if (!S.padEdit) node.disabled = !canTag;
      if (!S.padEdit && ctBtn && ctBtn.id === it.id) node.classList.add("at-sel");
      if (it.dur === "toggle" && m && m.tags && m.tags.some(function (t) { return t.btn === it.id && t.open; })) node.classList.add("rec");
    }
    node.dataset.item = it.id;
    node.style.gridColumn = (it.c + 1) + " / span " + it.w;
    node.style.gridRow = (it.r + 1) + " / span " + it.h;
    if (S.padEdit && it.id === S.padSel) { node.classList.add("sel"); node.appendChild(el("span", "rs")); }
    grid.appendChild(node);
    maxRow = Math.max(maxRow, it.r + it.h);
  });
  grid.dataset.rows = maxRow;
  if (S.padEdit) { grid.style.removeProperty("--atg"); grid.style.gridTemplateRows = "repeat(" + (maxRow + 12) + ", " + ROW_H + "px)"; }
  else { grid.style.gridTemplateRows = "repeat(" + maxRow + ", " + ROW_H + "px)"; scalePad(); requestAnimationFrame(scalePad); }
  $("pad-tools").hidden = !S.padEdit; $("pad-edit-hint").hidden = !S.padEdit;
  $("events").classList.toggle("edit-mode", S.padEdit);
  $("cur-box").hidden = S.padEdit;
  const pm = $("pad-mode").children; for (let i = 0; i < pm.length; i++) pm[i].classList.toggle("on", (pm[i].dataset.pm === "edit") === S.padEdit);
  renderPicker();
  renderProps();
}
/* Même rendu que la grille d'origine (lignes de 4 px, écart 2 px), agrandi d'un seul facteur pour remplir la hauteur. */
export function scalePad() {
  const grid = $("event-grid");
  if (S.padEdit || S.panelMode || grid.offsetParent === null) return;
  const max = +grid.dataset.rows || 1, cs = getComputedStyle(grid);
  const avail = grid.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (avail <= 0) return;
  const k = Math.max(0.6, (avail + PAD_GAP) / (max * (ROW_H + PAD_GAP)));
  grid.style.setProperty("--atg", (PAD_GAP * k).toFixed(2) + "px");
  grid.style.gridTemplateRows = "repeat(" + max + ", " + (ROW_H * k).toFixed(2) + "px)";
}

/* ---------- Inspecteur ---------- */
let keyWait = false;
function renderProps() {
  const it = S.padEdit && S.padSel ? itemById(S.padSel) : null;
  $("pad-props").hidden = !it;
  $("pad-props-empty").hidden = !!it || !S.padEdit;
  if (!it) return;
  const isBtn = it.type === "button";
  const lab = $("pp-label");
  if (lab.dataset.item !== it.id || document.activeElement !== lab) { lab.value = it.label; lab.dataset.item = it.id; }
  $("pp-team-row").hidden = !isBtn || !!it.flag;
  $("pp-key-row").hidden = !isBtn;
  $("pp-res-row").hidden = !isBtn;
  $("pp-dup").hidden = !isBtn || !!it.flag;
  $("pp-pat-row").hidden = !it.color;
  $("pp-clip-row").hidden = !isBtn; $("pp-clip-note").hidden = !isBtn;
  const sw = $("pp-color");
  if (!sw.children.length) {
    const none = el("button", "no-fill", "Sans fond"); none.type = "button"; none.dataset.color = "none"; sw.appendChild(none);
    PRESETS.forEach(function (c) { const b = el("button"); b.type = "button"; b.dataset.color = c[0]; b.style.background = c[0]; b.setAttribute("aria-label", c[1]); sw.appendChild(b); });
    const l = el("label", "custom-color"); l.appendChild(el("span", "", "Autre")); const inp = el("input"); inp.type = "color"; inp.id = "pp-custom"; inp.setAttribute("aria-label", "Choisir une autre couleur"); l.appendChild(inp); sw.appendChild(l);
  }
  for (let j = 0; j < sw.children.length; j++) {
    const d = sw.children[j].dataset.color; if (!d) continue;
    if (d === "none") { sw.children[j].hidden = isBtn; sw.children[j].setAttribute("aria-pressed", String(!it.color)); }
    else sw.children[j].setAttribute("aria-pressed", String(d === it.color));
  }
  const cc = $("pp-custom"); if (cc && document.activeElement !== cc && it.color) cc.value = it.color.toLowerCase();
  const pt = $("pp-pat");
  if (!pt.children.length) PATTERNS.forEach(function (p) { const b = el("button"); b.type = "button"; b.dataset.pat = p[0]; b.setAttribute("aria-label", p[1]); b.title = p[1]; pt.appendChild(b); });
  for (let k = 0; k < pt.children.length; k++) { if (it.color) paint(pt.children[k], it.color, pt.children[k].dataset.pat); pt.children[k].setAttribute("aria-pressed", String(pt.children[k].dataset.pat === (it.pat || "none"))); }
  const bdw = $("pp-bd");
  if (!bdw.children.length) {
    const nb = el("button", "no-fill", "Par défaut"); nb.type = "button"; nb.dataset.bd = "none"; bdw.appendChild(nb);
    PRESETS.forEach(function (c) { const b = el("button"); b.type = "button"; b.dataset.bd = c[0]; b.style.background = "transparent"; b.style.border = "4px solid " + c[0]; b.setAttribute("aria-label", "Bord " + c[1]); bdw.appendChild(b); });
    const l3 = el("label", "custom-color"); l3.appendChild(el("span", "", "Autre")); const i3 = el("input"); i3.type = "color"; i3.id = "pp-bd-custom"; i3.setAttribute("aria-label", "Choisir une autre couleur de bord"); l3.appendChild(i3); bdw.appendChild(l3);
  }
  for (let q = 0; q < bdw.children.length; q++) { const dv = bdw.children[q].dataset.bd; if (!dv) continue; bdw.children[q].setAttribute("aria-pressed", String(dv === "none" ? !it.bd : dv === it.bd)); }
  const bc = $("pp-bd-custom"); if (bc && document.activeElement !== bc && it.bd) bc.value = it.bd.toLowerCase();
  const bwv = it.bw || (it.bd ? 2 : 1), bws = $("pp-bw").children;
  for (let z = 0; z < bws.length; z++) bws[z].setAttribute("aria-pressed", String(+bws[z].dataset.bw === bwv));
  if (!isBtn) return;
  $("pp-pre").textContent = (it.pre != null ? it.pre : DEF_PRE) + " s"; $("pp-post").textContent = (it.post != null ? it.post : DEF_POST) + " s";
  const tb = $("pp-team").children;
  for (let i = 0; i < tb.length; i++) tb[i].setAttribute("aria-pressed", String(tb[i].dataset.team === it.team));
  const kb = $("pp-key"), keys = buttonKeys(layout());
  kb.textContent = keyWait ? "Appuie…" : labelOf(keys[it.id]); kb.classList.toggle("wait", keyWait);
  const res = $("pp-res");
  if (res.dataset.item !== it.id || document.activeElement !== res) { res.value = it.res.join(", "); res.dataset.item = it.id; }
}

/* Modification du panel, mémorisée pour Annuler. */
function padChange(label, fn, mergeKey) {
  edit(["panel"], label, function () { fn(); commitLayout(); }, mergeKey);
  App.afterPadChange();
}
function nextFreeRow() { let r = 0; layout().forEach(function (it) { r = Math.max(r, it.r + it.h); }); return Math.min(MAX_ROW, r); }
function overlaps(a, b) { return a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.h && b.r < a.r + a.h; }
function fitToGap(it, col) {
  const others = layout().filter(function (x) { return x !== it; });
  if (!others.some(function (o) { return overlaps(it, o); })) return;
  const occ = function (c) { return others.some(function (o) { return o.c <= c && c < o.c + o.w && it.r < o.r + o.h && o.r < it.r + it.h; }); };
  col = Math.min(COLS - 1, Math.max(0, col));
  if (occ(col)) return;
  let L = col, R = col;
  while (L > 0 && !occ(L - 1)) L--;
  while (R < COLS - 1 && !occ(R + 1)) R++;
  const free = R - L + 1;
  if (free >= it.w) it.c = Math.min(R - it.w + 1, Math.max(L, it.c)); else { it.c = L; it.w = free; }
}

/* ---------- Bibliothèque de panels ---------- */
function lib() {
  let L = S.docs.panelLib;
  if (!L || L.deleted || !Array.isArray(L.items) || !L.items.length) {
    L = { id: "panelLib", kind: "panelLib", items: [{ id: uid("pl"), name: "Mon panel", buttons: [] }], updatedAt: 0 };
    L.active = L.items[0].id;
  }
  if (!L.items.some(function (i) { return i.id === L.active; })) L.active = L.items[0].id;
  return L;
}
function active(L) { for (let i = 0; i < L.items.length; i++) if (L.items[i].id === L.active) return L.items[i]; return L.items[0]; }
function snapLayout() { return JSON.parse(JSON.stringify(layout())); }
function loadPanel(L, buttons) {
  S.docs.panelLib = L;
  S.docs.panel = { id: "panel", kind: "panel", v: 4, h: 1, buttons: JSON.parse(JSON.stringify(buttons && buttons.length ? buttons : defaultLayout())), updatedAt: Date.now() };
  resetLayoutCache();
}
function libEdit(label, fn) { edit(["panel", "panelLib"], label, fn); S.padSel = null; App.afterPadChange(); }
function askName(q, def) { const n = window.prompt(q, def || ""); if (n === null) return null; const t = n.trim().slice(0, 30); return t || null; }
export function panelName() { return active(lib()).name; }
function renderPicker() {
  const L = lib(), b = $("at-pick"); b.textContent = "";
  b.appendChild(el("span", "", active(L).name));
  b.insertAdjacentHTML("beforeend", '<svg class="ic xs"><use href="#i-chevd"/></svg>');
  b.title = L.items.length + " panel" + (L.items.length > 1 ? "s" : "") + " · changer de panel";
}
function pickerMenu() {
  const L = lib(), items = L.items.map(function (i) { return [(i.id === L.active ? "✓  " : "     ") + i.name, function () { switchPanel(i.id); }]; });
  items.push(["+  Nouveau panel", function () { newPanel(false); }]);
  items.push(["Dupliquer ce panel", function () { newPanel(true); }]);
  items.push(["Renommer ce panel", renamePanel]);
  if (L.items.length > 1) items.push(["Supprimer ce panel", deletePanel, true]);
  openPop($("at-pick"), items, true);
}
function switchPanel(id) {
  const L0 = lib(); if (id === L0.active) return;
  libEdit("Changer de panel", function () {
    const L = JSON.parse(JSON.stringify(L0)); active(L).buttons = snapLayout(); L.active = id;
    loadPanel(L, active(L).buttons); L.updatedAt = Date.now();
  });
  toast("Panel « " + panelName() + " »", false);
}
function newPanel(copy) {
  const L0 = lib(), n = askName(copy ? "Nom de la copie :" : "Nom du nouveau panel :", copy ? active(L0).name + " (copie)" : "Nouveau panel"); if (!n) return;
  libEdit("Nouveau panel", function () {
    const L = JSON.parse(JSON.stringify(L0)); active(L).buttons = snapLayout();
    const it = { id: uid("pl"), name: n, buttons: copy ? snapLayout() : defaultLayout() };
    L.items.push(it); L.active = it.id; loadPanel(L, it.buttons); L.updatedAt = Date.now();
  });
  toast("Panel « " + n + " » créé", false);
}
function renamePanel() {
  const L0 = lib(), n = askName("Nouveau nom du panel :", active(L0).name); if (!n) return;
  libEdit("Renommer le panel", function () { const L = JSON.parse(JSON.stringify(L0)); active(L).name = n; active(L).buttons = snapLayout(); L.updatedAt = Date.now(); S.docs.panelLib = L; });
}
function deletePanel() {
  const L0 = lib(); if (L0.items.length < 2) return;
  const a = active(L0); if (!window.confirm("Supprimer le panel « " + a.name + " » ? Tes tags déjà posés restent.")) return;
  libEdit("Supprimer le panel", function () {
    const L = JSON.parse(JSON.stringify(L0)); L.items = L.items.filter(function (i) { return i.id !== a.id; }); L.active = L.items[0].id;
    loadPanel(L, active(L).buttons); L.updatedAt = Date.now();
  });
  toast("Panel supprimé. Panel actif : « " + panelName() + " ». Annulable.", true);
}

/* ---------- Branchements ---------- */
export function setPadEdit(on) { S.padEdit = on; S.padSel = null; App.afterPadChange(); }
export function initPad() {
  const grid = $("event-grid");
  $("at-pick").addEventListener("click", pickerMenu);
  $("pad-mode").addEventListener("click", function (e) { const b = e.target.closest("button"); if (!b) return; setPadEdit(b.dataset.pm === "edit"); });
  grid.addEventListener("click", function (e) {
    if (S.padEdit) {
      const n = e.target.closest("[data-item]"), id = n ? n.dataset.item : null;
      if (id !== S.padSel) { S.padSel = id; renderPad(cur()); }
      return;
    }
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    App.tagFromButton(b.dataset.item);
  });
  let drag = null;
  function cellAt(e) {
    const rect = grid.getBoundingClientRect(), cw = (rect.width - 16 - PAD_GAP * (COLS - 1)) / COLS;
    return { c: Math.floor((e.clientX - rect.left - 8) / (cw + PAD_GAP)), r: Math.floor((e.clientY - rect.top - 8) / (ROW_H + PAD_GAP)) };
  }
  grid.addEventListener("pointerdown", function (e) {
    if (!S.padEdit) return;
    const node = e.target.closest("[data-item]"); if (!node) return;
    const it = itemById(node.dataset.item); if (!it) return;
    if (e.pointerType !== "mouse" && it.id !== S.padSel) return;
    const cell = cellAt(e);
    drag = { it: it, node: node, mode: e.target.classList.contains("rs") ? "resize" : "move", dc: cell.c - it.c, dr: cell.r - it.r, sx: e.clientX, sy: e.clientY, moved: false, slop: e.pointerType === "mouse" ? 8 : 14, hist: begin(["panel"], "Déplacer un bouton") };
    try { node.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  grid.addEventListener("pointermove", function (e) {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < drag.slop) return;
    drag.moved = true;
    const it = drag.it, cell = cellAt(e); drag.cell = cell;
    if (drag.mode === "move") { it.c = Math.min(COLS - it.w, Math.max(0, cell.c - drag.dc)); it.r = Math.min(MAX_ROW, Math.max(0, cell.r - drag.dr)); }
    else { it.w = Math.min(COLS - it.c, Math.max(it.type === "label" ? 8 : 4, cell.c - it.c + 1)); it.h = Math.min(200, Math.max(3, cell.r - it.r + 1)); }
    drag.node.style.gridColumn = (it.c + 1) + " / span " + it.w;
    drag.node.style.gridRow = (it.r + 1) + " / span " + it.h;
    const need = it.r + it.h + 12, have = grid.style.gridTemplateRows.match(/repeat\((\d+)/);
    if (!have || +have[1] < need) grid.style.gridTemplateRows = "repeat(" + need + ", " + ROW_H + "px)";
  });
  function endDrag() {
    if (!drag) return;
    const d = drag; drag = null; S.padSel = d.it.id;
    if (d.moved) { if (d.mode === "move" && d.cell) fitToGap(d.it, d.cell.c); d.hist.label = d.mode === "move" ? "Déplacer un bouton" : "Redimensionner un bouton"; commitLayout(); commit(d.hist); App.afterPadChange(); }
    else renderPad(cur());
  }
  grid.addEventListener("pointerup", endDrag);
  grid.addEventListener("pointercancel", endDrag);
  onDoubleTap(grid, "[data-item]", function () { return S.padEdit; }, function (id) {
    const it = itemById(id); if (!it) return;
    inlineRename(grid.querySelector('[data-item="' + id + '"]'), it.label, function (v) { S.padSel = it.id; padChange("Renommer « " + it.label + " »", function () { itemById(id).label = v; }); });
  });

  $("pp-label").addEventListener("input", function () {
    const it = itemById(S.padSel); if (!it) return;
    const v = $("pp-label").value.slice(0, 30) || (it.type === "label" ? "Titre" : "Bouton");
    padChange("Renommer un bouton", function () { itemById(S.padSel).label = v; }, "pp-label:" + it.id);
  });
  $("pp-res").addEventListener("input", function () {
    const it = itemById(S.padSel); if (!it || it.type !== "button") return;
    const v = $("pp-res").value.split(",").map(function (x) { return x.trim().slice(0, 20); }).filter(Boolean).slice(0, 4);
    padChange("Résultats d'un bouton", function () { itemById(S.padSel).res = v; }, "pp-res:" + it.id);
  });
  $("pp-team").addEventListener("click", function (e) {
    const b = e.target.closest("button"), it = itemById(S.padSel); if (!b || !it || it.type !== "button") return;
    padChange("Équipe d'un bouton", function () { const x = itemById(S.padSel), wasDefault = x.color === teamColor(x.team); x.team = b.dataset.team === "away" ? "away" : "home"; if (wasDefault) x.color = teamColor(x.team); });
  });
  $("pp-key").addEventListener("click", function () {
    const it = itemById(S.padSel); if (!it) return;
    keyWait = true; renderProps();
    captureCombo(function (combo) { keyWait = false; if (combo) setButtonKey(it.id, combo); renderProps(); });
  });
  $("pp-key-clear").addEventListener("click", function () { const it = itemById(S.padSel); if (it) { setButtonKey(it.id, ""); renderProps(); } });
  $("pp-color").addEventListener("click", function (e) {
    const b = e.target.closest("button"), it = itemById(S.padSel); if (!b || !it) return;
    if (b.dataset.color === "none" && it.type === "label") padChange("Couleur", function () { itemById(S.padSel).color = ""; });
    else if (isHex(b.dataset.color)) padChange("Couleur", function () { itemById(S.padSel).color = b.dataset.color; });
  });
  $("pp-color").addEventListener("input", function (e) {
    if (e.target.id !== "pp-custom" || !isHex(e.target.value) || !itemById(S.padSel)) return;
    const v = e.target.value.toUpperCase(); padChange("Couleur", function () { itemById(S.padSel).color = v; }, "pp-color:" + S.padSel);
  });
  $("pp-pat").addEventListener("click", function (e) { const b = e.target.closest("button"); if (!b || !itemById(S.padSel) || !isPat(b.dataset.pat)) return; padChange("Motif", function () { itemById(S.padSel).pat = b.dataset.pat; }); });
  $("pp-bd").addEventListener("click", function (e) {
    const b = e.target.closest("button"); if (!b || !itemById(S.padSel)) return;
    if (b.dataset.bd === "none") padChange("Bord", function () { itemById(S.padSel).bd = ""; });
    else if (isHex(b.dataset.bd)) padChange("Bord", function () { itemById(S.padSel).bd = b.dataset.bd; });
  });
  $("pp-bd").addEventListener("input", function (e) { if (e.target.id !== "pp-bd-custom" || !isHex(e.target.value) || !itemById(S.padSel)) return; const v = e.target.value.toUpperCase(); padChange("Bord", function () { itemById(S.padSel).bd = v; }, "pp-bd:" + S.padSel); });
  $("pp-bw").addEventListener("click", function (e) { const b = e.target.closest("button"); if (!b || !itemById(S.padSel)) return; padChange("Épaisseur du bord", function () { itemById(S.padSel).bw = clampInt(b.dataset.bw, 1, 8, 2); }); });
  $("pp-clip").addEventListener("click", function (e) {
    const b = e.target.closest("button[data-ps]"), it = itemById(S.padSel); if (!b || !it || it.type !== "button") return;
    const k = b.dataset.ps, key = k.indexOf("pre") === 0 ? "pre" : "post", d = k.slice(-1) === "+" ? 1 : -1;
    padChange("Durée du clip", function () { const x = itemById(S.padSel), cv = x[key] != null ? x[key] : (key === "pre" ? DEF_PRE : DEF_POST); x[key] = Math.max(0, Math.min(60, cv + d)); });
  });
  $("pp-dup").addEventListener("click", function () {
    const it = itemById(S.padSel); if (!it || it.type !== "button") return;
    const cp = { id: uid("b"), type: "button", key: uid("k"), label: it.label, team: it.team, color: it.color, pat: it.pat || "none", bd: it.bd || "", bw: it.bw || 0, dur: "", pre: it.pre, post: it.post, res: it.res.slice(), c: it.c, r: nextFreeRow(), w: it.w, h: it.h };
    padChange("Dupliquer un bouton", function () { layout().push(cp); }); S.padSel = cp.id; App.afterPadChange();
    toast("Bouton dupliqué, en bas du panel.", false);
  });
  $("pp-del").addEventListener("click", function () {
    const it = itemById(S.padSel); if (!it) return;
    padChange("Supprimer « " + it.label + " »", function () { const l = layout(); l.splice(l.indexOf(itemById(S.padSel)), 1); }); S.padSel = null; App.afterPadChange();
    toast("Bouton supprimé.", true);
  });
  $("pad-add").addEventListener("click", function () {
    const it = { id: uid("b"), type: "button", key: uid("k"), label: "Nouveau", team: "home", color: C_HOME, pat: "none", bd: "", bw: 0, dur: "", pre: null, post: null, res: [], c: 0, r: nextFreeRow(), w: 24, h: 6 };
    padChange("Ajouter un bouton", function () { layout().push(it); }); S.padSel = it.id; App.afterPadChange();
    $("pp-label").focus(); $("pp-label").select();
  });
  $("pad-add-label").addEventListener("click", function () {
    const it = { id: uid("b"), type: "label", label: "Titre", color: "", pat: "none", bd: "", bw: 0, dur: "", pre: null, post: null, c: 0, r: nextFreeRow(), w: 48, h: 6 };
    padChange("Ajouter un titre", function () { layout().push(it); }); S.padSel = it.id; App.afterPadChange();
    $("pp-label").focus(); $("pp-label").select();
  });
  $("pad-reset").addEventListener("click", function () {
    edit(["panel"], "Disposition d'origine", function () { S.docs.panel = { id: "panel", kind: "panel", v: 4, h: 1, buttons: defaultLayout(), updatedAt: Date.now() }; resetLayoutCache(); });
    S.padSel = null; App.afterPadChange();
    toast("Disposition d'origine rétablie.", true);
  });
  if (window.ResizeObserver) new ResizeObserver(function () { scalePad(); }).observe(grid);
}
