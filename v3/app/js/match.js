/* Écran de match : pages Codage et Analyse, tags, timeline, codes, derniers tags, bilan, listes, menus. */
import { $, el, uid, fmt, fmtSec, textOn, tint, r1, sentence, cleanName } from "./util.js";
import { S, cur, edit, save, layout, pref, setPref, pjDoc, pjOf, pjMatches, undo, redo, canUndo, canRedo, undoLabel, redoLabel } from "./state.js";
import { THIRDS, LANES, PERIODS, DEF_PRE, DEF_POST, isVideo, derive, matchTime, pre, post, tlPos, clipOf, tlRows, tagLabel, tagColor, tagButton, resultsFor, padButtons, isFlag, itemIn } from "./model.js";
import { App, toast, openPop, closePop, inlineRename, onDoubleTap, showOnly } from "./ui-common.js";
import { V, unloadVideo, loadVideoFile, savePos, seekTo, vsTryLoad, renderVsBadge, stopPlayback, playClips, renderClockBar, renderClock, renderSeekMarks, nowPos, periodSec, videoAction, capture, fullscreen, exportClips, togglePlay } from "./player.js";
import { renderPad, scalePad } from "./pad.js";
import { VS, vsMeta } from "./videostore.js";

export const TL_MAX = 40;
const AT = { tab: "codes", open: null, star: false, tlFilter: { team: "all", hideEmpty: false }, lastTap: { id: null, at: 0 }, drag: null, dur: 1 };
function at() { return pref("atelier", { hidden: {}, lay: "code", zoomSet: false }); }
function setAt(patch) { setPref("atelier", Object.assign({}, at(), patch)); }
function zoom() { const z = pref("tlZoom", 1); return z >= 1 && z <= TL_MAX ? z : 1; }

/* ---------- Tags ---------- */
export function findTag(m, id) { for (let i = 0; i < m.tags.length; i++) if (m.tags[i].id === id) return m.tags[i]; return null; }
export function currentTag() { const m = cur(); return m && S.currentTagId ? findTag(m, S.currentTagId) : null; }
function canTag(m) { return isVideo(m) ? V.ready : m.phase === "live"; }
function addTag(it) {
  const m = cur(); if (!m || !canTag(m)) return null;
  const P0 = it.pre != null ? it.pre : DEF_PRE, P1 = it.post != null ? it.post : DEF_POST;
  let tag;
  if (isVideo(m)) {
    const v = Math.round((V.vid.currentTime || 0) * 10) / 10, d = derive(m, v);
    tag = { id: uid("t"), p: d.p, t: d.t, v: v, team: it.team, ev: it.key, lbl: it.label, btn: it.id, col: it.color, d0: P0, d1: P1, third: "", lane: "", res: "", note: "" };
    stopPlayback();
  } else tag = { id: uid("t"), p: m.period, t: periodSec(m), team: it.team, ev: it.key, lbl: it.label, btn: it.id, col: it.color, d0: P0, d1: P1, third: "", lane: "", res: "", note: "" };
  edit([m.id], "Tag « " + it.label + " »", function () { m.tags.push(tag); });
  S.currentTagId = tag.id; savePos(true);
  renderAfterTags();
  return tag;
}
export function tagFromButton(id) {
  const it = itemIn(layout(), id); if (!it || it.type !== "button") return;
  const m = cur(); if (!m) return;
  S.activeTeam = it.team;
  if (it.dur === "toggle") {
    const open = m.tags.filter(function (t) { return t.btn === it.id && t.open; }).pop();
    if (open) {
      edit([m.id], "Fin du clip", function () {
        const len = isVideo(m) ? (V.vid.currentTime || 0) - open.v : (m.period === open.p ? periodSec(m) - open.t : DEF_POST);
        open.d1 = Math.max(1, r1(len)); delete open.open;
      });
      S.currentTagId = open.id; renderAfterTags(); return;
    }
    const t = addTag(it); if (t) { edit([m.id], "Début du clip", function () { t.d0 = 0; t.d1 = 0; t.open = true; }); renderAfterTags(); }
    return;
  }
  addTag(it);
}
export function deleteTag(m, id) {
  if (S.tlEdit === id) S.tlEdit = null;
  stopPlayback();
  edit([m.id], "Supprimer un tag", function () {
    m.tags = m.tags.filter(function (t) { return t.id !== id; });
    (m.lists || []).forEach(function (l) { l.tags = l.tags.filter(function (x) { return x !== id; }); });
  });
  if (S.currentTagId === id) S.currentTagId = null;
  renderAfterTags();
  toast("Tag supprimé.", true);
}
function deleteLast() { const m = cur(); if (!m || !m.tags.length) return; deleteTag(m, m.tags[m.tags.length - 1].id); }
function setResult(i) {
  const m = cur(), t = currentTag(); if (!m || !t) return;
  const r = resultsFor(t, layout())[i]; if (!r) return;
  edit([m.id], "Résultat", function () { t.res = t.res === r ? "" : r; });
  renderAfterTags();
}
function setClip(m, t, s, e, pos) {
  pos = Math.min(e, Math.max(s, pos));
  if (isVideo(m)) { t.v = r1(pos); const d = derive(m, t.v); t.p = d.p; t.t = d.t; pos = t.v; }
  else { const base = (PERIODS[t.p] ? PERIODS[t.p].base : 0) * 60; t.t = Math.max(0, Math.round(pos - base)); pos = base + t.t; }
  t.d0 = Math.max(0, r1(pos - s)); t.d1 = Math.max(0, r1(e - pos));
}
function clipSpan(m, t) { const p = tlPos(m, t); return { pos: p, s: Math.max(0, p - pre(t)), e: p + post(t) }; }
function splitTag(m, tag) {
  const c = clipSpan(m, tag); if (c.pos == null || c.e - c.s < 2) { toast("Ce clip est trop court pour être coupé.", false); return; }
  let x = isVideo(m) && V.ready ? V.vid.currentTime : null;
  const atHead = x != null && x > c.s + 0.5 && x < c.e - 0.5;
  if (!atHead) x = (c.s + c.e) / 2;
  stopPlayback();
  edit([m.id], "Couper un clip", function () {
    const copy = JSON.parse(JSON.stringify(tag)); copy.id = uid("t"); copy.note = "";
    setClip(m, tag, c.s, x, Math.min(c.pos, x)); setClip(m, copy, x, c.e, Math.max(c.pos, x)); m.tags.push(copy);
  });
  renderAfterTags();
  toast(atHead ? "Clip coupé à la tête de lecture." : "Clip coupé en son milieu.", true);
}
function clipName(m, suffix) { return (m.date || "match") + "_" + (cleanName(m.home) || "domicile") + "_" + (cleanName(m.away) || "exterieur") + "_" + (cleanName(suffix) || "clip"); }
function clipAction(a) {
  const m = cur(), t = currentTag(); if (!m || !t) { toast("Sélectionne d'abord un clip.", false); return; }
  if (a === "play") { playClips([clipOf(m, t)]); return; }
  if (a === "delete") { deleteTag(m, t.id); return; }
  if (a === "split") { splitTag(m, t); return; }
  if (a === "export") { exportClips([clipOf(m, t)], clipName(m, tagLabel(t, layout()) + "-" + fmt(matchTime(t.p, t.t)).replace(":", "m"))); return; }
  if (a === "tolist") { addToList(m, t.id); return; }
  if (a === "endhere") {
    if (!V.ready || t.v == null) return;
    const d = Math.round(V.vid.currentTime - t.v);
    if (d < 0) { toast("La fin du clip doit être après le moment du tag.", false); return; }
    edit([m.id], "Fin du clip", function () { t.d1 = Math.min(600, d); });
  } else edit([m.id], "Durée du clip", function () {
    if (a === "pre-") t.d0 = Math.max(0, pre(t) - 1); else if (a === "pre+") t.d0 = Math.min(120, pre(t) + 1);
    else if (a === "post-") t.d1 = Math.max(0, post(t) - 1); else if (a === "post+") t.d1 = Math.min(600, post(t) + 1);
  }, "clip:" + t.id);
  renderAfterTags();
}

