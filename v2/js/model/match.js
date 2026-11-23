/* Matchs, tags, temps de match et regroupement des tags par ligne de timeline. */

import { store } from "../core/store.js";
import { uid, r1, normLabel } from "../core/util.js";
import { buttons, buttonForTag, rowKey, DEF_PRE, DEF_POST } from "./panel.js";

export const PERIODS = [null,
  { name: "1st half", base: 0 }, { name: "2nd half", base: 45 },
  { name: "Extra time 1", base: 90 }, { name: "Extra time 2", base: 105 }];
export const THIRDS = ["Defensive", "Middle", "Attacking"];
export const LANES = ["Left wing", "Left half-space", "Centre", "Right half-space", "Right wing"];

export function newMatch(f) {
  const now = Date.now();
  return {
    id: uid("m"), kind: "match", v: 2,
    home: f.home, away: f.away, date: f.date || "", comp: f.comp || "",
    mode: f.mode || "live",
    video: { name: "", pos: 0, k1: null, k2: null },
    clock: { period: 1, phase: "pre", running: false, startedAt: 0, acc: 0 },
    tags: [], lists: [], createdAt: now, updatedAt: now
  };
}

export const matches = () => store.all("match").sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
export const isVideo = (m) => m && m.mode === "video";
export const findTag = (m, id) => (id ? m.tags.find((t) => t.id === id) || null : null);

/* ---------- Temps ---------- */
/** Mi-temps d'un instant de la vidéo, à partir des repères coup d'envoi (k1) et 2e mi-temps (k2). */
export function periodAt(m, at) {
  if (!isVideo(m)) return null;
  const k2 = m.video.k2;
  return k2 != null && at >= k2 ? 2 : 1;
}
/** Période d'un tag : calculée en vidéo, enregistrée en direct. */
export const tagPeriod = (m, t) => (isVideo(m) ? periodAt(m, t.at) : t.period || 1);
/** Temps de match affiché (mm:ss) d'un tag. */
export function matchSeconds(m, t) {
  if (!isVideo(m)) return t.at;
  const k1 = m.video.k1 || 0, k2 = m.video.k2;
  if (k2 != null && t.at >= k2) return 45 * 60 + (t.at - k2);
  return Math.max(0, t.at - k1);
}
export const pre = (t) => Math.max(0, t.at - t.start);
export const post = (t) => Math.max(0, t.end - t.at);
export const clipOf = (t) => ({ start: Math.max(0, t.start), end: Math.max(t.start + 0.5, t.end), tagId: t.id });

/* ---------- Chrono du direct ---------- */
export function clockMs(m) { const c = m.clock; return c.acc + (c.running ? Date.now() - c.startedAt : 0); }
export function liveSeconds(m) {
  if (m.clock.phase === "pre") return 0;
  return (PERIODS[m.clock.period] ? PERIODS[m.clock.period].base : 0) * 60 + Math.floor(clockMs(m) / 1000);
}

/* ---------- Création d'un tag ---------- */
export function makeTag(m, btn, at) {
  const P0 = btn.pre != null ? btn.pre : DEF_PRE, P1 = btn.post != null ? btn.post : DEF_POST;
  at = r1(at);
  const t = {
    id: uid("t"), catId: btn.id, label: btn.label, color: btn.color, side: btn.side, role: btn.role || "",
    at, start: Math.max(0, r1(at - P0)), end: r1(at + P1),
    result: "", zone: null, note: "", createdAt: Date.now()
  };
  if (!isVideo(m)) t.period = m.clock.period;
  return t;
}

/* ---------- Lignes de la timeline : une par bouton du panel, puis les tags « orphelins » ---------- */
/** Renvoie [{ key, label, color, side, btn, tags[] }]. Les tags sont triés par temps. */
export function tagRows(m) {
  const rows = [], byKey = new Map();
  buttons().forEach((b) => {
    const k = rowKey(b.label, b.side);
    if (byKey.has(k)) return;
    const r = { key: k, label: b.label, color: b.color, side: b.side, btn: b, tags: [] };
    byKey.set(k, r); rows.push(r);
  });
  m.tags.forEach((t) => {
    const b = buttonForTag(t);
    let r = b ? byKey.get(rowKey(b.label, b.side)) : byKey.get(rowKey(t.label, t.side));
    if (!r) {
      r = { key: rowKey(t.label, t.side), label: t.label, color: t.color, side: t.side, btn: null, tags: [] };
      byKey.set(r.key, r); rows.push(r);
    }
    r.tags.push(t);
  });
  rows.forEach((r, i) => { r.n = i + 1; r.tags.sort((a, b) => a.at - b.at); });
  return rows;
}
/** Clé de ligne d'un tag (pour les mises à jour ciblées). */
export function rowKeyOfTag(t) { const b = buttonForTag(t); return b ? rowKey(b.label, b.side) : rowKey(t.label, t.side); }

/* ---------- Score : boutons dont le rôle est « but pour » / « but contre » ---------- */
export function score(m) {
  let f = 0, a = 0;
  m.tags.forEach((t) => { if (t.role === "goal_for") f++; else if (t.role === "goal_against") a++; });
  return { for: f, against: a };
}

/* ---------- Listes de lecture ---------- */
export function listTags(m, l) {
  const set = new Set(l.tagIds);
  return m.tags.filter((t) => set.has(t.id)).sort((a, b) => a.at - b.at);
}

/** Durée totale utile pour la timeline. */
export function axisDuration(m, videoDuration) {
  if (isVideo(m) && videoDuration > 0) return videoDuration;
  let d = isVideo(m) ? 600 : 95 * 60;
  if (!isVideo(m)) d = Math.max(d, liveSeconds(m) + 60);
  m.tags.forEach((t) => { if (t.end + 60 > d) d = t.end + 60; });
  return d;
}

export const sameLabel = (a, b) => normLabel(a) === normLabel(b);
