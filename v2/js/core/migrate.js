/* Lecture des données de la v1 (« carnet-de-tags ») et des exports v2.
   Formats reconnus :
   - sauvegarde complète v1   { app: "carnet-de-tags", v: 1, all: { id: doc, … } }
   - export d'un match v1     { app: "carnet-de-tags", v: 1, match, panel }
   - stockage v1 de l'appareil (même contenu que « all »)
   - export v2                { app: "rl-analysis", v: 2, docs: [ … ] }
   Rien n'est jamais modifié dans la source : on produit de nouveaux documents v2. */

import { uid, isHex, normLabel, clamp } from "./util.js";
import { normItem, COLS } from "../model/panel.js";

const FR_THIRDS = ["Défensif", "Médian", "Offensif"];
const FR_LANES = ["Aile gauche", "Demi-espace gauche", "Axe", "Demi-espace droit", "Aile droite"];
const V1_BASE = [0, 0, 45, 90, 105];
const V1_FLAG = "a_revoir";
const V1_DEFAULT_LABELS = { sortie_courte: "Sortie de balle courte", sortie_longue: "Sortie de balle longue", pressing: "Pressing", recuperation: "Récupération", perte: "Perte de balle", entree_tiers: "Entrée dernier tiers", tir: "Tir", cpa: "Coup de pied arrêté", a_revoir: "À revoir" };

const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
const num = (v, d) => { v = Number(v); return isFinite(v) ? v : d; };

/** Rôle déduit du libellé pour les anciens boutons (score). */
function guessRole(label, isFlag) {
  if (isFlag) return "review";
  const l = normLabel(label);
  if (/^(goal|but|but marqué|goal for)$/.test(l)) return "goal_for";
  if (/^(goal conceded|goal against|but encaissé|but concédé|but contre)$/.test(l)) return "goal_against";
  return "";
}

/* ---------- Panels v1 → v2 ---------- */
/** Applique les mêmes conversions d'échelle que la v1 (anciens pupitres 12 puis 24 colonnes). */
function v1Layout(p) {
  let list = (Array.isArray(p.buttons) ? p.buttons : []).filter((b) => b && typeof b.label === "string").map((b) => Object.assign({}, b));
  if (list.length && p.v !== 4) {
    if (p.v !== 3) {
      if (!(p.h >= 1)) {
        list.forEach((it) => { it.r = (it.r || 0) + 1; });
        list = [{ id: "head_off", type: "label", label: "Offensive", color: "#3B6FE0", c: 0, r: 0, w: 6, h: 1 },
          { id: "head_def", type: "label", label: "Défensive", color: "#DC3C41", c: 6, r: 0, w: 6, h: 1 }].concat(list);
      }
      list.forEach((it) => { it.c *= 2; it.w *= 2; it.r *= 2; it.h *= 2; });
    }
    list.forEach((it) => { it.c *= 2; it.w *= 2; it.r *= 3; it.h *= 3; });
  }
  if (!list.length && Array.isArray(p.events)) {
    // Format très ancien : liste de catégories, une ligne domicile / extérieur par catégorie.
    let r = 6;
    p.events.forEach((e) => {
      if (!e || !e.label) return;
      list.push({ id: e.id + "__h", type: "button", key: e.id, label: e.label, team: "home", color: "#24408A", res: e.res, c: 0, r, w: 24, h: 6 });
      list.push({ id: e.id + "__a", type: "button", key: e.id, label: e.label, team: "away", color: "#DC3C41", res: e.res, c: 24, r, w: 24, h: 6 });
      r += 6;
    });
  }
  return list;
}
function v1Button(b, usedIds) {
  const isFlag = b.key === V1_FLAG || !!b.flag;
  let id = typeof b.id === "string" && b.id ? b.id : uid("b");
  if (usedIds.has(id)) id = uid("b");
  usedIds.add(id);
  const it = normItem({
    id, type: b.type, label: b.label, c: b.c, r: b.r, w: Math.min(COLS, b.w), h: b.h,
    color: b.color, pat: b.pat, bd: b.bd, bw: b.bw,
    side: b.team === "away" ? "without" : "with",
    role: b.type === "label" ? "" : guessRole(b.label, isFlag),
    pre: b.pre, post: b.post, res: b.res
  });
  it.v1id = b.id; // gardé pour relier les anciens tags à leur bouton
  return it;
}