/* ---------- Gardés (★) et codes masqués ---------- */
function project() { const m = cur(); return m ? (S.pjId && pjDoc() && (pjDoc().matchIds || []).indexOf(m.id) >= 0 ? pjDoc() : pjOf(m.id)) : null; }
function starKey(m, t) { return m.id + ":" + t.id; }
function isStar(m, t) { const a = project(); return !!(a && a.stars && a.stars[starKey(m, t)]); }
function shown(m, t) { return (!AT.star || isStar(m, t)) && (!t.status || t.status === "accepted"); }
function toggleStar() {
  const m = cur(), t = currentTag(), a = project();
  if (!m || !t) { toast("Sélectionne d'abord un clip.", false); return; }
  if (!a) { toast("Ajoute ce match à un projet pour garder des clips.", false); return; }
  edit([a.id], "Garder un clip", function () { a.stars = a.stars || {}; const k = starKey(m, t); if (a.stars[k]) delete a.stars[k]; else a.stars[k] = true; });
  renderSelection();
}

/* ---------- Rendu ---------- */
export function renderMatch() {
  const m = cur(); if (!m) { App.showHome(); return; }
  const list = layout(), a = project();
  S.pjId = a ? a.id : null;
  if (a && a.last !== m.id) { a.last = m.id; save(a, true); }
  $("sc-teams").textContent = m.home + " – " + m.away; $("sc-proj").textContent = a ? a.name : "";
  $("board").dataset.mode = isVideo(m) ? "video" : "live";
  $("board").dataset.lay = at().lay === "ana" ? "ana" : "code";
  placeCurrent($("board").dataset.lay);
  const mode = $("at-mode").children; for (let i = 0; i < mode.length; i++) mode[i].classList.toggle("on", mode[i].dataset.lay === $("board").dataset.lay);
  const loading = V.loadingStored === m.id;
  $("video-ask").hidden = !isVideo(m) || V.ready;
  $("video-ask-text").textContent = loading ? "Ouverture de la vidéo enregistrée sur l'appareil…" : (m.video && m.video.name ? "Rechoisis la vidéo de ce match : " + m.video.name : "Choisis la vidéo de ce match.");
  $("video-ask-btn").hidden = loading;
  $("video-ask-note").textContent = VS.ok ? "Une fois choisie, la vidéo est gardée sur cet appareil : tu n'auras plus à la rechoisir. Tes tags, eux, sont toujours conservés." : "Le navigateur ne garde pas la vidéo d'une fois sur l'autre. Tes tags, eux, sont conservés.";
  V.vid.hidden = !V.ready;
  $("at-vn").textContent = isVideo(m) && m.video && m.video.name ? m.video.name + (V.ready && V.vid.videoWidth ? " · " + V.vid.videoWidth + "×" + V.vid.videoHeight : "") : "";
  renderVsBadge();
  renderClockBar(m);
  renderPad(m);
  renderTagViews(m);
  renderSummary(m);
  renderHistoryButtons();
  renderFilters(m);
  requestAnimationFrame(fit);
}
/* Tout ce qui dépend des tags ou de la sélection */
function renderTagViews(m) {
  const list = layout();
  renderCurrent(m); renderLastStrip(m);
  renderRecent(m);
  if (at().lay === "code") { renderSeekMarks(m, list, function (t) { return shown(m, t); }); return; } /* le reste est caché en page Codage */
  renderLast(m); renderCodes(m); renderTimeline(m); renderLists(m); renderSelBox(m);
  renderSeekMarks(m, list, function (t) { return shown(m, t); });
  if (AT.tab === "sum") renderSummary(m);
}
function renderAfterTags() { const m = cur(); if (!m) return; renderPad(m); renderTagViews(m); renderHistoryButtons(); renderFilters(m); }
export function renderSelection() { renderAfterTags(); }

