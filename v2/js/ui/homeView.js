/* Accueil, nouveau match, projets et matchs, import / sauvegarde. */

import { store } from "../core/store.js";
import { $, el, fmtSize, today, pickFile } from "../core/util.js";
import { t, tn, getLang, setLang } from "../core/i18n.js";
import { convert, readV1Local } from "../core/migrate.js";
import { newMatch, matches } from "../model/match.js";
import { projects, projectMatches, projectOf, newProject, shortLabel, analysedTeam } from "../model/project.js";
import { panelsDoc, invalidate } from "../model/panel.js";
import { vault, vaultOk } from "../video/vault.js";
import { saveBackup } from "../export/files.js";
import { exportDialog } from "./matchView.js";
import { icon } from "./icons.js";
import { toast, modal, menu, confirmBox } from "./dialogs.js";

let go = null;
let tab = null;
let pendingVideo = null;
export function initHome(nav) { go = nav; }

const root = () => $("view-home");
const iconLink = (ic, label, fn) => { const b = el("button", "hero-link", null, { type: "button" }); b.innerHTML = icon(ic, 40) + "<span>" + label + "</span>"; b.addEventListener("click", fn); return b; };
const backBtn = () => { const b = el("button", "ib", null, { type: "button", title: t("Home"), "aria-label": t("Home") }); b.innerHTML = icon("back"); b.addEventListener("click", () => go("home")); return b; };

/* ------------------------------------------------------------------ Accueil */
export function showHome() {
  const r = root(); r.innerHTML = "";
  const hero = el("div", "hero");
  hero.appendChild(el("h1", "hero-title", "RL Analysis"));
  hero.appendChild(el("p", "muted", t("Video coding for football analysts")));
  const nav = el("nav", "hero-nav");
  nav.append(iconLink("plus", t("New match"), () => go("new")), iconLink("folder", t("My projects"), () => go("projects")), iconLink("sliders", t("Edit the panel"), () => go("panel")));
  hero.appendChild(nav);
  const info = el("div", "store-info muted small");
  hero.appendChild(info);
  storageLine(info);
  const lang = el("button", "btn small quiet", getLang() === "fr" ? "English" : "Français", { type: "button" });
  lang.addEventListener("click", () => { setLang(getLang() === "fr" ? "en" : "fr"); location.reload(); });
  hero.appendChild(lang);
  r.appendChild(hero);
  if (!matches().length) firstRun(hero);
}
function storageLine(box) {
  const n = store.estimateBytes();
  const parts = [t("Data on this device: {s}", { s: fmtSize(n) })];
  if (vault.count()) parts.push(t("{n} videos kept ({s})", { n: vault.count(), s: fmtSize(vault.total()) }));
  box.textContent = parts.join(" · ");
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((e) => { if (e && e.quota) box.textContent = parts.join(" · ") + " · " + t("free: {s}", { s: fmtSize(e.quota - (e.usage || 0)) }); });
}
/* Premier lancement : proposer de reprendre les codages de la v1. */
function firstRun(host) {
  const card = el("div", "card first-run");
  card.appendChild(el("h2", "", t("Bring your v1 coding")));
  card.appendChild(el("p", "muted", t("Import the backup file made in version 1 (My projects → ⋯ → Save everything). Version 1 is not changed.")));
  const acts = el("div", "row-tools");
  const imp = el("button", "btn primary", t("Import a backup file"), { type: "button" });
  imp.addEventListener("click", importFile);
  acts.appendChild(imp);
  const local = readV1Local();
  if (local) {
    const b = el("button", "btn", t("Copy the v1 data of this device"), { type: "button" });
    b.addEventListener("click", () => applyImport(local, true));
    acts.appendChild(b);
  }
  card.appendChild(acts);
  host.appendChild(card);
}

