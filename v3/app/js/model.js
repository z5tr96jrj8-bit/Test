/* Règles du métier : panel, tags, temps de match. Fonctions pures, testées dans tests/model.test.mjs. */
import { isHex, clampInt, uid } from "./util.js";

export const DEFAULT_EVENTS = [
  { id: "sortie_courte", grp: "Construction", label: "Sortie de balle courte", res: ["Réussie", "Perdue"] },
  { id: "sortie_longue", grp: "Construction", label: "Sortie de balle longue", res: ["Réussie", "Perdue"] },
  { id: "pressing", grp: "Pressing", label: "Pressing", res: ["Récupération", "Éliminé", "Faute"] },
  { id: "recuperation", grp: "Pressing", label: "Récupération", res: ["Tir", "Conservée", "Reperdue"] },
  { id: "perte", grp: "Transition", label: "Perte de balle", res: ["Regagnée", "Contre subi", "Sans danger"] },
  { id: "entree_tiers", grp: "Création", label: "Entrée dernier tiers", res: ["Tir", "Centre", "Perdue"] },
  { id: "tir", grp: "Création", label: "Tir", res: ["But", "Cadré", "Non cadré"] },
  { id: "cpa", grp: "Arrêts de jeu", label: "Coup de pied arrêté", res: ["But", "Tir", "Dégagé"] }
];
export const FLAG_EVENT = { id: "a_revoir", label: "À revoir", res: [], flag: true };
export const DEFAULT_RESULTS = ["Réussi", "Raté"];
export const DEF_PRE = 5, DEF_POST = 5;
export const THIRDS = ["Défensif", "Médian", "Offensif"];
export const LANES = ["Aile gauche", "Demi-espace gauche", "Axe", "Demi-espace droit", "Aile droite"];
export const PERIODS = [null,
  { name: "1re mi-temps", base: 0 }, { name: "2e mi-temps", base: 45 },
  { name: "Prolongation 1", base: 90 }, { name: "Prolongation 2", base: 105 }];

/* Grille du panel : 48 colonnes, lignes de 4 px séparées de 2 px. */
export const COLS = 48, ROW_H = 4, PAD_GAP = 2, MAX_ROW = 600;
export const C_HOME = "#24408A", C_AWAY = "#DC3C41", C_FLAG = "#EAB308";
export const PRESETS = [["#24408A", "Bleu"], ["#DC3C41", "Rouge"], ["#1F7A4D", "Vert"], ["#EAB308", "Jaune"], ["#E8730C", "Orange"], ["#7C3AED", "Violet"], ["#334155", "Gris"], ["#F1F5F9", "Blanc"]];
const NAMED = { blue: "#24408A", red: "#DC3C41", white: "#F1F5F9", grey: "#334155", yellow: "#EAB308", green: "#1F7A4D" };
export const PATTERNS = [["none", "Uni"], ["vlines", "Lignes verticales"], ["hlines", "Lignes horizontales"], ["stripes", "Diagonales"], ["grid", "Quadrillage"], ["target", "Cercles"]];
const PAT_OLD = { waves: "hlines", arcs: "stripes", dots: "grid" };
export function isPat(p) { return PATTERNS.some(function (x) { return x[0] === p; }); }
export function teamColor(team) { return team === "away" ? C_AWAY : C_HOME; }

/* ---------- Panel ---------- */
function headItems() {
  return [
    { id: "head_off", type: "label", label: "Offensive", color: "#3B6FE0", pat: "none", c: 0, r: 0, w: 6, h: 1 },
    { id: "head_def", type: "label", label: "Défensive", color: C_AWAY, pat: "none", c: 6, r: 0, w: 6, h: 1 }
  ];
}
function scaleItems(list) { list.forEach(function (it) { it.c *= 2; it.w *= 2; it.r *= 2; it.h *= 2; }); return list; }
function toV4(list) { list.forEach(function (it) { it.c *= 2; it.w *= 2; it.r *= 3; it.h *= 3; }); return list; }