function renderResults(m) {
  const res = $("results"), t = currentTag(), list = layout();
  res.textContent = "";
  const opts = t ? resultsFor(t, list) : ["Réussi", "Raté"];
  opts.forEach(function (r) { const b = el("button", "", r); b.type = "button"; b.dataset.res = r; b.disabled = !t; b.setAttribute("aria-pressed", String(!!t && t.res === r)); res.appendChild(b); });
}
function renderCurrent(m) {
  renderResults(m);
  const t = currentTag(), list = layout(), line = $("cur-line");
  line.textContent = "";
  if (!t) line.appendChild(el("span", "cur-empty", "Touche un bouton du panel : le tag est enregistré tout de suite. Résultat, zone et note sont facultatifs."));
  else line.textContent = fmt(matchTime(t.p, t.t)) + " · " + sentence(tagLabel(t, list)) + " · " + (t.team === "away" ? m.away : m.home);
  $("attack-label").textContent = t ? "Sens d'attaque : vers la droite" : "";
  const zones = $("zones");
  if (!zones.children.length) LANES.forEach(function (lane) { THIRDS.forEach(function (third) { const b = el("button"); b.type = "button"; b.dataset.third = third; b.dataset.lane = lane; b.setAttribute("aria-label", "Tiers " + third.toLowerCase() + ", " + lane.toLowerCase()); zones.appendChild(b); }); });
  for (let i = 0; i < zones.children.length; i++) { const z = zones.children[i]; z.disabled = !t; z.setAttribute("aria-pressed", String(!!t && t.third === z.dataset.third && t.lane === z.dataset.lane)); }
  const note = $("note"); note.disabled = !t;
  if (note.dataset.tag !== (t ? t.id : "") || document.activeElement !== note) { note.value = t ? (t.note || "") : ""; note.dataset.tag = t ? t.id : ""; }
  $("btn-swap").disabled = !t;
}
function renderLast(m) {
  const list = layout(), ul = $("tag-list"); ul.textContent = "";
  $("tags-empty").hidden = m.tags.length > 0;
  $("log-hint").hidden = !(isVideo(m) && V.ready && m.tags.length);
  const frag = document.createDocumentFragment();
  m.tags.slice().sort(function (a, b) { return (b.p - a.p) || (b.t - a.t); }).forEach(function (t) {
    if (!shown(m, t)) return;
    const li = el("li", t.id === S.currentTagId ? "is-current" : "");
    if (t.v != null && V.ready) { const tb = el("button", "t", fmt(matchTime(t.p, t.t))); tb.type = "button"; tb.dataset.seek = t.id; tb.setAttribute("aria-label", "Revoir l'action à " + fmt(matchTime(t.p, t.t))); li.appendChild(tb); }
    else li.appendChild(el("span", "t", fmt(matchTime(t.p, t.t))));
    const dot = el("span", "dot"); dot.style.background = tagColor(t, list); li.appendChild(dot);
    const what = el("button", "what"); what.type = "button"; what.dataset.select = t.id;
    what.appendChild(el("b", "", sentence(tagLabel(t, list))));
    const bits = []; if (t.third) bits.push("tiers " + t.third.toLowerCase() + ", " + t.lane.toLowerCase()); if (t.res) bits.push(t.res); if (t.note) bits.push("« " + t.note + " »");
    what.appendChild(el("small", "", bits.join(" / "))); li.appendChild(what);
    const acts = el("span", "row-actions");
    const add = el("button", "btn small quiet", "+ Liste"); add.type = "button"; add.dataset.tolist = t.id;
    const del = el("button", "btn small quiet", "Suppr."); del.type = "button"; del.dataset.deltag = t.id; del.setAttribute("aria-label", "Supprimer le tag");
    acts.appendChild(add); acts.appendChild(del); li.appendChild(acts);
    frag.appendChild(li);
  });
  ul.appendChild(frag);
}
function renderCodes(m) {
  const rows = tlRows(m, layout()), ct = currentTag(), box = $("at-codes"), hidden = at().hidden || {};
  let total = 0; box.textContent = "";
  const frag = document.createDocumentFragment();
  rows.forEach(function (r) {
    if (AT.tlFilter.team !== "all" && r.team && r.team !== AT.tlFilter.team) return;
    const tags = r.tags.filter(function (t) { return shown(m, t); }); total += tags.length;
    const sel = !!(ct && r.tags.indexOf(ct) >= 0);
    const d = el("div", "pr" + (sel ? " sel" : "")); d.dataset.k = r.key;
    d.innerHTML = '<svg class="ic xs"><use href="#i-' + (AT.open === r.key ? "chevd" : "chevr") + '"/></svg><span class="ck">' + (hidden[r.key] ? "" : '<svg class="ic xs"><use href="#i-check"/></svg>') + '</span><span class="pill">' + tags.length + "</span>";
    d.appendChild(el("span", "nm", sentence(r.label)));
    if (r.team) d.appendChild(el("span", "chip " + r.team, r.team === "away" ? m.away : m.home));
    const sw = el("i", "sw"); sw.style.background = r.color; d.appendChild(sw);
    frag.appendChild(d);
    if (AT.open === r.key) {
      if (!tags.length) frag.appendChild(el("div", "pc", "Aucun clip."));
      tags.slice().sort(function (a, b) { return (tlPos(m, a) || 0) - (tlPos(m, b) || 0); }).forEach(function (t, i) {
        const c = el("button", "pc" + (t.id === S.currentTagId ? " on" : "")); c.type = "button"; c.dataset.c = t.id;
        c.appendChild(el("span", "n", String(i + 1))); c.appendChild(el("span", "tm", fmt(matchTime(t.p, t.t))));
        if (isStar(m, t)) c.insertAdjacentHTML("beforeend", '<svg class="ic xs gold"><use href="#i-star"/></svg>');
        c.appendChild(el("span", "x", (t.res || "") + (t.note ? (t.res ? " · " : "") + t.note : "")));
        frag.appendChild(c);
      });
    }
  });
  box.appendChild(frag);
  $("at-count").textContent = total + (total > 1 ? " tags" : " tag");
}
function renderRecent(m) {
  const box = $("recent"), list = layout(); box.textContent = "";
  box.appendChild(el("span", "lab", "Derniers"));
  m.tags.slice(-6).reverse().forEach(function (t) {
    const it = el("button", "it"); it.type = "button"; it.dataset.select = t.id;
    const sw = el("i"); sw.style.background = tagColor(t, list); it.appendChild(sw);
    it.appendChild(el("span", "mono", fmt(matchTime(t.p, t.t)))); it.appendChild(el("b", "", sentence(tagLabel(t, list))));
    if (t.res) it.appendChild(el("span", "r", t.res));
    box.appendChild(it);
  });
  if (!m.tags.length) box.appendChild(el("span", "r", "Aucun tag pour l'instant"));
}
function renderFilters(m) {
  const f = $("at-filters").children;
  for (let i = 0; i < f.length; i++) {
    const k = f[i].dataset.f;
    if (k === "home") f[i].textContent = m.home; else if (k === "away") f[i].textContent = m.away;
    f[i].classList.toggle("on", k === "star" ? AT.star : (k === AT.tlFilter.team && !AT.star) || (k === "all" && AT.tlFilter.team === "all" && !AT.star));
  }
}
function placeCurrent(lay) {
  const cu = $("current"), host = lay === "code" ? $("seq-body") : $("bottom");
  if (cu.parentNode === host) return;
  if (lay === "code") host.appendChild(cu); else host.insertBefore(cu, host.querySelector('.tabp[data-p="last"]'));
}
function renderSelBox(m) {
  const t = currentTag(), box = $("at-sel");
  box.textContent = "";
  if (t) {
    const p = tlPos(m, t), d = Math.round((pre(t) + post(t)) * 10) / 10;
    box.appendChild(el("span", "l", "Sélection :")); box.appendChild(el("b", "", sentence(tagLabel(t, layout()))));
    box.appendChild(el("span", "m", fmt(Math.max(0, matchTime(t.p, t.t) - pre(t))) + " – " + fmt(matchTime(t.p, t.t) + post(t)) + " · " + fmtSec(d) + " s"));
    $("clip-pre").textContent = fmtSec(pre(t)) + " s avant"; $("clip-post").textContent = fmtSec(post(t)) + " s après";
    $("clip-play").hidden = !(isVideo(m) && V.ready && t.v != null);
  } else box.appendChild(el("span", "l", "Sélection : aucun clip"));
  $("clip-row").hidden = !t;
  const st = !!(t && isStar(m, t));
  $("tl-star").hidden = !t; $("tl-star").innerHTML = '<svg class="ic sm' + (st ? " gold" : "") + '"><use href="#i-' + (st ? "star" : "staro") + '"/></svg>';
}
function renderLastStrip(m) {
  const lt = m.tags.length ? m.tags[m.tags.length - 1] : null, list = layout();
  $("at-del-last").disabled = !lt;
  $("at-last-nm").textContent = lt ? sentence(tagLabel(lt, list)) : "Aucun";
  $("at-last-tm").textContent = lt ? fmt(matchTime(lt.p, lt.t)) + (lt.res ? " · " + lt.res : "") : "";
  $("at-last-sw").style.background = lt ? tagColor(lt, list) : "transparent";
  $("at-last").classList.toggle("empty", !lt);
}
export function renderSummary(m) {
  m = m || cur(); if (!m) return;
  const box = $("summary"); box.textContent = "";
  if (!m.tags.length) { box.appendChild(el("p", "empty", "Le bilan se remplit au fil de tes tags.")); return; }
  const table = el("table", "sum"), thead = el("thead"), hr = el("tr");
  ["N°", "Événement", "Tags", "Résultats"].forEach(function (h) { hr.appendChild(el("th", "", h)); });
  thead.appendChild(hr); table.appendChild(thead);
  const tbody = el("tbody");
  tlRows(m, layout()).forEach(function (r) {
    const tags = r.tags.filter(function (t) { return !t.status || t.status === "accepted"; });
    if (!tags.length) return;
    const row = el("tr"); row.appendChild(el("td", "", String(r.n)));
    const name = el("td"), sw = el("span", "sum-sw"); sw.style.background = r.color; name.appendChild(sw); name.appendChild(el("span", "", sentence(r.label) + (r.team ? " (" + (r.team === "away" ? m.away : m.home) + ")" : ""))); row.appendChild(name);
    row.appendChild(el("td", "mono", String(tags.length)));
    const counts = {}, order = [];
    tags.forEach(function (t) { if (!t.res) return; if (!counts[t.res]) { counts[t.res] = 0; order.push(t.res); } counts[t.res]++; });
    row.appendChild(el("td", "", order.map(function (k) { return k + " " + counts[k]; }).join(", ")));
    tbody.appendChild(row);
  });
  table.appendChild(tbody); box.appendChild(table);
}