/* ------------------------------------------------------------------ Import */
export function importFile() {
  pickFile(".json,application/json").then((f) => {
    if (!f) return;
    const fr = new FileReader();
    fr.onerror = () => toast(t("This file could not be read."));
    fr.onload = () => { let o = null; try { o = JSON.parse(String(fr.result)); } catch (e) { /* rien */ } if (!o) { toast(t("This file is not an RL Analysis file.")); return; } applyImport(o, false); };
    fr.readAsText(f);
  });
}
async function applyImport(obj, fromDevice) {
  let res;
  try { res = convert(obj); } catch (e) { toast(t("This file is not an RL Analysis file.")); return; }
  const r = res.report;
  const box = el("div");
  const lines = [
    tn(r.matches, "{n} match", "{n} matches") + ", " + tn(r.tags, "{n} tag", "{n} tags"),
    tn(r.projects, "{n} project", "{n} projects") + ", " + tn(r.panels, "{n} panel", "{n} panels")
  ];
  if (r.activeName) lines.push(t("Active panel: “{n}” (the one that matches your tags)", { n: r.activeName }));
  if (r.cleaned) lines.push(t("{n} links to deleted matches removed", { n: r.cleaned }));
  if (r.noMarkers) lines.push(t("{n} video matches have no half-time markers yet: set them to filter by half.", { n: r.noMarkers }));
  const ul = el("ul", "report-list"); lines.forEach((l) => ul.appendChild(el("li", "", l))); box.appendChild(ul);
  const existing = res.matches.filter((m) => store.get(m.id)).length;
  if (existing) box.appendChild(el("p", "muted small", t("{n} matches already exist here: the most recent version is kept.", { n: existing })));
  const ok = await modal(t("Import"), box, [{ label: t("Cancel"), value: false }, { label: t("Import"), value: true, primary: true }]);
  if (!ok) return;
  res.matches.forEach((m) => { const cur = store.get(m.id); if (!cur || (m.updatedAt || 0) >= (cur.updatedAt || 0)) store.put(m); });
  res.projects.forEach((p) => { const cur = store.get(p.id); if (!cur || (p.updatedAt || 0) >= (cur.updatedAt || 0)) store.put(p); });
  if (res.panels) {
    const d = panelsDoc();
    store.mutate("panels", t("Import panels"), (x) => {
      res.panels.items.forEach((it) => { const i = x.items.findIndex((y) => y.id === it.id); if (i >= 0) x.items[i] = it; else x.items.push(it); });
      if (res.panels.active) x.active = res.panels.active;
      invalidate();
      return { type: "panel" };
    });
    void d;
  }
  vault.adoptV1(res.matches.map((m) => m.id));
  toast(t("Imported: {a}.", { a: lines[0] }));
  go("projects");
  void fromDevice;
}

/* ------------------------------------------------------------------ Nouveau match */
export function showNew() {
  const r = root(); r.innerHTML = "";
  const top = el("div", "page-top"); top.append(backBtn(), el("h2", "", t("New match"))); r.appendChild(top);
  const f = el("form", "card form", null, { autocomplete: "off" });
  const field = (label, input) => { const w = el("label", "field"); w.append(el("span", "", label), input); return w; };
  const home = el("input", "", null, { maxlength: "30", placeholder: t("e.g. Rennes"), required: "" });
  const away = el("input", "", null, { maxlength: "30", placeholder: t("e.g. Metz"), required: "" });
  const date = el("input", "", null, { type: "date" }); date.value = today();
  const comp = el("input", "", null, { maxlength: "40", placeholder: t("e.g. Ligue 1") });
  const proj = el("select");
  proj.appendChild(Object.assign(el("option", "", t("No project")), { value: "" }));
  projects().forEach((p) => proj.appendChild(Object.assign(el("option", "", p.name), { value: p.id })));
  const vs = el("div", "form-vs"); vs.append(field(t("Home team"), home), el("span", "vs", "vs"), field(t("Away team"), away));
  f.append(vs);
  const two = el("div", "form-grid"); two.append(field(t("Date"), date), field(t("Competition (optional)"), comp)); f.appendChild(two);
  if (projects().length) f.appendChild(field(t("Project (optional)"), proj));
  const vbox = el("div", "video-drop");
  const vname = el("span", "muted");
  const vbtn = el("button", "btn", null, { type: "button" });
  const renderV = () => { vname.textContent = pendingVideo ? pendingVideo.name : t("No video: the match is tagged live with the clock."); vbtn.textContent = pendingVideo ? t("Change video") : t("Choose the video"); };
  vbtn.addEventListener("click", () => pickFile("video/*").then((file) => { if (file) { pendingVideo = file; renderV(); } }));
  renderV();
  vbox.append(el("span", "field-lab", t("Match video")), vbtn, vname);
  f.appendChild(vbox);
  const err = el("p", "form-error", "", { role: "alert" });
  const submit = el("button", "btn primary big", t("Create the match"), { type: "submit" });
  f.append(submit, err);
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!home.value.trim() || !away.value.trim()) { err.textContent = t("Enter both team names."); return; }
    const m = newMatch({ home: home.value.trim(), away: away.value.trim(), date: date.value, comp: comp.value.trim(), mode: pendingVideo ? "video" : "live" });
    store.put(m);
    const p = proj.value && store.get(proj.value);
    if (p) store.mutate(p.id, t("Add match to project"), (x) => { x.matchIds.push(m.id); return { type: "doc" }; });
    const file = pendingVideo; pendingVideo = null;
    go("match", { id: m.id, projectId: p ? p.id : null, file });
  });
  r.appendChild(f);
  setTimeout(() => home.focus(), 50);
}