export function defaultLayout() {
  const out = headItems(); let r = 1, last = null;
  DEFAULT_EVENTS.forEach(function (e) {
    const g = e.grp || "";
    if (g !== last) { last = g; if (g) { out.push({ id: "l_" + r, type: "label", label: g, c: 0, r: r, w: 12, h: 1 }); r++; } }
    out.push({ id: e.id + "__h", type: "button", key: e.id, label: e.label, team: "home", color: C_HOME, res: e.res.slice(), c: 0, r: r, w: 6, h: 1 });
    out.push({ id: e.id + "__a", type: "button", key: e.id, label: e.label, team: "away", color: C_AWAY, res: e.res.slice(), c: 6, r: r, w: 6, h: 1 });
    r++;
  });
  out.push({ id: "a_revoir__f", type: "button", key: FLAG_EVENT.id, label: FLAG_EVENT.label, team: "home", color: C_FLAG, flag: true, res: [], c: 0, r: r, w: 12, h: 1 });
  return normLayout(toV4(scaleItems(out)));
}

export function normLayout(arr) {
  const out = [], ids = {};
  (Array.isArray(arr) ? arr : []).slice(0, 80).forEach(function (b) {
    if (!b || typeof b !== "object" || typeof b.label !== "string") return;
    const id = typeof b.id === "string" && b.id && !ids[b.id] ? b.id.slice(0, 48) : uid("b");
    ids[id] = true;
    const w = clampInt(b.w, 1, COLS, 6); let c = clampInt(b.c, 0, COLS - 1, 0);
    if (c + w > COLS) c = COLS - w;
    const it = { id: id, type: b.type === "label" ? "label" : "button", label: b.label.slice(0, 30), c: c, r: clampInt(b.r, 0, MAX_ROW, 0), w: w, h: clampInt(b.h, 1, 200, 1) };
    it.bw = clampInt(b.bw, 0, 8, 0);
    it.dur = b.dur === "toggle" ? "toggle" : "";
    it.pre = typeof b.pre === "number" ? clampInt(b.pre, 0, 60, DEF_PRE) : null;
    it.post = typeof b.post === "number" ? clampInt(b.post, 0, 60, DEF_POST) : null;
    it.pat = isPat(b.pat) ? b.pat : (PAT_OLD[b.pat] || "none");
    it.bd = isHex(b.bd) ? b.bd.toUpperCase() : "";
    if (it.type === "label") it.color = isHex(b.color) ? b.color.toUpperCase() : "";
    else {
      it.key = typeof b.key === "string" && b.key ? b.key.slice(0, 48) : id;
      it.team = b.team === "away" ? "away" : "home";
      it.flag = it.key === FLAG_EVENT.id;
      it.color = isHex(b.color) ? b.color.toUpperCase() : (NAMED[b.color] || (it.flag ? C_FLAG : teamColor(it.team)));
      it.res = (Array.isArray(b.res) ? b.res : []).filter(function (x) { return typeof x === "string" && x.trim(); }).slice(0, 4).map(function (x) { return x.trim().slice(0, 20); });
      if (typeof b.sc === "string" && b.sc) it.sc = b.sc.slice(0, 24);
    }
    out.push(it);
  });
  return out;
}

/* Boutons d'un document « panel » (avec les conversions des anciennes grilles). */
export function layoutOf(p) {
  let list = p && !p.deleted && Array.isArray(p.buttons) ? normLayout(p.buttons) : [];
  if (list.length && p.v !== 4) {
    if (p.v !== 3) {
      if (!(p.h >= 1)) { list.forEach(function (it) { it.r = it.r + 1; }); list = normLayout(headItems()).concat(list); }
      scaleItems(list);
    }
    toV4(list);
  }
  return list.length ? list : defaultLayout();
}