/* ---------- Listes de lecture ---------- */
let listSel = null;
function lists(m) { if (!Array.isArray(m.lists)) m.lists = []; return m.lists; }
function curList(m) { const ls = lists(m); for (let i = 0; i < ls.length; i++) if (ls[i].id === listSel) return ls[i]; return ls[0] || null; }
function listTags(m, l) { return l.tags.map(function (id) { return findTag(m, id); }).filter(Boolean).sort(function (a, b) { return (a.p - b.p) || (a.t - b.t); }); }
function addToList(m, tagId) {
  let name = "";
  edit([m.id], "Ajouter à une liste", function () {
    let l = curList(m);
    if (!l) { l = { id: uid("l"), name: "Liste " + (lists(m).length + 1), tags: [] }; lists(m).push(l); }
    listSel = l.id; name = l.name;
    if (l.tags.indexOf(tagId) < 0) l.tags.push(tagId);
  });
  renderLists(m); toast("Ajouté à « " + name + " ».", true);
}
function renderLists(m) {
  const ls = lists(m), l = curList(m), sel = $("list-select"), list = layout();
  sel.textContent = "";
  ls.forEach(function (x) { const o = el("option", "", x.name + " (" + x.tags.length + ")"); o.value = x.id; if (l && x.id === l.id) o.selected = true; sel.appendChild(o); });
  sel.hidden = !ls.length; $("list-tools").hidden = !l;
  const items = $("list-items"); items.textContent = "";
  const empty = $("list-empty");
  if (!l) { empty.textContent = "Aucune liste. Crée-en une, ou touche « + Liste » sur un clip."; empty.hidden = false; return; }
  const nm = $("list-name"); if (nm.dataset.list !== l.id || document.activeElement !== nm) { nm.value = l.name; nm.dataset.list = l.id; }
  const canVid = isVideo(m) && V.ready; let n = 0;
  listTags(m, l).forEach(function (t) {
    n++;
    const li = el("li", t.id === S.currentTagId ? "is-current" : "");
    if (t.v != null && canVid) { const tb = el("button", "t", fmt(matchTime(t.p, t.t))); tb.type = "button"; tb.dataset.seek = t.id; li.appendChild(tb); } else li.appendChild(el("span", "t", fmt(matchTime(t.p, t.t))));
    const dot = el("span", "dot"); dot.style.background = tagColor(t, list); li.appendChild(dot);
    const what = el("span", "what"); what.appendChild(el("b", "", sentence(tagLabel(t, list)))); what.appendChild(el("small", "", "clip de " + fmtSec(pre(t) + post(t)) + " s" + (t.res ? " / " + t.res : ""))); li.appendChild(what);
    const acts = el("span", "row-actions"), rm = el("button", "btn small quiet", "Retirer"); rm.type = "button"; rm.dataset.unlist = t.id; acts.appendChild(rm); li.appendChild(acts);
    items.appendChild(li);
  });
  empty.textContent = "Cette liste est vide. Touche « + Liste » sur un clip."; empty.hidden = n > 0;
  $("list-play").disabled = $("list-export").disabled = !(canVid && n > 0);
}

