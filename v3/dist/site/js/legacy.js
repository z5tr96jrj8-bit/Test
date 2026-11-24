/* Lecture des fichiers d'échange : sauvegardes de l'ancienne appli (« carnet-de-tags ») et fichiers v3.
   Rien n'est perdu : matchs (avec leur date de création), tags, listes, projets, clips gardés, panels. */
import { uid, isHex } from "./util.js";
import { layoutOf, normLayout, DEF_PRE, DEF_POST } from "./model.js";

function str(v, n) { return typeof v === "string" ? v.slice(0, n) : ""; }
function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }

export function normMatch(o, keepId) {
  if (!o || typeof o !== "object" || o.deleted || !Array.isArray(o.tags) || typeof o.home !== "string" || typeof o.away !== "string") return null;
  const now = Date.now();
  const m = {
    id: keepId && typeof o.id === "string" && /^m[a-z0-9]{6,24}$/.test(o.id) ? o.id : uid("m"), kind: "match",
    home: str(o.home, 30) || "Domicile", away: str(o.away, 30) || "Extérieur",
    date: /^\d{4}-\d{2}-\d{2}$/.test(o.date || "") ? o.date : "", comp: str(o.comp, 40),
    createdAt: num(o.createdAt, now) || now, updatedAt: num(o.updatedAt, now) || now,
    period: Math.min(4, Math.max(1, Math.round(num(o.period, 1)))),
    phase: ["pre", "live", "break", "done"].indexOf(o.phase) >= 0 ? o.phase : "done",
    clock: { running: false, startedAt: 0, acc: Math.max(0, num(o.clock && o.clock.acc, 0)) }, tags: [], lists: []
  };
  if (o.clock && o.clock.running) { m.clock.acc += Math.max(0, now - num(o.clock.startedAt, now)); }
  if (o.mode === "video") {
    const v = o.video || {};
    m.mode = "video";
    m.video = { name: str(v.name, 200), pos: Math.max(0, num(v.pos, 0)), k1: v.k1 == null ? null : Math.max(0, num(v.k1, 0)), k2: v.k2 == null ? null : Math.max(0, num(v.k2, 0)) };
  }
  const ids = {};
  o.tags.slice(0, 20000).forEach(function (t) {
    if (!t || typeof t !== "object" || typeof t.ev !== "string") return;
    const id = str(t.id, 40) || uid("t"); if (ids[id]) return; ids[id] = true;
    const tag = {
      id: id, p: Math.min(4, Math.max(1, Math.round(num(t.p, 1)))), t: Math.max(0, Math.round(num(t.t, 0))), team: t.team === "away" ? "away" : "home",
      ev: str(t.ev, 48), lbl: str(t.lbl, 30), btn: str(t.btn, 48), col: isHex(t.col) ? t.col : "",
      d0: Math.min(120, Math.max(0, num(t.d0, DEF_PRE))), d1: Math.min(600, Math.max(0, num(t.d1, DEF_POST))),
      third: str(t.third, 20), lane: str(t.lane, 30), res: str(t.res, 20), note: str(t.note, 120)
    };
    if (t.v != null && isFinite(Number(t.v))) tag.v = Math.max(0, Number(t.v));
    if (t.open) tag.open = true;
    if (t.source === "auto") { tag.source = "auto"; tag.status = ["suggested", "accepted", "rejected"].indexOf(t.status) >= 0 ? t.status : "suggested"; tag.conf = Math.min(1, Math.max(0, num(t.conf, 0))); tag.module = str(t.module, 30); }
    m.tags.push(tag);
  });
  (Array.isArray(o.lists) ? o.lists : []).slice(0, 50).forEach(function (l) {
    if (!l || typeof l !== "object" || !Array.isArray(l.tags)) return;
    m.lists.push({ id: str(l.id, 40) || uid("l"), name: str(l.name, 40) || "Liste", tags: l.tags.filter(function (x) { return typeof x === "string" && ids[x]; }) });
  });
  if (typeof o.last === "string") m.last = o.last;
  return m;
}

function normProject(o, matchIds) {
  if (!o || o.deleted || o.kind !== "project") return null;
  const now = Date.now();
  const ids = (Array.isArray(o.matchIds) ? o.matchIds : []).filter(function (x) { return matchIds[x]; });
  const stars = {};
  Object.keys(o.stars && typeof o.stars === "object" ? o.stars : {}).forEach(function (k) { if (o.stars[k] && matchIds[k.split(":")[0]]) stars[k] = true; });
  return {
    id: str(o.id, 40) || uid("p"), kind: "project", name: str(o.name, 40) || "Projet", matchIds: ids, stars: stars,
    myTeam: str(o.myTeam, 30), last: ids.indexOf(o.last) >= 0 ? o.last : (ids[0] || ""),
    createdAt: num(o.createdAt, now), updatedAt: num(o.updatedAt, now), droppedRefs: (Array.isArray(o.matchIds) ? o.matchIds.length : 0) - ids.length
  };
}