/* ---------- Tags et matchs v1 → v2 ---------- */
function v1Tag(t, m, v1btns) {
  const old = v1btns.get(t.btn) || null;
  const label = str(t.lbl, 30) || (old && old.label) || V1_DEFAULT_LABELS[t.ev] || str(t.ev, 30) || "Tag";
  const p = clamp(Math.round(num(t.p, 1)), 1, 4);
  const at = m.mode === "video" && t.v != null && isFinite(Number(t.v)) ? Math.max(0, Number(t.v)) : V1_BASE[p] * 60 + Math.max(0, num(t.t, 0));
  const d0 = clamp(num(t.d0, 5), 0, 120), d1 = clamp(num(t.d1, 5), 0, 600);
  const th = FR_THIRDS.indexOf(t.third), ln = FR_LANES.indexOf(t.lane);
  const tag = {
    id: str(t.id, 40) || uid("t"), catId: str(t.btn, 48),
    label, color: isHex(t.col) ? t.col.toUpperCase() : (old && isHex(old.color) ? old.color.toUpperCase() : "#64748B"),
    side: t.team === "away" ? "without" : "with",
    role: guessRole(label, t.ev === V1_FLAG),
    at: Math.round(at * 10) / 10, start: Math.max(0, Math.round((at - d0) * 10) / 10), end: Math.round((at + d1) * 10) / 10,
    result: str(t.res, 24), zone: th >= 0 && ln >= 0 ? { third: th, lane: ln } : null, note: str(t.note, 200),
    createdAt: 0
  };
  if (m.mode !== "video") tag.period = p;
  return tag;
}
function v1Match(o, id, v1btns) {
  if (!o || typeof o !== "object" || !Array.isArray(o.tags) || typeof o.home !== "string") return null;
  const mode = o.mode === "video" ? "video" : "live";
  const v = o.video || {};
  const m = {
    id: /^m[a-z0-9]{6,30}$/.test(id || "") ? id : uid("m"), kind: "match", v: 2,
    home: str(o.home, 30) || "Home", away: str(o.away, 30) || "Away",
    date: /^\d{4}-\d{2}-\d{2}$/.test(o.date || "") ? o.date : "", comp: str(o.comp, 40), mode,
    video: { name: str(v.name, 200), pos: Math.max(0, num(v.pos, 0)), k1: v.k1 == null ? null : Math.max(0, num(v.k1, 0)), k2: v.k2 == null ? null : Math.max(0, num(v.k2, 0)) },
    clock: { period: clamp(Math.round(num(o.period, 1)), 1, 4), phase: ["pre", "live", "break", "done"].includes(o.phase) ? o.phase : "pre", running: false, startedAt: 0, acc: o.clock && !o.clock.running ? Math.max(0, num(o.clock.acc, 0)) : 0 },
    tags: [], lists: [],
    createdAt: num(o.createdAt, Date.now()), updatedAt: num(o.updatedAt, Date.now())
  };
  const seen = new Set();
  o.tags.slice(0, 20000).forEach((t) => {
    if (!t || typeof t !== "object") return;
    const tag = v1Tag(t, m, v1btns);
    if (seen.has(tag.id)) tag.id = uid("t");
    seen.add(tag.id); m.tags.push(tag);
  });
  (Array.isArray(o.lists) ? o.lists : []).forEach((l) => {
    if (l && Array.isArray(l.tags)) m.lists.push({ id: str(l.id, 40) || uid("l"), name: str(l.name, 40) || "Playlist", tagIds: l.tags.filter((x) => seen.has(x)) });
  });
  return m;
}

/** Équipe présente dans tous les matchs = équipe analysée. */
function commonTeam(ms) {
  if (ms.length < 2) return "";
  return [ms[0].home, ms[0].away].find((tm) => ms.every((x) => x.home === tm || x.away === tm)) || "";
}

/**
 * Convertit des données v1 ou v2. Renvoie { matches, projects, panels: { items, active } | null, report }.
 */
