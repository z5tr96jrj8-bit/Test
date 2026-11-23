/* Export CSV : mêmes colonnes et même format que l'appli actuelle. */
import { fmt, fmtLong, cleanName } from "./util.js";
import { PERIODS, matchTime, pre, post, tagLabel, tlRows } from "./model.js";

export function csvCell(v, sep) {
  v = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  if (v.indexOf('"') >= 0 || v.indexOf(sep) >= 0 || /[\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
  return v;
}

export function buildCsv(m, list, sep) {
  const head = ["match", "date", "competition", "periode", "temps_match", "secondes_match", "temps_periode", "temps_video", "secondes_video", "clip_debut", "clip_fin", "clip_duree_s", "ligne", "evenement", "tiers", "couloir", "resultat", "note"];
  const rows = [head], lineOf = {};
  tlRows(m, list).forEach(function (r, i) { r.tags.forEach(function (t) { lineOf[t.id] = i + 1; }); });
  m.tags.filter(function (t) { return !t.status || t.status === "accepted"; })
    .slice().sort(function (a, b) { return (a.p - b.p) || (a.t - b.t); }).forEach(function (t) {
      const mt = matchTime(t.p, t.t);
      rows.push([
        m.home + " - " + m.away, m.date || "", m.comp || "",
        PERIODS[t.p] ? PERIODS[t.p].name : t.p,
        fmt(mt), mt, fmt(t.t),
        t.v != null ? fmtLong(t.v) : "", t.v != null ? Math.floor(t.v) : "",
        t.v != null ? fmtLong(Math.max(0, t.v - pre(t))) : fmt(Math.max(0, mt - pre(t))),
        t.v != null ? fmtLong(t.v + post(t)) : fmt(mt + post(t)),
        Math.round((pre(t) + post(t)) * 10) / 10,
        lineOf[t.id] || "",
        tagLabel(t, list), t.third || "", t.lane || "", t.res || "", t.note || ""
      ]);
    });
  return "﻿" + rows.map(function (r) { return r.map(function (c) { return csvCell(c, sep); }).join(sep); }).join("\r\n") + "\r\n";
}

export function csvFileName(m) {
  return (m.date || "match") + "_" + (cleanName(m.home) || "domicile") + "_" + (cleanName(m.away) || "exterieur") + ".csv";
}