/* Transforme n'importe quel fichier reconnu en { docs, report } ; null si le fichier n'est pas reconnu. */
export function parseImport(o) {
  if (!o || typeof o !== "object") return null;
  let all = null;
  if (o.app === "rl-analysis" && o.docs && typeof o.docs === "object") all = o.docs;
  else if (o.all && typeof o.all === "object") all = o.all;
  const docs = {}, report = { matches: 0, emptyMatches: 0, tags: 0, projects: 0, stars: 0, panels: 0, lists: 0, deleted: 0, droppedRefs: 0, myTeamGuess: 0 };

  if (!all) {
    /* Projet d'un seul match */
    const single = normMatch(o.match ? o.match : o, false);
    if (!single) return null;
    docs[single.id] = single;
    report.matches = 1; report.tags = single.tags.length;
    if (o.panel && Array.isArray(o.panel.buttons)) { docs.panel = { id: "panel", kind: "panel", v: 4, h: 1, buttons: layoutOf(o.panel), updatedAt: Date.now() }; report.panels = 1; }
    return { docs: docs, report: report, single: true };
  }

  const matchIds = {};
  Object.keys(all).forEach(function (k) {
    const v = all[k];
    if (!v || typeof v !== "object") return;
    if (v.deleted) { report.deleted++; return; }
    if (Array.isArray(v.tags)) {
      const m = normMatch(Object.assign({}, v, { id: v.id || k }), true);
      if (!m) return;
      docs[m.id] = m; matchIds[m.id] = true;
      report.matches++; report.tags += m.tags.length; report.lists += m.lists.length;
      if (!m.tags.length) report.emptyMatches++;
    }
  });
  Object.keys(all).forEach(function (k) {
    const v = all[k];
    if (!v || v.deleted) return;
    if (v.kind === "project") {
      const p = normProject(Object.assign({}, v, { id: v.id || k }), matchIds);
      if (!p) return;
      report.droppedRefs += p.droppedRefs; delete p.droppedRefs;
      if (!p.myTeam) { p.myTeam = guessMyTeam(p.matchIds.map(function (id) { return docs[id]; })); if (p.myTeam) report.myTeamGuess++; }
      docs[p.id] = p; report.projects++; report.stars += Object.keys(p.stars).length;
    } else if (k === "panel" && Array.isArray(v.buttons)) {
      docs.panel = { id: "panel", kind: "panel", v: 4, h: 1, buttons: layoutOf(v), updatedAt: num(v.updatedAt, Date.now()) };
    } else if (k === "panelLib" && Array.isArray(v.items)) {
      const items = v.items.filter(function (i) { return i && typeof i.name === "string"; }).map(function (i) {
        return { id: str(i.id, 40) || uid("pl"), name: str(i.name, 30) || "Panel", buttons: Array.isArray(i.buttons) && i.buttons.length ? normLayout(i.buttons) : [] };
      });
      if (items.length) docs.panelLib = { id: "panelLib", kind: "panelLib", items: items, active: items.some(function (i) { return i.id === v.active; }) ? v.active : items[0].id, updatedAt: num(v.updatedAt, Date.now()) };
    }
  });
  report.panels = docs.panelLib ? docs.panelLib.items.length : (docs.panel ? 1 : 0);
  return { docs: docs, report: report, single: false };
}

/* « Mon équipe » d'un projet : l'équipe présente dans tous ses matchs. */
export function guessMyTeam(ms) {
  ms = ms.filter(Boolean);
  if (ms.length < 2) return "";
  const cand = [ms[0].home, ms[0].away].filter(function (t) { return ms.every(function (m) { return m.home === t || m.away === t; }); });
  return cand.length === 1 ? cand[0] : "";
}

export function reportText(r) {
  const parts = [r.matches + (r.matches > 1 ? " matchs" : " match") + (r.emptyMatches ? " (dont " + r.emptyMatches + " sans tag)" : ""), r.tags + " tags"];
  if (r.projects) parts.push(r.projects + (r.projects > 1 ? " projets" : " projet"));
  if (r.panels) parts.push(r.panels + (r.panels > 1 ? " panels" : " panel"));
  if (r.stars) parts.push(r.stars + " clips gardés");
  if (r.lists) parts.push(r.lists + (r.lists > 1 ? " listes" : " liste"));
  return parts.join(", ");
}