export function convert(obj) {
  if (!obj || typeof obj !== "object") throw new Error("not-json");
  if (obj.app === "rl-analysis" && Array.isArray(obj.docs)) return fromV2(obj);

  let all = null;
  if (obj.all && typeof obj.all === "object") all = obj.all;
  else if (obj.match) all = { [obj.match.id || "m_import"]: obj.match, panel: obj.panel || null };
  else if (Array.isArray(obj.tags)) all = { [obj.id || "m_import"]: obj };
  else if (Object.values(obj).some((d) => d && Array.isArray(d.tags))) all = obj;
  if (!all) throw new Error("unknown-format");

  // 1) Panels : bibliothèque v1 (« panelLib ») + panel actif (« panel »).
  const used = new Set(), items = [];
  const lib = all.panelLib && !all.panelLib.deleted && Array.isArray(all.panelLib.items) ? all.panelLib : null;
  const activePanelV1 = all.panel && !all.panel.deleted ? v1Layout(all.panel) : [];
  if (lib) {
    lib.items.forEach((pi) => {
      const src = pi.id === lib.active && activePanelV1.length ? activePanelV1 : v1Layout({ v: 4, buttons: pi.buttons });
      if (!src.length) return;
      items.push({ id: str(pi.id, 40) || uid("pl"), name: str(pi.name, 30) || "Panel", buttons: src.map((b) => v1Button(b, used)) });
    });
  } else if (activePanelV1.length) {
    items.push({ id: uid("pl"), name: "My panel (v1)", buttons: activePanelV1.map((b) => v1Button(b, used)) });
  }

  // Index des anciens boutons (id v1 -> bouton) pour retrouver le libellé des tags sans « lbl ».
  const v1btns = new Map();
  activePanelV1.forEach((b) => v1btns.set(b.id, b));

  // 2) Matchs.
  const matches = [];
  let deleted = 0;
  Object.keys(all).forEach((k) => {
    const d = all[k];
    if (!d || typeof d !== "object" || d.kind === "project" || d.kind === "panel" || d.kind === "panelLib") return;
    if (d.deleted) { deleted++; return; }
    const m = v1Match(d, k, v1btns);
    if (m) matches.push(m);
  });
  const ids = new Set(matches.map((m) => m.id));

  // 3) Projets (les références vers des matchs supprimés sont retirées).
  const projects = [];
  let cleaned = 0;
  Object.keys(all).forEach((k) => {
    const d = all[k];
    if (!d || d.deleted || d.kind !== "project") return;
    const mids = (d.matchIds || []).filter((id) => ids.has(id));
    cleaned += (d.matchIds || []).length - mids.length;
    const ms = mids.map((id) => matches.find((m) => m.id === id));
    projects.push({ id: str(d.id, 40) || uid("p"), kind: "project", name: str(d.name, 40) || "Project", team: commonTeam(ms), matchIds: mids, stars: d.stars && typeof d.stars === "object" ? d.stars : {}, last: d.last || null, createdAt: num(d.createdAt, Date.now()), updatedAt: num(d.updatedAt, Date.now()) });
  });

  // 4) Panel actif : celui dont les boutons correspondent au plus grand nombre de tags.
  let active = null;
  if (items.length) {
    const labels = new Map();
    matches.forEach((m) => m.tags.forEach((t) => { const l = normLabel(t.label); labels.set(l, (labels.get(l) || 0) + 1); }));
    let best = -1;
    items.forEach((pi) => {
      const set = new Set(pi.buttons.filter((b) => b.type === "button").map((b) => normLabel(b.label)));
      let n = 0; labels.forEach((c, l) => { if (set.has(l)) n += c; });
      const bonus = lib && pi.id === lib.active ? 0.5 : 0;
      if (n + bonus > best) { best = n + bonus; active = pi.id; }
    });
    // Rôles des tags : repris du bouton correspondant du panel choisi.
    const chosen = items.find((i) => i.id === active);
    const byLabel = new Map(chosen.buttons.filter((b) => b.type === "button").map((b) => [normLabel(b.label) + "|" + b.side, b]));
    matches.forEach((m) => m.tags.forEach((t) => {
      const b = byLabel.get(normLabel(t.label) + "|" + t.side);
      if (b) { if (b.role) t.role = b.role; t.catId = b.id; }
    }));
    items.forEach((pi) => pi.buttons.forEach((b) => { delete b.v1id; }));
  }

  const tags = matches.reduce((n, m) => n + m.tags.length, 0);
  return {
    matches, projects, panels: items.length ? { items, active } : null,
    report: { matches: matches.length, tags, projects: projects.length, panels: items.length, deleted, cleaned,
      activeName: active ? items.find((i) => i.id === active).name : "", noMarkers: matches.filter((m) => m.mode === "video" && m.tags.length && m.video.k1 == null && m.video.k2 == null).length }
  };
}

function fromV2(obj) {
  const matches = obj.docs.filter((d) => d && d.kind === "match" && Array.isArray(d.tags));
  const projects = obj.docs.filter((d) => d && d.kind === "project");
  const pd = obj.docs.find((d) => d && d.kind === "panels");
  const items = pd && Array.isArray(pd.items) ? pd.items.map((pi) => ({ id: pi.id, name: pi.name, buttons: (pi.buttons || []).map(normItem) })) : [];
  return {
    matches, projects, panels: items.length ? { items, active: pd.active } : null,
    report: { matches: matches.length, tags: matches.reduce((n, m) => n + m.tags.length, 0), projects: projects.length, panels: items.length, deleted: 0, cleaned: 0, activeName: "", noMarkers: 0 }
  };
}

/** Données v1 présentes dans ce navigateur (même site), en lecture seule. */
export function readV1Local() {
  try {
    const raw = localStorage.getItem("carnet-de-tags.v1");
    if (!raw) return null;
    const all = JSON.parse(raw);
    return all && typeof all === "object" ? { app: "carnet-de-tags", v: 1, all } : null;
  } catch (e) { return null; }
}
/** Vidéos que la v1 a gardées sur l'appareil : { matchId: { name, size } } */
export function readV1Videos() {
  try { return JSON.parse(localStorage.getItem("carnet-de-tags.videos") || "{}") || {}; } catch (e) { return {}; }
}