/* ---------- Timeline ---------- */
function tlAxis(m) {
  let dur;
  const now = nowPos(m);
  if (isVideo(m)) {
    if (V.ready && isFinite(V.vid.duration) && V.vid.duration > 0) dur = V.vid.duration;
    else { dur = 600; m.tags.forEach(function (t) { if (t.v != null && t.v + 60 > dur) dur = t.v + 60; }); }
  } else { dur = Math.max(95 * 60, now + 60); m.tags.forEach(function (t) { const x = matchTime(t.p, t.t) + 60; if (x > dur) dur = x; }); }
  return { dur: dur, now: now };
}
export function renderTimeline(m) {
  const ax = tlAxis(m), list = layout(), hidden = at().hidden || {}, ct = currentTag();
  AT.dur = ax.dur;
  $("tl-inner").style.setProperty("--zoom", String(zoom()));
  const ticks = $("tl-ticks"); ticks.textContent = "";
  const vis = ax.dur / zoom(), STEPS = [5, 10, 30, 60, 120, 300, 600, 900, 1800]; let step = 3600;
  for (let si = 0; si < STEPS.length; si++) if (vis / STEPS[si] <= 9) { step = STEPS[si]; break; }
  for (let s = 0; s < ax.dur - step * 0.4; s += step) { const tk = el("span", "tl-tick", fmt(s)); tk.style.left = (s / ax.dur * 100) + "%"; ticks.appendChild(tk); }
  const rows = $("tl-rows"), labels = $("tl-labels"); rows.textContent = ""; labels.textContent = "";
  const trackW = $("tl-scroll").clientWidth * zoom();
  const fr = document.createDocumentFragment(), fl = document.createDocumentFragment();
  let count = 0;
  tlRows(m, list).forEach(function (r) {
    if (hidden[r.key]) return;
    if (AT.tlFilter.team !== "all" && r.team && r.team !== AT.tlFilter.team) return;
    const tags = r.tags.filter(function (t) { return shown(m, t); });
    if (AT.tlFilter.hideEmpty && !tags.length) return;
    count++;
    const sel = !!(ct && r.tags.indexOf(ct) >= 0);
    const lab = el("div", "tl-label" + (sel ? " sel" : "")); lab.dataset.row = r.key; lab.title = r.label;
    lab.appendChild(el("i", "", String(tags.length))); const nm = el("span", "nm", sentence(r.label)); lab.appendChild(nm);
    if (!sel) { nm.style.boxShadow = "inset 4px 0 0 " + r.color; }
    fl.appendChild(lab);
    const row = el("div", "tl-row" + (sel ? " sel" : "")), track = el("span", "tl-track");
    tags.slice().sort(function (a, b) { return (tlPos(m, a) || 0) - (tlPos(m, b) || 0); }).forEach(function (t, ti) {
      const x = tlPos(m, t); if (x == null) return;
      const x0 = Math.max(0, x - pre(t)), wpct = Math.max(0, (x + post(t) - x0) / ax.dur * 100), wpx = wpct / 100 * trackW;
      const b = el("button", "tl-block" + (t.id === S.currentTagId ? " is-current" : "") + (t.id === S.tlEdit ? " editing" : ""));
      b.type = "button"; b.dataset.tl = t.id;
      b.style.background = r.color; b.style.color = textOn(r.color);
      b.textContent = wpx >= 54 ? sentence(r.label) : (wpx >= 16 ? String(ti + 1) : "");
      if (t.id === S.tlEdit) { const hl = el("span", "tl-h l"); hl.dataset.h = "l"; const hr = el("span", "tl-h r"); hr.dataset.h = "r"; b.appendChild(hl); b.appendChild(hr); }
      b.style.left = Math.min(100, x0 / ax.dur * 100) + "%"; b.style.width = wpct + "%";
      b.setAttribute("aria-label", r.label + " numéro " + (ti + 1) + ", " + fmt(matchTime(t.p, t.t)));
      track.appendChild(b);
    });
    row.appendChild(track); fr.appendChild(row);
  });
  labels.appendChild(fl); rows.appendChild(fr);
  if (!count) rows.appendChild(el("div", "tl-none", "Aucune ligne ne correspond au filtre."));
  const et = S.tlEdit ? findTag(m, S.tlEdit) : null; if (S.tlEdit && !et) S.tlEdit = null;
  $("tl-edit").hidden = !et; if (et) $("tl-edit-name").textContent = sentence(tagLabel(et, list)) + ", " + fmt(matchTime(et.p, et.t));
  renderTlFilter(m);
  const pps = ax.dur > 0 ? trackW / ax.dur : 0;
  $("tl-pps").textContent = (pps >= 10 ? Math.round(pps) : String(Math.round(pps * 10) / 10).replace(".", ",")) + " px/s";
  if (document.activeElement !== $("tl-zoom")) $("tl-zoom").value = String(zoom());
  $("tl-playhead").style.setProperty("--p", String(Math.max(0, Math.min(1, ax.now / ax.dur))));
  /* Premier passage sur une vidéo : zoom de travail d'environ 6 px par seconde */
  if (!at().zoomSet && isVideo(m) && V.ready && isFinite(V.vid.duration) && V.vid.duration > 60 && $("tl-scroll").clientWidth > 0) {
    setAt({ zoomSet: true });
    if (zoom() === 1) { setPref("tlZoom", Math.max(1, Math.min(TL_MAX, Math.round(6 * V.vid.duration / $("tl-scroll").clientWidth)))); renderTimeline(m); tlReveal(ax.now / AT.dur, true); }
  }
}
function renderTlFilter(m) {
  const f = AT.tlFilter, on = f.team !== "all" || f.hideEmpty;
  $("tl-filter").classList.toggle("on", on);
  const tb = $("tl-f-team").children;
  for (let i = 0; i < tb.length; i++) { const t = tb[i].dataset.team; if (t !== "all") tb[i].textContent = t === "home" ? m.home : m.away; tb[i].setAttribute("aria-pressed", String(t === f.team)); }
  $("tl-f-empty").setAttribute("aria-pressed", String(f.hideEmpty)); $("tl-f-reset").disabled = !on;
}
function tlReveal(frac, force) {
  const sc = $("tl-scroll"); if (zoom() <= 1) return;
  const trackW = $("tl-inner").getBoundingClientRect().width, viewW = sc.clientWidth; if (trackW <= 0 || viewW <= 0) return;
  const x = trackW * frac;
  if (force || x < sc.scrollLeft || x > sc.scrollLeft + viewW - 24) sc.scrollLeft = Math.max(0, x - viewW * (force ? 0.4 : 0.15));
}
export function tickTimeline(m) {
  if (at().lay !== "ana") return;
  const now = nowPos(m);
  if (!isVideo(m) && now + 30 > AT.dur) renderTimeline(m);
  const frac = Math.max(0, Math.min(1, now / AT.dur));
  $("tl-playhead").style.setProperty("--p", String(frac));
  if (isVideo(m) ? (V.ready && !V.vid.paused) : m.clock.running) tlReveal(frac, false);
}
let zoomTimer = 0;
function zoomAt(z, clientX) {
  const m = cur(); if (!m) return;
  z = Math.max(1, Math.min(TL_MAX, z));
  const sc = $("tl-scroll"), viewW = sc.clientWidth; if (viewW <= 0) return;
  const px = Math.max(0, Math.min(viewW, clientX - sc.getBoundingClientRect().left));
  const frac = (sc.scrollLeft + px) / (viewW * zoom());
  S.kv.tlZoom = z; $("tl-inner").style.setProperty("--zoom", String(z));
  sc.scrollLeft = Math.max(0, frac * viewW * z - px);
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(function () { setPref("tlZoom", z); const keep = sc.scrollLeft; renderTimeline(m); sc.scrollLeft = keep; }, 80);
}
function zoomCenter(z) { const r = $("tl-scroll").getBoundingClientRect(); zoomAt(z, r.left + r.width / 2); }
function jump(dir) {
  const m = cur(); if (!m) return;
  const now = nowPos(m), list = m.tags.filter(function (t) { return tlPos(m, t) != null && shown(m, t); }).sort(function (a, b) { return tlPos(m, a) - tlPos(m, b); });
  let pick = null;
  if (dir > 0) { for (let i = 0; i < list.length; i++) if (tlPos(m, list[i]) - pre(list[i]) > now + 0.4) { pick = list[i]; break; } }
  else { for (let j = list.length - 1; j >= 0; j--) if (tlPos(m, list[j]) - pre(list[j]) < now - 1.5) { pick = list[j]; break; } }
  if (!pick) return;
  stopPlayback(); S.tlEdit = null; S.currentTagId = pick.id;
  if (isVideo(m) && V.ready) seekTo(Math.max(0, pick.v - pre(pick)));
  renderSelection();
}

