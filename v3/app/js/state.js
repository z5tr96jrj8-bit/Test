/* État de l'appli, enregistrement automatique, annuler / rétablir. */
import { putDoc, setKV } from "./store.js";
import { layoutOf, defaultLayout } from "./model.js";

export const S = {
  docs: {},               // id → document (match, projet, panel, panelLib)
  kv: {},                 // réglages
  currentMatchId: null,
  currentTagId: null,
  activeTeam: "home",
  panelMode: false,       // écran « Modifier le panel »
  padEdit: false, padSel: null,
  tlEdit: null,
  pjId: null,
  layoutCache: { stamp: null, list: null }
};
const changeListeners = [];
export function onChange(fn) { changeListeners.push(fn); }

/* ---------- Réglages ---------- */
export function pref(key, def) { return S.kv[key] === undefined ? def : S.kv[key]; }
export function setPref(key, value) { S.kv[key] = value; setKV(key, value); }

/* ---------- Documents ---------- */
export function doc(id) { const d = S.docs[id]; return d && !d.deleted ? d : null; }
export function cur() { const m = doc(S.currentMatchId); return m && Array.isArray(m.tags) ? m : null; }
export function save(d, keepStamp) {
  if (!keepStamp) d.updatedAt = Date.now();
  S.docs[d.id] = d;
  putDoc(d);
  changeListeners.forEach(function (f) { f(d.id); });
}
export function liveMatches() {
  return Object.keys(S.docs).map(function (k) { return S.docs[k]; })
    .filter(function (m) { return m && !m.deleted && Array.isArray(m.tags); })
    .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
}
export function projects() {
  return Object.keys(S.docs).map(function (k) { return S.docs[k]; })
    .filter(function (a) { return a && !a.deleted && a.kind === "project"; })
    .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
}
export function pjDoc(id) { const a = doc(id || S.pjId); return a && a.kind === "project" ? a : null; }
export function pjMatches(a) { return (a.matchIds || []).map(function (id) { return doc(id); }).filter(function (m) { return m && Array.isArray(m.tags); }); }
export function pjOf(matchId) { const l = projects(); for (let i = 0; i < l.length; i++) if ((l[i].matchIds || []).indexOf(matchId) >= 0) return l[i]; return null; }

/* ---------- Panel actif ---------- */
export function layout() {
  const p = S.docs.panel;
  const stamp = p && !p.deleted ? "p" + p.updatedAt : "default";
  if (S.layoutCache.stamp === stamp && S.layoutCache.list) return S.layoutCache.list;
  const list = p && !p.deleted ? layoutOf(p) : defaultLayout();
  S.layoutCache = { stamp: stamp, list: list };
  return list;
}
export function commitLayout() {
  const list = layout();
  const p = { id: "panel", kind: "panel", v: 4, h: 1, buttons: JSON.parse(JSON.stringify(list)), updatedAt: Date.now() };
  S.docs.panel = p; putDoc(p);
  S.layoutCache = { stamp: "p" + p.updatedAt, list: list };
  changeListeners.forEach(function (f) { f("panel"); });
}
export function resetLayoutCache() { S.layoutCache = { stamp: null, list: null }; }

/* ---------- Annuler / rétablir ----------
   Chaque action enregistre l'état des documents touchés avant et après. */
const H = { undo: [], redo: [], max: 100 };
const historyListeners = [];
export function onHistory(fn) { historyListeners.push(fn); }
function snapOf(id) { const d = S.docs[id]; return d ? JSON.stringify(d) : null; }
export function begin(ids, label) {
  const e = { label: label, ids: ids.slice(), before: {}, at: Date.now() };
  ids.forEach(function (id) { e.before[id] = snapOf(id); });
  return e;
}
export function commit(e, mergeKey) {
  e.after = {};
  let changed = false;
  e.ids.forEach(function (id) { e.after[id] = snapOf(id); if (e.after[id] !== e.before[id]) changed = true; });
  if (!changed) return;
  const top = H.undo[H.undo.length - 1];
  if (mergeKey && top && top.mergeKey === mergeKey && Date.now() - top.at < 2000) { top.after = e.after; top.at = Date.now(); }
  else { e.mergeKey = mergeKey || null; H.undo.push(e); if (H.undo.length > H.max) H.undo.shift(); }
  H.redo.length = 0;
  historyListeners.forEach(function (f) { f(); });
}
/* edit(["id"], "Libellé", function () { …modifications… }) : modifie, enregistre, mémorise pour annuler. */
export function edit(ids, label, fn, mergeKey) {
  const e = begin(ids, label);
  const r = fn();
  ids.forEach(function (id) { const d = S.docs[id]; if (d && e.before[id] !== JSON.stringify(d)) save(d); });
  commit(e, mergeKey);
  return r;
}
function restore(snaps) {
  Object.keys(snaps).forEach(function (id) {
    if (snaps[id] == null) { delete S.docs[id]; save({ id: id, deleted: true }); return; }
    const d = JSON.parse(snaps[id]);
    if (id === "panel") resetLayoutCache();
    save(d);
  });
}
export function undo() { const e = H.undo.pop(); if (!e) return null; restore(e.before); H.redo.push(e); historyListeners.forEach(function (f) { f(); }); return e.label; }
export function redo() { const e = H.redo.pop(); if (!e) return null; restore(e.after); H.undo.push(e); historyListeners.forEach(function (f) { f(); }); return e.label; }
export function canUndo() { return H.undo.length > 0; }
export function canRedo() { return H.redo.length > 0; }
export function undoLabel() { return H.undo.length ? H.undo[H.undo.length - 1].label : ""; }
export function redoLabel() { return H.redo.length ? H.redo[H.redo.length - 1].label : ""; }
export function clearHistory() { H.undo.length = 0; H.redo.length = 0; historyListeners.forEach(function (f) { f(); }); }
