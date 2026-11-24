/* Match d'exemple : permet d'essayer l'appli (timeline, bilan, listes, export) sans vidéo ni données personnelles.
   Les tags sont fictifs et le match est marqué « Démo ». Supprimable comme n'importe quel match. */
import { S, doc, edit } from "./state.js";
import { DEFAULT_EVENTS, defaultLayout, padButtons } from "./model.js";

export const DEMO_ID = "mdemo0000001";

export function createDemo() {
  if (doc(DEMO_ID)) return doc(DEMO_ID);
  const list = defaultLayout(), btn = {};
  padButtons(list).forEach(function (b) { btn[b.key + "|" + b.team] = b; });
  /* Générateur déterministe : le même exemple à chaque fois */
  let r = 2024; const rnd = function () { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const T = ["Défensif", "Médian", "Offensif"], L = ["Aile gauche", "Demi-espace gauche", "Axe", "Demi-espace droit", "Aile droite"];
  const tags = [];
  for (let i = 0; i < 90; i++) {
    const e = DEFAULT_EVENTS[Math.floor(rnd() * DEFAULT_EVENTS.length)], team = rnd() < 0.55 ? "home" : "away", b = btn[e.id + "|" + team];
    const p = rnd() < 0.5 ? 1 : 2, t = Math.floor(rnd() * 45 * 60);
    const tag = { id: "tdemo" + i, p: p, t: t, team: team, ev: e.id, lbl: "", btn: b.id, col: "", d0: 5, d1: 5, third: "", lane: "", res: rnd() < 0.75 ? e.res[Math.floor(rnd() * e.res.length)] : "", note: "" };
    if (rnd() < 0.5) { tag.third = T[Math.floor(rnd() * 3)]; tag.lane = L[Math.floor(rnd() * 5)]; }
    tags.push(tag);
  }
  tags.sort(function (a, b) { return (a.p - b.p) || (a.t - b.t); });
  const m = { id: DEMO_ID, kind: "match", home: "Équipe Démo", away: "Adversaire", date: "2026-01-01", comp: "Démo (données fictives)", createdAt: 1767225600000, updatedAt: Date.now(), period: 2, phase: "done", clock: { running: false, startedAt: 0, acc: 45 * 60 * 1000 }, tags: tags, lists: [{ id: "ldemo1", name: "Pressing réussi", tags: tags.filter(function (t) { return t.ev === "pressing" && t.res === "Récupération"; }).map(function (t) { return t.id; }) }] };
  const pj = { id: "pdemo0000001", kind: "project", name: "Démo", matchIds: [DEMO_ID], stars: {}, myTeam: "Équipe Démo", last: DEMO_ID, createdAt: 1767225600000 };
  edit([DEMO_ID, pj.id], "Match d'exemple", function () { S.docs[DEMO_ID] = m; S.docs[pj.id] = pj; });
  return m;
}