/* ---------- Mise en page ---------- */
function fit() {
  const b = $("board"); if (!b) return;
  if (b.dataset.lay !== "code" || $("view-match").hidden || b.dataset.mode !== "video") { b.style.removeProperty("--panw"); b.style.removeProperty("--vidh"); scalePad(); return; }
  const W = b.clientWidth - 12, H = b.clientHeight - 8;
  const ar = V.ready && V.vid.videoWidth && V.vid.videoHeight ? V.vid.videoWidth / V.vid.videoHeight : 16 / 9;
  const maxvh = H - $("clockbar").offsetHeight - 26 - 4;
  let pw = Math.max(300, Math.round(W * 0.325)), vh = (W - pw - 4) / ar;
  if (vh > maxvh) { vh = maxvh; pw = Math.round(W - (vh * ar + 4)); }
  b.style.setProperty("--panw", pw + "px"); document.documentElement.style.setProperty("--at-panw", pw + "px");
  b.style.setProperty("--vidh", Math.floor(vh + 28) + "px");
  scalePad();
}
export function setLay(l) { setAt({ lay: l }); renderMatch(); }
function setTab(t) {
  AT.tab = t; $("bottom").dataset.tab = t;
  const bs = $("at-tabs").children; for (let i = 0; i < bs.length; i++) bs[i].classList.toggle("on", bs[i].dataset.t === t);
  const m = cur(); if (m && t === "sum") renderSummary(m);
}
function renderHistoryButtons() {
  $("tb-undo").disabled = !canUndo(); $("tb-redo").disabled = !canRedo();
  $("tb-undo").title = canUndo() ? "Annuler : " + undoLabel() : "Rien à annuler";
  $("tb-redo").title = canRedo() ? "Rétablir : " + redoLabel() : "Rien à rétablir";
}
export function doUndo() { const l = undo(); if (!l) { toast("Rien à annuler.", false); return; } afterHistory(); toast("Annulé : " + l, false); }
export function doRedo() { const l = redo(); if (!l) { toast("Rien à rétablir.", false); return; } afterHistory(); toast("Rétabli : " + l, false); }
export function afterHistory() {
  const m = cur();
  if (m && S.currentTagId && !findTag(m, S.currentTagId)) S.currentTagId = null;
  App.renderAll();
}

/* ---------- Ouvrir / fermer un match ---------- */
export function openMatch(id) {
  const m = S.docs[id]; if (!m || m.deleted || !Array.isArray(m.tags)) return;
  App.leaveOthers();
  unloadVideo();
  listSel = null; stopPlayback(); S.padEdit = false; S.padSel = null; S.tlEdit = null; AT.open = null; AT.tlFilter = { team: "all", hideEmpty: false };
  S.currentMatchId = id; S.currentTagId = null;
  showOnly("view-match");
  renderMatch();
  vsTryLoad(m);
  App.requestWake();
}
export function leaveMatch() { if (!S.currentMatchId) return; savePos(true); unloadVideo(); S.currentMatchId = null; S.currentTagId = null; }

/* ---------- Menus ---------- */
function matchItems() {
  const m = cur(), a = project(), l = [];
  if (a) pjMatches(a).forEach(function (x) { l.push([(x.id === m.id ? "• " : "   ") + x.home + " – " + x.away, function () { if (x.id !== m.id) openMatch(x.id); }]); });
  if (a) l.push(["Ajouter un match au projet", function () { App.showHome("projects"); App.openPjForm(a); }]);
  l.push(["Mes projets", function () { App.showHome("projects"); }]);
  return l;
}
const MENUS = [
  ["Fichier", function () { return [["Accueil", function () { App.showHome("menu"); }], ["Mes projets", function () { App.showHome("projects"); }], ["Nouveau match", function () { App.showHome("new"); }], ["Sauvegarder (automatique)", function () { App.saveNow(); }], ["Exporter…", function () { App.openExport(S.currentMatchId); }], ["Réglages et raccourcis", function () { App.openSettings("keys"); }]]; }],
  ["Édition", function () { return [["Annuler" + (canUndo() ? " : " + undoLabel() : ""), canUndo() ? doUndo : null], ["Rétablir" + (canRedo() ? " : " + redoLabel() : ""), canRedo() ? doRedo : null], ["Supprimer le clip sélectionné", function () { clipAction("delete"); }, true]]; }],
  ["Affichage", function () { return [["Page Codage", function () { setLay("code"); }], ["Page Analyse", function () { setLay("ana"); }], [AT.tlFilter.hideEmpty ? "Afficher les lignes sans tag" : "Masquer les lignes sans tag", function () { AT.tlFilter.hideEmpty = !AT.tlFilter.hideEmpty; renderTimeline(cur()); }], ["Plein écran vidéo", fullscreen]]; }],
  ["Match", matchItems],
  ["Codes", function () { return [["Modifier le panel", function () { App.openPanelEditor(); }], ["Afficher tous les codes", function () { setAt({ hidden: {} }); renderAfterTags(); }]]; }],
  ["Clips", function () { const t = currentTag(), m = cur(); return [["Lire le clip", function () { clipAction("play"); }], ["Finir le clip ici", function () { clipAction("endhere"); }], [t && isStar(m, t) ? "Ne plus garder le clip" : "Garder le clip", toggleStar], ["Couper le clip", function () { clipAction("split"); }], ["Ajouter à la liste", function () { clipAction("tolist"); }], ["Exporter le clip", function () { clipAction("export"); }], ["Trier les clips du projet", sortProject]]; }],
  ["Outils", function () { const m = cur(), l = [["Changer la vidéo", function () { videoAction("pick"); }], ["Capture d'image", doCapture]]; if (m && isVideo(m) && V.ready) { l.push(["Coup d'envoi ici", function () { videoAction("k1"); }]); l.push(["2e mi-temps ici", function () { videoAction("k2"); }]); } return l; }],
  ["Aide", function () { return [["Toucher un clip : le lire", null], ["Toucher deux fois : le déplacer, le rogner", null], ["Pincer ou glisser la règle : zoomer", null], ["Raccourcis clavier…", function () { App.openSettings("keys"); }]]; }]
];
function doCapture() { const m = cur(); if (m) capture(function (t) { return clipName(m, "image-" + t); }); }
function sortProject() { if (project()) App.openSort(); else toast("Ajoute d'abord ce match à un projet pour trier ses clips.", false); }

