/* Projets : plusieurs matchs d'une même équipe analysée (ex. « Rennes, phase aller »). */

import { store } from "../core/store.js";
import { uid } from "../core/util.js";

export const projects = () => store.all("project").sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

export function newProject(name, matchIds, team) {
  return { id: uid("p"), kind: "project", name: name || "Project", team: team || "", matchIds: matchIds || [], stars: {}, last: null, createdAt: Date.now() };
}
export function projectMatches(p) { return (p.matchIds || []).map((id) => store.get(id)).filter((m) => m && m.kind === "match"); }
export function projectOf(matchId) { return projects().find((p) => (p.matchIds || []).includes(matchId)) || null; }

/** Équipe commune à tous les matchs du projet (= équipe analysée), si le projet n'en précise pas. */
export function analysedTeam(p) {
  if (p.team) return p.team;
  const ms = projectMatches(p);
  if (ms.length < 2) return "";
  return [ms[0].home, ms[0].away].find((tm) => ms.every((x) => x.home === tm || x.away === tm)) || "";
}
/** Nom court d'un match dans un projet : l'adversaire. */
export function shortLabel(p, m) {
  const team = p ? analysedTeam(p) : "";
  const lab = team ? (m.home === team ? m.away : (m.away === team ? m.home : m.home + " – " + m.away)) : m.home + " – " + m.away;
  return lab.length > 22 ? lab.slice(0, 21) + "…" : lab;
}
export const starKey = (m, t) => m.id + ":" + t.id;
