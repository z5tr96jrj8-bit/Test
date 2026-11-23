/* Exports de données : CSV (une ligne par tag), JSON d'un match, sauvegarde complète. */

import { store } from "../core/store.js";
import { fmt, fmtLong, cleanName, downloadFile, today } from "../core/util.js";
import { PERIODS, THIRDS, LANES, isVideo, tagPeriod, matchSeconds, pre, post, tagRows } from "../model/match.js";

function cell(v, sep) {
  v = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; // pas de formule exécutée à l'ouverture dans Excel
  if (v.includes('"') || v.includes(sep) || /[\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
  return v;
}

export function buildCsv(m, sep) {
  const head = ["match", "date", "competition", "period", "match_time", "match_seconds", "video_time", "video_seconds", "clip_start", "clip_end", "clip_length_s", "row", "event", "phase", "third", "lane", "result", "note"];
  const rowNo = new Map();
  tagRows(m).forEach((r) => r.tags.forEach((t) => rowNo.set(t.id, r.n)));
  const lines = [head];
  m.tags.slice().sort((a, b) => a.at - b.at).forEach((t) => {
    const ms = matchSeconds(m, t), p = tagPeriod(m, t), vid = isVideo(m);
    lines.push([
      m.home + " - " + m.away, m.date || "", m.comp || "",
      PERIODS[p] ? PERIODS[p].name : p, fmt(ms), Math.floor(ms),
      vid ? fmtLong(t.at) : "", vid ? Math.floor(t.at) : "",
      vid ? fmtLong(t.start) : fmt(t.start), vid ? fmtLong(t.end) : fmt(t.end),
      Math.round((pre(t) + post(t)) * 10) / 10,
      rowNo.get(t.id) || "", t.label, t.side === "without" ? "without ball" : "with ball",
      t.zone ? THIRDS[t.zone.third] : "", t.zone ? LANES[t.zone.lane] : "",
      t.result || "", t.note || ""
    ]);
  });
  return "﻿" + lines.map((r) => r.map((c) => cell(c, sep)).join(sep)).join("\r\n") + "\r\n";
}

export const baseName = (m) => (m.date || "match") + "_" + (cleanName(m.home) || "home") + "_" + (cleanName(m.away) || "away");

export function saveCsv(m, sep) { downloadFile(baseName(m) + ".csv", buildCsv(m, sep)); }

export function saveMatchJson(m) {
  const data = { app: "rl-analysis", v: 2, exportedAt: Date.now(), docs: [m, store.get("panels")].filter(Boolean) };
  downloadFile(baseName(m) + ".json", JSON.stringify(data));
}

/** Tous les matchs, projets et panels dans un seul fichier. */
export function saveBackup() {
  const docs = ["match", "project", "panels"].flatMap((k) => store.all(k));
  downloadFile("rl-analysis_backup_" + today() + ".json", JSON.stringify({ app: "rl-analysis", v: 2, exportedAt: Date.now(), docs }));
  try { localStorage.setItem("rl2.lastBackup", String(Date.now())); } catch (e) { /* rien */ }
}