export function padButtons(list) {
  return list.filter(function (b) { return b.type === "button"; }).sort(function (a, b) { return (a.r - b.r) || (a.c - b.c); });
}
export function itemIn(list, id) { for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

/* ---------- Tags ---------- */
export function evFind(list, id) {
  for (let i = 0; i < list.length; i++) if (list[i].type === "button" && list[i].key === id) return { id: id, label: list[i].label, res: list[i].res, flag: !!list[i].flag };
  if (id === FLAG_EVENT.id) return FLAG_EVENT;
  for (let j = 0; j < DEFAULT_EVENTS.length; j++) if (DEFAULT_EVENTS[j].id === id) return DEFAULT_EVENTS[j];
  return null;
}
export function isFlag(t) { return t.ev === FLAG_EVENT.id; }
export function tagLabel(t, list) {
  if (t.btn) { const b = itemIn(list, t.btn); if (b && b.type === "button") return b.label; }
  if (t.lbl) return t.lbl;
  const e = evFind(list, t.ev); return e ? e.label : t.ev;
}
export function tagButton(t, list) {
  const bs = padButtons(list);
  if (t.btn) for (let i = 0; i < bs.length; i++) if (bs[i].id === t.btn) return bs[i];
  const lbl = tagLabel(t, list);
  for (let i = 0; i < bs.length; i++) if (bs[i].label === lbl && (bs[i].flag || bs[i].team === t.team)) return bs[i];
  return null;
}
export function tagColor(t, list) { const b = tagButton(t, list); return b ? b.color : (isHex(t.col) ? t.col : (isFlag(t) ? C_FLAG : teamColor(t.team))); }
/* Résultats proposés pour un tag : ceux de son bouton, sinon Réussi / Raté. */
export function resultsFor(t, list) {
  const b = tagButton(t, list);
  const r = b ? b.res : (evFind(list, t.ev) || { res: [] }).res;
  return r && r.length ? r : DEFAULT_RESULTS;
}
export function pre(t) { return typeof t.d0 === "number" ? t.d0 : DEF_PRE; }
export function post(t) { return typeof t.d1 === "number" ? t.d1 : DEF_POST; }

/* ---------- Temps ---------- */
export function matchTime(p, t) { return (PERIODS[p] ? PERIODS[p].base : 0) * 60 + t; }
export function isVideo(m) { return !!m && m.mode === "video"; }
export function derive(m, v) {
  const k1 = m.video && m.video.k1 != null ? m.video.k1 : 0;
  const k2 = m.video ? m.video.k2 : null;
  if (k2 != null && v >= k2) return { p: 2, t: Math.floor(v - k2) };
  return { p: 1, t: Math.max(0, Math.floor(v - k1)) };
}
export function recomputeTags(m) { m.tags.forEach(function (t) { if (t.v != null) { const d = derive(m, t.v); t.p = d.p; t.t = d.t; } }); }
export function tlPos(m, t) { return isVideo(m) ? t.v : matchTime(t.p, t.t); }
export function clipOf(m, t) { const p = tlPos(m, t); if (p == null) return null; return { start: Math.max(0, p - pre(t)), end: p + post(t), tagId: t.id }; }

/* Une ligne par bouton du panel, puis les tags dont le bouton a disparu. */
export function tlRows(m, list) {
  const rows = [], byBtn = {}, orphan = {};
  padButtons(list).forEach(function (b) { const r = { key: "b:" + b.id, label: b.label, color: b.color, team: b.flag ? "" : b.team, tags: [] }; byBtn[b.id] = r; rows.push(r); });
  m.tags.forEach(function (t) {
    const b = tagButton(t, list);
    if (b) { byBtn[b.id].tags.push(t); return; }
    const k = "k:" + tagLabel(t, list) + "|" + (isFlag(t) ? "" : t.team);
    if (!orphan[k]) { orphan[k] = { key: k, label: tagLabel(t, list), color: tagColor(t, list), team: isFlag(t) ? "" : t.team, tags: [] }; rows.push(orphan[k]); }
    orphan[k].tags.push(t);
  });
  rows.forEach(function (r, i) { r.n = i + 1; });
  return rows;
}

/* Nom court d'un match dans un projet : l'adversaire de l'équipe commune (ou de « Mon équipe »). */
export function shortLabel(ms, m, myTeam) {
  let common = myTeam && (m.home === myTeam || m.away === myTeam) ? myTeam : null;
  if (!common && ms.length >= 2) [m.home, m.away].forEach(function (t) { if (!common && ms.every(function (x) { return x.home === t || x.away === t; })) common = t; });
  const lab = common ? (m.home === common ? m.away : m.home) : m.home + " – " + m.away;
  return lab.length > 22 ? lab.slice(0, 21) + "…" : lab;
}
