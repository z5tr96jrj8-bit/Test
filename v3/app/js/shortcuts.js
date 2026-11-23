/* Raccourcis clavier, modifiables dans Réglages.
   Les lettres et la ponctuation sont reconnues par le caractère tapé (AZERTY comme QWERTY),
   les chiffres par leur position (1 à 4 sans Maj en AZERTY). Inactifs pendant la saisie dans un champ. */
import { S, pref, setPref } from "./state.js";
import { padButtons } from "./model.js";

export const ACTIONS = [
  ["play", "Lecture / pause", "Space"],
  ["back5", "Reculer de 5 s", "ArrowLeft"],
  ["fwd5", "Avancer de 5 s", "ArrowRight"],
  ["back20", "Reculer de 20 s", "Shift+ArrowLeft"],
  ["fwd20", "Avancer de 20 s", "Shift+ArrowRight"],
  ["rate1", "Vitesse ×1", ","],
  ["rate15", "Vitesse ×1,5", ";"],
  ["rate2", "Vitesse ×2", ":"],
  ["res1", "Résultat 1 du tag en cours", "Digit1"],
  ["res2", "Résultat 2", "Digit2"],
  ["res3", "Résultat 3", "Digit3"],
  ["res4", "Résultat 4", "Digit4"],
  ["delLast", "Supprimer le dernier tag", "Backspace"],
  ["prevClip", "Clip précédent", "p"],
  ["nextClip", "Clip suivant", "n"],
  ["accept", "Accepter la suggestion", "Enter"],
  ["reject", "Rejeter la suggestion", "Delete"],
  ["undo", "Annuler", "Mod+z"],
  ["redo", "Rétablir", "Mod+Shift+z"],
  ["pageCode", "Page Codage", "Alt+Digit1"],
  ["pageAna", "Page Analyse", "Alt+Digit2"]
];
const LEFT = "azertyuio", RIGHT = "qsdfghjklm", EXTRA = "wxcvb";
const NAMED = { Space: 1, ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, Backspace: 1, Delete: 1, Enter: 1, Escape: 1, Tab: 1, Home: 1, End: 1, PageUp: 1, PageDown: 1 };

export function comboOf(e) {
  let k, shiftCounts = true;
  if (/^(Digit|Numpad)\d$/.test(e.code)) k = "Digit" + e.code.slice(-1);
  else if (e.code === "Space" || e.key === " ") k = "Space";
  else if (NAMED[e.key]) k = e.key;
  else if (/^F\d{1,2}$/.test(e.key)) k = e.key;
  else if (e.key && e.key.length === 1) { k = e.key.toLowerCase(); if (!/[a-zà-ÿ]/.test(k)) shiftCounts = false; }
  else return null;
  const mods = [];
  if (e.metaKey || e.ctrlKey) mods.push("Mod");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey && shiftCounts) mods.push("Shift");
  return mods.concat([k]).join("+");
}
const MAC = typeof navigator !== "undefined" && /Mac|iPad|iPhone/.test(navigator.platform || navigator.userAgent || "");
export function labelOf(combo) {
  if (!combo) return "—";
  return combo.split("+").map(function (p) {
    if (p === "Mod") return MAC ? "⌘" : "Ctrl";
    if (p === "Shift") return MAC ? "⇧" : "Maj";
    if (p === "Alt") return MAC ? "⌥" : "Alt";
    if (p === "Space") return "Espace";
    if (/^Digit\d$/.test(p)) return p.slice(5);
    return { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Backspace: "⌫", Delete: "Suppr", Enter: "Entrée", Escape: "Échap", Tab: "Tab" }[p] || p.toUpperCase();
  }).join(MAC ? "" : "+");
}

export function bindings() {
  const saved = pref("shortcuts", {}), out = {};
  ACTIONS.forEach(function (a) { out[a[0]] = saved[a[0]] !== undefined ? saved[a[0]] : a[2]; });
  return out;
}
export function setBinding(action, combo) { const saved = Object.assign({}, pref("shortcuts", {})); saved[action] = combo; setPref("shortcuts", saved); }
export function resetBindings() { setPref("shortcuts", {}); setPref("buttonKeys", {}); }

/* Touches des boutons du panel : celles choisies, sinon attribution automatique par colonne. */
export function buttonKeys(list) {
  const saved = pref("buttonKeys", {}), out = {}, used = {};
  const acts = bindings(); Object.keys(acts).forEach(function (k) { if (acts[k]) used[acts[k]] = true; });
  const bs = padButtons(list);
  bs.forEach(function (b) { const k = saved[b.id]; if (k !== undefined) { out[b.id] = k; if (k) used[k] = true; } });
  let li = 0, ri = 0, xi = 0;
  function next(pool, i) { while (i.v < pool.length && used[pool[i.v]]) i.v++; return i.v < pool.length ? pool[i.v++] : ""; }
  const L = { v: li }, R = { v: ri }, X = { v: xi };
  bs.forEach(function (b) {
    if (out[b.id] !== undefined) return;
    let k = "";
    if (b.w >= 40) k = next(EXTRA, X);
    else if (b.c < 24) k = next(LEFT, L) || next(EXTRA, X);
    else k = next(RIGHT, R) || next(EXTRA, X);
    out[b.id] = k; if (k) used[k] = true;
  });
  return out;
}
export function setButtonKey(id, combo) { const saved = Object.assign({}, pref("buttonKeys", {})); saved[id] = combo; setPref("buttonKeys", saved); }

/* Écoute du clavier. handlers : { action: fn }, onButton(buttonId). */
export function installShortcuts(handlers, onButton, isEnabled) {
  document.addEventListener("keydown", function (e) {
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (capturing) return;
    if (!isEnabled()) return;
    const combo = comboOf(e); if (!combo) return;
    const acts = bindings();
    let action = null;
    Object.keys(acts).forEach(function (a) { if (acts[a] === combo) action = a; });
    if (!action && combo === "Mod+y") action = "redo";
    if (action && handlers[action]) { if (handlers[action](e) !== false) { e.preventDefault(); } return; }
    const keys = buttonKeys(S.layoutCache.list || []);
    for (const id in keys) if (keys[id] && keys[id] === combo) { e.preventDefault(); onButton(id); return; }
  });
}

/* Saisie d'un nouveau raccourci dans les réglages */
let capturing = false;
export function captureCombo(done) {
  capturing = true;
  function h(e) {
    if (["Shift", "Control", "Meta", "Alt"].indexOf(e.key) >= 0) return;
    e.preventDefault(); e.stopPropagation();
    document.removeEventListener("keydown", h, true);
    capturing = false;
    done(e.key === "Escape" ? null : comboOf(e));
  }
  document.addEventListener("keydown", h, true);
}
