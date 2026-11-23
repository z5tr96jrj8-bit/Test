/* Panels de codage : boutons et titres posés sur une grille libre (48 colonnes, lignes de 4 px),
   plusieurs panels enregistrés (modèles), un panel actif. */

import { store } from "../core/store.js";
import { uid, clamp, isHex, normLabel, textOn, clone } from "../core/util.js";

export const COLS = 48, ROW_H = 4, PAD_GAP = 2, MAX_ROW = 600;
export const DEF_PRE = 5, DEF_POST = 5;
export const C_WITH = "#E9EDF2", C_WITHOUT = "#2F3A4D", C_REVIEW = "#EAB308";
export const PRESETS = [["#24408A", "Blue"], ["#DC3C41", "Red"], ["#1F7A4D", "Green"], ["#EAB308", "Yellow"], ["#E8730C", "Orange"], ["#7C3AED", "Purple"], ["#334155", "Grey"], ["#F1F5F9", "White"]];
export const PATTERNS = [["none", "Plain"], ["vlines", "Vertical lines"], ["hlines", "Horizontal lines"], ["stripes", "Diagonals"], ["grid", "Grid"], ["target", "Circles"]];
export const ROLES = [["", "Normal"], ["goal_for", "Goal (for)"], ["goal_against", "Goal (against)"], ["review", "To review"]];
const PAT_OLD = { waves: "hlines", arcs: "stripes", dots: "grid" };

/* ---------- Modèle par défaut « RL Football » : gauche = avec ballon, droite = sans ballon ---------- */
const TEMPLATE = [
  // [libellé, côté, couleur, avant, après, résultats, rôle]
  ["GOAL KICK", "with", C_WITH, 5, 15, ["Short", "Long"]],
  ["PRESSING ON GOAL KICK", "without", C_WITHOUT, 5, 15, ["Ball won", "Long ball forced", "Broken"]],
  ["BUILD-UP", "with", C_WITH, 5, 15, ["Reach middle", "Lost"]],
  ["PRESSING ON BUILD-UP", "without", C_WITHOUT, 5, 15, ["Ball won", "Long ball forced", "Broken"]],
  ["OPEN PLAY", "with", C_WITH, 5, 20, ["Third entry", "Lost"]],
  ["HIGH DEFENSIVE BLOCK", "without", C_WITHOUT, 5, 20, ["Pushed wide", "Line broken", "Ball won"]],
  ["OFF TRANSITION", "with", C_WITH, 5, 12, ["Counter", "Slowed down"]],
  ["M DEFENSIVE BLOCK", "without", C_WITHOUT, 5, 20, ["Pushed wide", "Line broken", "Ball won"]],
  ["REST DEFENSE", "with", "#556279", 5, 10, ["2+1", "3+1", "3+2", "4+1"]],
  ["L DEFENSIVE BLOCK", "without", C_WITHOUT, 5, 20, ["Cross conceded", "Shot conceded", "Cleared"]],
  ["GOAL", "with", "#1F7A4D", 20, 8, ["Open play", "Set piece", "Counter"], "goal_for"],
  ["DEF TRANSITION", "without", "#556279", 5, 12, ["Won back under 5s", "Foul"]],
  ["GOAL CHANCE", "with", "#A9791A", 12, 5, ["On target", "Off target"]],
  ["GOAL CONCEDED", "without", "#DC3C41", 20, 8, ["Open play", "Set piece", "Counter"], "goal_against"],
  ["OFF CORNER", "with", "#9DAEC6", 5, 12, ["Goal", "Shot", "Cleared"]],
  ["GOAL CHANCE CONCEDED", "without", "#A9791A", 12, 5, ["On target", "Off target"]],
  ["OFF FREE-KICK", "with", "#9DAEC6", 5, 12, []],
  ["DEF CORNER", "without", "#9DAEC6", 5, 12, ["Goal", "Shot", "Cleared"]],
  ["", "", "", 0, 0, []],
  ["DEF FREE-KICK", "without", "#9DAEC6", 5, 12, []]
];
export function defaultButtons() {
  const out = [
    { id: uid("b"), type: "label", label: "WITH BALL", color: "#3B6FE0", c: 0, r: 0, w: 24, h: 6 },
    { id: uid("b"), type: "label", label: "WITHOUT BALL", color: "#DC3C41", c: 24, r: 0, w: 24, h: 6 }
  ];
  TEMPLATE.forEach((d, i) => {
    if (!d[0]) return;
    const row = 6 + Math.floor(i / 2) * 9;
    out.push(normItem({ id: uid("b"), type: "button", label: d[0], side: d[1], color: d[2], pre: d[3], post: d[4], res: d[5], role: d[6] || "", c: d[1] === "with" ? 0 : 24, r: row, w: 24, h: 8 }));
  });
  out.push(normItem({ id: uid("b"), type: "button", label: "TO REVIEW", side: "with", color: C_REVIEW, role: "review", c: 0, r: 6 + 10 * 9, w: 48, h: 6 }));
  return out.map(normItem);
}

const ci = (v, lo, hi, d) => { v = Math.round(Number(v)); return isFinite(v) ? clamp(v, lo, hi) : d; };