/* ---------- Branchements ---------- */
export function initMatch() {
  const menu = $("at-menu");
  MENUS.slice().reverse().forEach(function (mn) { const b = el("button", "", mn[0]); b.type = "button"; b.dataset.mmenu = "1"; b.addEventListener("click", function () { openPop(b, mn[1](), true); }); menu.insertBefore(b, menu.firstChild); });
  $("btn-back").addEventListener("click", function () { App.showHome("projects"); });
  $("tb-undo").addEventListener("click", doUndo); $("tb-redo").addEventListener("click", doRedo);
  $("at-combo").addEventListener("click", function () { openPop($("at-combo"), matchItems(), true); });
  $("at-mode").addEventListener("click", function (e) { const b = e.target.closest("button"); if (b) setLay(b.dataset.lay); });
  $("tb-capture").addEventListener("click", doCapture); $("vb-capture").addEventListener("click", doCapture);
  $("vb-pick").addEventListener("click", function () { videoAction("pick"); }); $("vb-full").addEventListener("click", fullscreen);
  $("tb-sort").addEventListener("click", sortProject);
  $("tb-import").addEventListener("click", function () { openPop($("tb-import"), [["Changer la vidéo du match", function () { videoAction("pick"); }], ["Importer une sauvegarde (fichier)", function () { App.showHome("projects"); $("import-file").value = ""; $("import-file").click(); }]], true); });
  $("btn-export").addEventListener("click", function () { App.openExport(S.currentMatchId); });
  $("tb-report").addEventListener("click", function () { setAt({ lay: "ana" }); setTab("sum"); renderMatch(); });
  $("at-del-last").addEventListener("click", deleteLast);
  $("results").addEventListener("click", function (e) { const b = e.target.closest("button"); if (!b || b.disabled) return; const t = currentTag(); if (!t) return; setResult(resultsFor(t, layout()).indexOf(b.dataset.res)); });
  $("at-tabs").addEventListener("click", function (e) { const b = e.target.closest("button"); if (b) setTab(b.dataset.t); });
  $("at-filters").addEventListener("click", function (e) {
    const b = e.target.closest("button"); if (!b) return;
    const k = b.dataset.f;
    if (k === "star") { if (!project()) { toast("Ajoute ce match à un projet pour garder des clips.", false); return; } AT.star = !AT.star; }
    else { AT.star = false; AT.tlFilter.team = k; }
    renderAfterTags();
  });
  $("recent").addEventListener("click", function (e) { const b = e.target.closest("button[data-select]"); if (b) { S.currentTagId = b.dataset.select; renderSelection(); } });
  $("tl-star").addEventListener("click", toggleStar);
  $("tl-prev").addEventListener("click", function () { jump(-1); }); $("tl-next").addEventListener("click", function () { jump(1); });
  $("clip-row").addEventListener("click", function (e) { const b = e.target.closest("button[data-clip]"); if (b) clipAction(b.dataset.clip); });
  $("tl-zoom").addEventListener("input", function () { zoomCenter(Number($("tl-zoom").value)); });
  $("tl-zin").addEventListener("click", function () { zoomCenter(zoom() * 1.5); }); $("tl-zout").addEventListener("click", function () { zoomCenter(zoom() / 1.5); });
  $("at-codes").addEventListener("click", function (e) {
    const m = cur(), row = e.target.closest("[data-k]"), clip = e.target.closest("[data-c]"); if (!m) return;
    if (clip) { const t = findTag(m, clip.dataset.c); if (!t) return; S.tlEdit = null; S.currentTagId = t.id; renderSelection(); if (isVideo(m) && V.ready && t.v != null) playClips([clipOf(m, t)]); return; }
    if (!row) return; const k = row.dataset.k;
    if (e.target.closest(".ck")) { const h = Object.assign({}, at().hidden || {}); if (h[k]) delete h[k]; else h[k] = 1; setAt({ hidden: h }); renderAfterTags(); return; }
    AT.open = AT.open === k ? null : k; renderCodes(m);
  });
  $("zones").addEventListener("click", function (e) {
    const b = e.target.closest("button"), m = cur(), t = currentTag(); if (!b || !m || !t) return;
    edit([m.id], "Zone", function () { if (t.third === b.dataset.third && t.lane === b.dataset.lane) { t.third = ""; t.lane = ""; } else { t.third = b.dataset.third; t.lane = b.dataset.lane; } });
    renderCurrent(m); renderLast(m);
  });
  $("note").addEventListener("input", function () {
    const m = cur(), t = currentTag(); if (!m || !t) return;
    const v = $("note").value.slice(0, 120);
    edit([m.id], "Note", function () { t.note = v; }, "note:" + t.id);
    renderHistoryButtons();
  });
  $("note").addEventListener("change", function () { const m = cur(); if (m) renderLast(m); });
  $("btn-swap").addEventListener("click", function () { const m = cur(), t = currentTag(); if (!m || !t) return; edit([m.id], "Changer d'équipe", function () { t.team = t.team === "home" ? "away" : "home"; }); renderAfterTags(); });
  $("tag-list").addEventListener("click", function (e) {
    const b = e.target.closest("button"), m = cur(); if (!b || !m) return;
    if (b.dataset.seek) { const t = findTag(m, b.dataset.seek); if (t && t.v != null) playClips([clipOf(m, t)]); }
    else if (b.dataset.tolist) addToList(m, b.dataset.tolist);
    else if (b.dataset.select) { S.currentTagId = b.dataset.select; renderSelection(); }
    else if (b.dataset.deltag) deleteTag(m, b.dataset.deltag);
  });
  /* listes */
  $("list-select").addEventListener("change", function () { const m = cur(); if (!m) return; listSel = $("list-select").value; renderLists(m); });
  $("list-new").addEventListener("click", function () { const m = cur(); if (!m) return; edit([m.id], "Nouvelle liste", function () { const l = { id: uid("l"), name: "Liste " + (lists(m).length + 1), tags: [] }; lists(m).push(l); listSel = l.id; }); renderLists(m); });
  $("list-name").addEventListener("input", function () { const m = cur(); if (!m) return; const l = curList(m); if (!l) return; const v = $("list-name").value.slice(0, 40) || "Liste"; edit([m.id], "Renommer la liste", function () { l.name = v; }, "list:" + l.id); });
  $("list-name").addEventListener("change", function () { const m = cur(); if (m) renderLists(m); });
  $("list-del").addEventListener("click", function () { const m = cur(); if (!m) return; const l = curList(m); if (!l) return; edit([m.id], "Supprimer la liste", function () { m.lists = lists(m).filter(function (x) { return x.id !== l.id; }); }); listSel = null; renderLists(m); toast("Liste supprimée.", true); });
  $("list-play").addEventListener("click", function () { const m = cur(), l = m && curList(m); if (l) playClips(listTags(m, l).map(function (t) { return clipOf(m, t); })); });
  $("list-export").addEventListener("click", function () { const m = cur(), l = m && curList(m); if (l) exportClips(listTags(m, l).map(function (t) { return clipOf(m, t); }), clipName(m, l.name)); });
  $("list-items").addEventListener("click", function (e) {
    const b = e.target.closest("button"), m = cur(); if (!b || !m) return; const l = curList(m); if (!l) return;
    if (b.dataset.seek) { const t = findTag(m, b.dataset.seek); if (t) playClips([clipOf(m, t)]); }
    else if (b.dataset.unlist) { edit([m.id], "Retirer de la liste", function () { l.tags = l.tags.filter(function (id) { return id !== b.dataset.unlist; }); }); renderLists(m); }
  });
  /* timeline : clics, édition, gestes */
  $("tl-body").addEventListener("click", function (e) {
    const m = cur(); if (!m) return;
    const b = e.target.closest("button.tl-block");
    if (b) {
      const t = findTag(m, b.dataset.tl); if (!t || S.tlEdit === t.id) return;
      const now = Date.now();
      if (AT.lastTap.id === t.id && now - AT.lastTap.at < 450) {
        AT.lastTap = { id: null, at: 0 }; stopPlayback(); if (isVideo(m) && V.ready) V.vid.pause();
        S.tlEdit = t.id; S.currentTagId = t.id; renderSelection(); return;
      }
      AT.lastTap = { id: t.id, at: now }; S.tlEdit = null; S.currentTagId = t.id; renderSelection();
      if (isVideo(m) && V.ready && t.v != null) playClips([clipOf(m, t)]);
      return;
    }
    if (S.tlEdit) { S.tlEdit = null; renderTimeline(m); return; }
    if (isVideo(m) && V.ready) {
      stopPlayback();
      const r = $("tl-inner").getBoundingClientRect(); if (r.width <= 0) return;
      seekTo(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * AT.dur);
    }
  });
  $("tl-rows").addEventListener("pointerdown", function (e) {
    const m = cur(), node = e.target.closest(".tl-block.editing"); if (!m || !node) return;
    const t = findTag(m, node.dataset.tl), track = node.parentElement; if (!t || !track) return;
    const c = clipSpan(m, t), w = track.getBoundingClientRect().width; if (c.pos == null || w <= 0) return;
    AT.drag = { t: t, node: node, mode: e.target.dataset.h || "move", sx: e.clientX, spp: AT.dur / w, os: c.s, oe: c.e, opos: c.pos, ns: c.s, ne: c.e, moved: false };
    try { node.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  $("tl-rows").addEventListener("pointermove", function (e) {
    const d = AT.drag; if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.sx) < 4) return;
    d.moved = true;
    const ds = (e.clientX - d.sx) * d.spp, len = d.oe - d.os;
    if (d.mode === "move") { d.ns = Math.min(Math.max(0, AT.dur - len), Math.max(0, d.os + ds)); d.ne = d.ns + len; }
    else if (d.mode === "l") { d.ns = Math.min(d.oe - 1, Math.max(0, d.os + ds)); d.ne = d.oe; }
    else { d.ne = Math.max(d.os + 1, Math.min(AT.dur, d.oe + ds)); d.ns = d.os; }
    d.node.style.left = (d.ns / AT.dur * 100) + "%"; d.node.style.width = ((d.ne - d.ns) / AT.dur * 100) + "%";
  });
  function endTlDrag() {
    const d = AT.drag; if (!d) return; AT.drag = null;
    const m = cur(); if (!m || !d.moved) return;
    edit([m.id], d.mode === "move" ? "Déplacer un clip" : "Rogner un clip", function () { setClip(m, d.t, d.ns, d.ne, d.mode === "move" ? d.opos + (d.ns - d.os) : d.opos); });
    renderAfterTags();
  }
  $("tl-rows").addEventListener("pointerup", endTlDrag); $("tl-rows").addEventListener("pointercancel", endTlDrag);
  $("tl-edit").addEventListener("click", function (e) {
    e.stopPropagation();
    const b = e.target.closest("button"), m = cur(); if (!b || !m) return;
    const t = S.tlEdit ? findTag(m, S.tlEdit) : null;
    if (b.id === "tl-edit-done" || !t) { S.tlEdit = null; renderTimeline(m); return; }
    if (b.id === "tl-edit-del") deleteTag(m, t.id); else if (b.id === "tl-edit-split") splitTag(m, t);
  });
  onDoubleTap($("tl-labels"), ".tl-label", function () { return true; }, function (key) {
    const m = cur(); if (!m) return;
    const anchor = $("tl-labels").querySelector('[data-row="' + key.replace(/"/g, '\\"') + '"]');
    if (key.indexOf("b:") === 0) {
      const it = itemIn(layout(), key.slice(2)); if (!it) return;
      inlineRename(anchor, it.label, function (v) { App.renameButton(it.id, v); });
    } else {
      const row = tlRows(m, layout()).filter(function (r) { return r.key === key; })[0]; if (!row) return;
      inlineRename(anchor, row.label, function (v) { edit([m.id], "Renommer une ligne", function () { row.tags.forEach(function (t) { t.lbl = v; }); }); renderAfterTags(); });
    }
  });
  (function () {
    const zone = $("tl-ticks"), pts = {}; let base = null, lastTap = 0;
    const ids = function () { return Object.keys(pts); };
    const rebase = function () {
      const k = ids();
      if (k.length >= 2) base = { mode: "pinch", d: Math.max(20, Math.abs(pts[k[0]].x - pts[k[1]].x)), z: zoom() };
      else if (k.length === 1) base = { mode: "drag", x: pts[k[0]].x, z: zoom(), moved: false };
      else base = null;
    };
    zone.addEventListener("pointerdown", function (e) { pts[e.pointerId] = { x: e.clientX }; try { zone.setPointerCapture(e.pointerId); } catch (err) {} rebase(); e.preventDefault(); });
    zone.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId] || !base) return; pts[e.pointerId].x = e.clientX; const k = ids();
      if (base.mode === "pinch" && k.length >= 2) { const d = Math.max(20, Math.abs(pts[k[0]].x - pts[k[1]].x)); zoomAt(base.z * d / base.d, (pts[k[0]].x + pts[k[1]].x) / 2); }
      else if (base.mode === "drag") { const dx = e.clientX - base.x; if (!base.moved && Math.abs(dx) < 6) return; base.moved = true; zoomAt(base.z * Math.exp(dx / 140), base.x); }
    });
    const up = function (e) {
      if (!pts[e.pointerId]) return;
      const wasTap = base && base.mode === "drag" && !base.moved && ids().length === 1;
      delete pts[e.pointerId]; rebase();
      if (wasTap && e.type === "pointerup") { const now = Date.now(); if (now - lastTap < 350) { zoomAt(1, e.clientX); $("tl-scroll").scrollLeft = 0; lastTap = 0; } else lastTap = now; }
    };
    zone.addEventListener("pointerup", up); zone.addEventListener("pointercancel", up);
    zone.addEventListener("wheel", function (e) { e.preventDefault(); const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY; zoomAt(zoom() * Math.exp(-dy / 300), e.clientX); }, { passive: false });
  })();
  $("tl-filter").addEventListener("click", function (e) { e.stopPropagation(); const menu = $("tl-filter-menu"); menu.hidden = !menu.hidden; $("tl-filter").setAttribute("aria-expanded", String(!menu.hidden)); });
  $("tl-filter-menu").addEventListener("click", function (e) {
    e.stopPropagation(); const b = e.target.closest("button"), m = cur(); if (!b || !m) return;
    if (b.dataset.team) AT.tlFilter.team = b.dataset.team;
    else if (b.id === "tl-f-empty") AT.tlFilter.hideEmpty = !AT.tlFilter.hideEmpty;
    else if (b.id === "tl-f-reset") AT.tlFilter = { team: "all", hideEmpty: false };
    renderTimeline(m); renderCodes(m); renderFilters(m);
  });
  document.addEventListener("click", function () { $("tl-filter-menu").hidden = true; });
  window.addEventListener("resize", function () { fit(); const m = cur(); if (m && !$("view-match").hidden) renderTimeline(m); });
  setTab("codes");
}

/* Actions exposées aux raccourcis clavier */
export const matchKeys = {
  play: function () { const m = cur(); if (!m) return false; if (isVideo(m)) togglePlay(); else App.clockToggle(); },
  back5: function () { videoAction("vback"); }, fwd5: function () { videoAction("vfwd"); },
  back20: function () { videoAction("vback20"); }, fwd20: function () { videoAction("vfwd20"); },
  rate1: function () { videoAction("vr1"); }, rate15: function () { videoAction("vr15"); }, rate2: function () { videoAction("vr2"); },
  res1: function () { setResult(0); }, res2: function () { setResult(1); }, res3: function () { setResult(2); }, res4: function () { setResult(3); },
  delLast: deleteLast, prevClip: function () { jump(-1); }, nextClip: function () { jump(1); },
  accept: function () { return false; }, reject: function () { return false; },
  undo: doUndo, redo: doRedo,
  pageCode: function () { setLay("code"); }, pageAna: function () { setLay("ana"); }
};