/* ------------------------------------------------------------------ Projets et matchs */
export function showProjects(opts) {
  const r = root(); r.innerHTML = "";
  if (!tab) tab = projects().length ? "projects" : "matches";
  const top = el("div", "page-top");
  top.append(backBtn(), el("h2", "", t("My projects")), el("span", "flex"));
  const more = el("button", "ib", null, { type: "button", title: t("More"), "aria-label": t("More") }); more.innerHTML = icon("more");
  more.addEventListener("click", () => menu(more, [[t("Save everything (.json)"), () => { store.flush().then(saveBackup); toast(t("Full backup saved to your downloads.")); }], [t("Import a file"), importFile]]));
  top.appendChild(more);
  r.appendChild(top);
  const bar = el("div", "row-tools");
  const seg = el("div", "seg");
  [["projects", t("Projects") + " · " + projects().length], ["matches", t("Matches") + " · " + matches().length]].forEach(([k, l]) => { const b = el("button", tab === k ? "on" : "", l, { type: "button" }); b.addEventListener("click", () => { tab = k; showProjects(); }); seg.appendChild(b); });
  bar.appendChild(seg);
  bar.appendChild(el("span", "flex"));
  const nb = el("button", "btn primary", tab === "projects" ? t("+ New project") : t("+ New match"), { type: "button" });
  nb.addEventListener("click", () => (tab === "projects" ? projectForm(null) : go("new")));
  bar.appendChild(nb);
  r.appendChild(bar);
  r.appendChild(backupReminder());
  if (tab === "projects") renderProjects(r); else renderMatches(r);
  if (opts && opts.editProject) projectForm(store.get(opts.editProject));
}
function backupReminder() {
  const last = Number(localStorage.getItem("rl2.lastBackup")) || 0;
  const box = el("div");
  if (matches().length && Date.now() - last > 7 * 86400000) {
    box.className = "notice";
    box.appendChild(el("span", "", last ? t("Last full backup: {d} days ago.", { d: Math.floor((Date.now() - last) / 86400000) }) : t("You have never exported a full backup.")));
    const b = el("button", "btn small", t("Save everything"), { type: "button" });
    b.addEventListener("click", () => { store.flush().then(saveBackup); box.remove(); toast(t("Full backup saved to your downloads.")); });
    box.appendChild(b);
  }
  return box;
}
function renderProjects(r) {
  const grid = el("div", "pj-grid");
  projects().forEach((p) => {
    const ms = projectMatches(p), n = ms.reduce((s, m) => s + m.tags.length, 0);
    const c = el("div", "card pj-card");
    const head = el("div", "pj-head");
    head.appendChild(el("b", "", p.name));
    const dots = el("button", "ib small", null, { type: "button", "aria-label": t("Project options") }); dots.innerHTML = icon("more", 18);
    dots.addEventListener("click", () => menu(dots, [[t("Edit"), () => projectForm(p)], [t("Delete the project"), async () => {
      if (!(await confirmBox(t("Delete the project"), t("Delete “{n}”? Its matches are kept.", { n: p.name }), t("Delete"), true))) return;
      store.remove(p.id, t("Delete the project")); showProjects();
      toast(t("Project deleted. Its matches are kept."), { label: t("Undo"), run: () => { store.undo(); showProjects(); } });
    }, true]]));
    head.appendChild(dots);
    c.appendChild(head);
    const team = analysedTeam(p);
    c.appendChild(el("p", "muted small", [team ? t("Team: {t}", { t: team }) : "", tn(ms.length, "{n} match", "{n} matches"), tn(n, "{n} tag", "{n} tags")].filter(Boolean).join(" · ")));
    const chips = el("div", "chips");
    ms.forEach((m) => { const ch = el("button", "chip", shortLabel(p, m), { type: "button", title: m.home + " – " + m.away }); ch.addEventListener("click", () => go("match", { id: m.id, projectId: p.id })); chips.appendChild(ch); });
    c.appendChild(chips);
    const acts = el("div", "row-tools");
    const open = el("button", "btn primary small", t("Open"), { type: "button" });
    open.addEventListener("click", () => { const last = ms.find((m) => m.id === p.last) || ms[0]; if (last) go("match", { id: last.id, projectId: p.id }); else projectForm(p); });
    const sort = el("button", "btn small", t("Sort clips"), { type: "button" }); sort.disabled = !ms.length;
    sort.addEventListener("click", () => go("sort", { projectId: p.id }));
    acts.append(open, sort);
    c.appendChild(acts);
    grid.appendChild(c);
  });
  const nw = el("button", "card pj-new", t("+ New project"), { type: "button" });
  nw.addEventListener("click", () => projectForm(null));
  grid.appendChild(nw);
  r.appendChild(grid);
}
function renderMatches(r) {
  const ms = matches();
  if (!ms.length) { r.appendChild(el("p", "muted empty", t("No match yet. Tap “+ New match”."))); return; }
  const ul = el("ul", "match-list");
  ms.forEach((m) => {
    const li = el("li", "card mrow");
    const info = el("button", "info", null, { type: "button" });
    info.appendChild(el("b", "", m.home + " – " + m.away));
    info.appendChild(el("small", "muted", [m.date ? m.date.split("-").reverse().join("/") : "", m.comp, tn(m.tags.length, "{n} tag", "{n} tags"), vault.meta(m.id) ? t("video kept") : ""].filter(Boolean).join(" · ")));
    info.addEventListener("click", () => go("match", { id: m.id }));
    const p = projectOf(m.id);
    li.append(info, el("span", "chip static", p ? p.name : "—"));
    const dots = el("button", "ib small", null, { type: "button", "aria-label": t("Match options") }); dots.innerHTML = icon("more", 18);
    dots.addEventListener("click", () => {
      const items = [[t("Export…"), () => exportDialog(m.id)]];
      if (vault.meta(m.id)) items.push([t("Free the video"), () => vault.remove(m.id).then(() => { showProjects(); toast(t("Video removed from the device. Tags are kept.")); })]);
      items.push([t("Delete the match"), async () => {
        if (!(await confirmBox(t("Delete the match"), t("Delete “{n}” and its {k} tags?", { n: m.home + " – " + m.away, k: m.tags.length }), t("Delete"), true))) return;
        store.remove(m.id, t("Delete the match")); showProjects();
        toast(t("Match deleted."), { label: t("Undo"), run: () => { store.undo(); showProjects(); } });
      }, true]);
      menu(dots, items);
    });
    li.appendChild(dots);
    ul.appendChild(li);
  });
  r.appendChild(ul);
  if (!vaultOk) r.appendChild(el("p", "muted small", t("This browser cannot keep videos on the device: choose the video again at each session.")));
}
async function projectForm(p) {
  const box = el("div", "form");
  const name = el("input", "", null, { maxlength: "40", placeholder: t("e.g. Rennes, first half of season") }); name.value = p ? p.name : "";
  const team = el("input", "", null, { maxlength: "30", placeholder: t("e.g. Rennes") }); team.value = p ? analysedTeam(p) : "";
  const f1 = el("label", "field"); f1.append(el("span", "", t("Project name")), name);
  const f2 = el("label", "field"); f2.append(el("span", "", t("Analysed team")), team);
  box.append(f1, f2, el("p", "field-lab", t("Matches of the project")));
  const checks = el("div", "checks");
  matches().forEach((m) => {
    const l = el("label", "check"); const cb = el("input", "", null, { type: "checkbox" }); cb.value = m.id; cb.checked = !!(p && p.matchIds.includes(m.id));
    l.append(cb, el("span", "", [m.home + " – " + m.away, m.date ? m.date.split("-").reverse().join("/") : "", tn(m.tags.length, "{n} tag", "{n} tags")].filter(Boolean).join(" · ")));
    checks.appendChild(l);
  });
  if (!matches().length) checks.appendChild(el("p", "muted small", t("No match yet. You can create the project now, then add matches with “New match”.")));
  box.appendChild(checks);
  const ok = await modal(p ? t("Edit the project") : t("New project"), box, [{ label: t("Cancel"), value: false }, { label: p ? t("Save") : t("Create the project"), value: true, primary: true }], { wide: true });
  if (!ok) return;
  const ids = [...checks.querySelectorAll("input:checked")].map((c) => c.value);
  if (p) {
    store.mutate(p.id, t("Edit the project"), (x) => {
      const keep = x.matchIds.filter((id) => ids.includes(id)); ids.forEach((id) => { if (!keep.includes(id)) keep.push(id); });
      x.matchIds = keep; x.name = name.value.trim() || x.name; x.team = team.value.trim(); return { type: "doc" };
    });
  } else {
    ids.sort((a, b) => { const x = store.get(a), y = store.get(b); return ((x.date || "") + x.createdAt).localeCompare((y.date || "") + y.createdAt); });
    store.put(newProject(name.value.trim() || t("Project"), ids, team.value.trim()));
  }
  tab = "projects"; showProjects();
}