/** Nettoie un élément du panel (données importées ou anciennes). */
export function normItem(b) {
  const w = ci(b.w, 1, COLS, 12);
  let c = ci(b.c, 0, COLS - 1, 0); if (c + w > COLS) c = COLS - w;
  const it = {
    id: typeof b.id === "string" && b.id ? b.id.slice(0, 48) : uid("b"),
    type: b.type === "label" ? "label" : "button",
    label: String(b.label || "").slice(0, 30),
    c, r: ci(b.r, 0, MAX_ROW, 0), w, h: ci(b.h, 1, 200, 6),
    color: isHex(b.color) ? b.color.toUpperCase() : "",
    pat: PATTERNS.some((p) => p[0] === b.pat) ? b.pat : (PAT_OLD[b.pat] || "none"),
    bd: isHex(b.bd) ? b.bd.toUpperCase() : "",
    bw: ci(b.bw, 0, 8, 0)
  };
  if (it.type === "button") {
    it.side = b.side === "without" ? "without" : "with";
    it.role = ROLES.some((r) => r[0] === b.role) ? b.role : "";
    if (!it.color) it.color = it.role === "review" ? C_REVIEW : (it.side === "with" ? C_WITH : C_WITHOUT);
    it.pre = typeof b.pre === "number" ? ci(b.pre, 0, 60, DEF_PRE) : null;
    it.post = typeof b.post === "number" ? ci(b.post, 0, 60, DEF_POST) : null;
    it.res = (Array.isArray(b.res) ? b.res : []).filter((x) => typeof x === "string" && x.trim()).slice(0, 6).map((x) => x.trim().slice(0, 24));
    it.key = typeof b.key === "string" ? b.key.slice(0, 16) : ""; // raccourci clavier (phase 4)
  }
  return it;
}

/* ---------- Bibliothèque de panels (document « panels ») ---------- */
export function panelsDoc() {
  let d = store.get("panels");
  if (!d) {
    const first = { id: uid("pl"), name: "RL Football", buttons: defaultButtons() };
    d = { id: "panels", kind: "panels", active: first.id, items: [first] };
    store.put(d);
  }
  if (!d.items.some((i) => i.id === d.active)) d.active = d.items[0].id;
  return d;
}
export function activePanel() { const d = panelsDoc(); return d.items.find((i) => i.id === d.active) || d.items[0]; }

/* Cache : boutons triés et index par libellé, recalculés seulement quand le panel change. */
let cache = { stamp: null };
function index() {
  const d = panelsDoc(), p = activePanel();
  const stamp = d.updatedAt + ":" + p.id;
  if (cache.stamp === stamp) return cache;
  const buttons = p.buttons.filter((b) => b.type === "button").sort((a, b) => (a.r - b.r) || (a.c - b.c));
  const byId = new Map(), byKey = new Map(), byLabel = new Map();
  buttons.forEach((b) => {
    byId.set(b.id, b);
    byKey.set(rowKey(b.label, b.side), b);
    const l = normLabel(b.label);
    if (!byLabel.has(l)) byLabel.set(l, []);
    byLabel.get(l).push(b);
  });
  cache = { stamp, buttons, byId, byKey, byLabel };
  return cache;
}
export const buttons = () => index().buttons;
export const buttonById = (id) => index().byId.get(id) || null;
export function itemById(id) { return activePanel().buttons.find((b) => b.id === id) || null; }
export const rowKey = (label, side) => normLabel(label) + "|" + (side || "");

/** Bouton du panel actif qui correspond à un tag : même libellé et même côté, sinon même libellé. */
export function buttonForTag(t) {
  const ix = index();
  const exact = ix.byKey.get(rowKey(t.label, t.side));
  if (exact) return exact;
  const same = ix.byLabel.get(normLabel(t.label));
  return same && same.length === 1 ? same[0] : null;
}
export function invalidate() { cache = { stamp: null }; }

/** Modifie le panel actif (avec annulation). */
export function editPanel(label, fn) {
  return store.mutate("panels", label, (d) => {
    const p = d.items.find((i) => i.id === d.active);
    const r = fn(p, d);
    invalidate();
    return r || { type: "panel" };
  });
}

/* ---------- Dessin des boutons : couleur, motif, bord ---------- */
export function patternCss(pat, base) {
  const light = textOn(base) === "#FFFFFF";
  const ink = light ? "rgba(255,255,255,.26)" : "rgba(0,0,0,.2)";
  switch (pat) {
    case "vlines": return [`repeating-linear-gradient(90deg, ${ink} 0, ${ink} 1px, transparent 1px, transparent 7px)`, "auto"];
    case "hlines": return [`repeating-linear-gradient(0deg, ${ink} 0, ${ink} 1px, transparent 1px, transparent 6px)`, "auto"];
    case "stripes": return [`repeating-linear-gradient(135deg, transparent 0, transparent 7px, ${ink} 7px, ${ink} 8px)`, "auto"];
    case "grid": return [`linear-gradient(${ink} 1px, transparent 1px), linear-gradient(90deg, ${ink} 1px, transparent 1px)`, "12px 12px"];
    case "target": {
      const ring = light ? "rgba(255,255,255,.8)" : "rgba(12,30,70,.88)";
      return [`repeating-radial-gradient(circle at 50% 50%, transparent 0, transparent 4px, ${ring} 4px, ${ring} 7px, transparent 7px, transparent 10px)`, "auto"];
    }
    default: return ["none", "auto"];
  }
}
export function paint(node, it) {
  const color = it.color || "";
  if (color) {
    const p = patternCss(it.pat || "none", color);
    node.style.backgroundColor = color;
    node.style.backgroundImage = p[0];
    node.style.backgroundSize = p[1];
    node.style.color = textOn(color);
  } else {
    node.style.backgroundColor = ""; node.style.backgroundImage = ""; node.style.color = "";
  }
  const w = it.bw || (it.bd ? 2 : 0);
  node.style.border = w ? `${w}px solid ${it.bd || "rgba(255,255,255,.28)"}` : "";
}

/** Copie profonde des boutons du panel actif (pour dupliquer un panel). */
export const snapshotButtons = () => clone(activePanel().buttons);
