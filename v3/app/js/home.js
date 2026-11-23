/* Accueil, nouveau match, Mes projets, import / export de fichiers. */
import { $, el, uid, pad2, fmtSize } from "./util.js";
import { S, doc, save, edit, liveMatches, projects, pjDoc, pjMatches, pjOf, layout, pref, setPref, resetLayoutCache } from "./state.js";
import { shortLabel } from "./model.js";
import { parseImport, reportText, guessMyTeam } from "./legacy.js";
import { buildCsv, csvFileName } from "./csv.js";
import { saveFile } from "./download.js";
import { App, toast, openPop, showOnly } from "./ui-common.js";
import { vsMeta, vsRemove, vsTotal } from "./videostore.js";
import { Y, syncOn, syncLabel } from "./sync.js";
import { estimateDocsSize, flush } from "./store.js";
import { loadVideoFile } from "./player.js";

let homeScreen = "menu", prTab = null, pendingVideo = null, pjEditing = null;

export function showHome(screen) {
  if (screen) homeScreen = screen;
  App.leaveOthers();
  showOnly("view-home");
  $("home-menu").hidden = homeScreen !== "menu";
  $("home-new").hidden = homeScreen !== "new";
  $("home-projects").hidden = homeScreen !== "projects";
  if (homeScreen === "new") fillProjSelect();
  renderHome();
  App.releaseWake();
}

export function renderHome() {
  const used = estimateDocsSize(S.docs);
  if (syncOn() && Y.sizes) {
    let tot = 0; Object.keys(Y.sizes).forEach(function (k) { tot += Y.sizes[k]; });
    const p = Math.min(100, tot / (500 * 1024 * 1024) * 100);
    $("store-text").textContent = "Sur cet appareil : " + fmtSize(used) + " · en ligne : " + fmtSize(tot) + " / 500 Mo (" + (p < 1 && tot > 0 ? "moins de 1" : Math.round(p)) + " %)";
    $("store-fill").style.width = Math.max(tot > 0 ? 1 : 0, p) + "%";
  } else {
    $("store-text").textContent = "Données sur cet appareil : " + fmtSize(used);
    $("store-fill").style.width = "0%";
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (est) {
      if (!est || !est.quota) return;
      const p = Math.min(100, (est.usage || 0) / est.quota * 100);
      $("store-text").textContent = "Données sur cet appareil : " + fmtSize(used) + " · stockage du navigateur utilisé : " + fmtSize(est.usage || 0) + " sur " + fmtSize(est.quota);
      $("store-fill").style.width = Math.max(1, p) + "%"; $("store-fill").classList.toggle("warn", p >= 80);
    }, function () {});
  }
  const vn = Object.keys(vsMeta()).length;
  $("vs-text").hidden = !vn;
  if (vn) $("vs-text").textContent = "Vidéos gardées sur cet appareil : " + vn + " · " + fmtSize(vsTotal());
  $("btn-settings").classList.toggle("on", syncOn());
  $("pr-sync").textContent = syncOn() ? syncLabel() : "Enregistré sur cet appareil";
  renderMatchList(); renderPrTabs(); renderProjects();
}
function renderMatchList() {
  const list = $("match-list"); list.textContent = "";
  const ms = liveMatches();
  $("match-empty").hidden = ms.length > 0;
  ms.forEach(function (m) {
    const li = el("li", "mrow"); li.dataset.open = m.id; li.setAttribute("role", "button"); li.tabIndex = 0;
    const info = el("div"); info.appendChild(el("div", "t", m.home + " – " + m.away));
    const meta = []; if (m.date) meta.push(m.date.split("-").reverse().join("/")); if (m.comp) meta.push(m.comp); meta.push(m.tags.length + (m.tags.length > 1 ? " tags" : " tag"));
    info.appendChild(el("div", "d", meta.join(" · "))); li.appendChild(info);
    const pj = pjOf(m.id); li.appendChild(el("span", "pj", pj ? pj.name : "—"));
    const dots = el("button", "dots-btn", "⋯"); dots.type = "button"; dots.dataset.mmenu = m.id; dots.setAttribute("aria-label", "Options du match"); li.appendChild(dots);
    list.appendChild(li);
  });
}
function renderPrTabs() {
  const np = projects().length, nm = liveMatches().length;
  if (!prTab) prTab = np ? "projects" : "matches";
  $("pr-tab-p").textContent = "Projets · " + np; $("pr-tab-m").textContent = "Matchs · " + nm;
  $("pr-tab-p").setAttribute("aria-selected", String(prTab === "projects")); $("pr-tab-m").setAttribute("aria-selected", String(prTab === "matches"));
  $("pr-projects").hidden = prTab !== "projects"; $("pr-matches").hidden = prTab !== "matches";
  $("pr-new").textContent = prTab === "projects" ? "+ Nouveau projet" : "+ Nouveau match";
}
function renderProjects() {
  const list = $("pj-list"); list.textContent = "";
  projects().forEach(function (a) {
    const c = el("div", "pj-card"), head = el("div");
    head.appendChild(el("div", "n", a.name));
    const ms = pjMatches(a); let n = 0; ms.forEach(function (m) { n += m.tags.length; });
    head.appendChild(el("div", "m", ms.length + (ms.length > 1 ? " matchs · " : " match · ") + n + (n > 1 ? " tags" : " tag") + (a.myTeam ? " · " + a.myTeam : "")));
    c.appendChild(head);
    const chips = el("div", "pj-chips"); ms.forEach(function (m) { chips.appendChild(el("span", "pj-chip", shortLabel(ms, m, a.myTeam))); }); c.appendChild(chips);
    const o = el("button", "btn primary small open", "Ouvrir"); o.type = "button"; o.dataset.popen = a.id; c.appendChild(o);
    const d = el("button", "dots-btn", "⋯"); d.type = "button"; d.dataset.pmenu = a.id; d.dataset.mmenu = "1"; d.setAttribute("aria-label", "Options du projet"); c.appendChild(d);
    list.appendChild(c);
  });
  const nw = el("button", "pj-new", "+ Nouveau projet"); nw.type = "button"; nw.dataset.pnew = "1"; list.appendChild(nw);
}
function fillProjSelect() {
  const sel = $("f-proj"), keep = sel.value; sel.textContent = "";
  const o0 = el("option", "", "Aucun projet"); o0.value = ""; sel.appendChild(o0);
  projects().forEach(function (a) { const o = el("option", "", a.name); o.value = a.id; sel.appendChild(o); });
  sel.value = keep && pjDoc(keep) ? keep : (S.pjId && pjDoc() ? S.pjId : "");
  $("f-proj-row").hidden = !projects().length;
}
function renderPendingVideo() {
  $("f-video-name").textContent = pendingVideo ? pendingVideo.name : "Aucune vidéo choisie. Sans vidéo, le match se tague en direct avec le chrono.";
  $("f-video-cta").textContent = pendingVideo ? "Changer de vidéo" : "Choisir la vidéo";
  $("f-video-clear").hidden = !pendingVideo;
}

/* ---------- Projets ---------- */
export function openPjForm(a) {
  pjEditing = a ? a.id : null;
  const box = $("pj-checks"); box.textContent = "";
  const ms = liveMatches(), teams = {};
  ms.forEach(function (m) {
    teams[m.home] = 1; teams[m.away] = 1;
    const lab = el("label"), cb = el("input"); cb.type = "checkbox"; cb.value = m.id; cb.checked = !!(a && (a.matchIds || []).indexOf(m.id) >= 0);
    lab.appendChild(cb);
    const meta = [m.home + " – " + m.away]; if (m.date) meta.push(m.date.split("-").reverse().join("/")); meta.push(m.tags.length + " tags"); if (vsMeta()[m.id]) meta.push("vidéo gardée");
    lab.appendChild(el("span", "", meta.join(" · "))); box.appendChild(lab);
  });
  if (!ms.length) box.appendChild(el("p", "hint", "Aucun match pour l'instant. Tu peux créer le projet maintenant, puis lui ajouter des matchs avec « Nouveau match »."));
  const dl = $("pj-team-list"); dl.textContent = ""; Object.keys(teams).sort().forEach(function (t) { const o = el("option"); o.value = t; dl.appendChild(o); });
  $("pj-name").value = a ? a.name : ""; $("pj-team").value = a ? (a.myTeam || "") : "";
  $("pj-err").textContent = "";
  $("pj-form-title").textContent = a ? "Modifier le projet" : "Nouveau projet";
  $("pj-submit").textContent = a ? "Enregistrer" : "Créer le projet";
  prTab = "projects"; renderPrTabs();
  $("pj-form").hidden = false; $("pj-form").scrollIntoView({ block: "nearest" }); $("pj-name").focus();
}
function submitPj(e) {
  e.preventDefault();
  const ids = [].slice.call($("pj-checks").querySelectorAll("input:checked")).map(function (c) { return c.value; });
  const name = $("pj-name").value.trim(), team = $("pj-team").value.trim().slice(0, 30);
  let a = pjEditing && pjDoc(pjEditing);
  if (a) {
    edit([a.id], "Modifier le projet", function () {
      const keep = (a.matchIds || []).filter(function (id) { return ids.indexOf(id) >= 0; });
      ids.forEach(function (id) { if (keep.indexOf(id) < 0) keep.push(id); });
      a.matchIds = keep; a.name = name || a.name; a.myTeam = team;
    });
  } else {
    ids.sort(function (x, y) { const mx = S.docs[x], my = S.docs[y]; return ((mx.date || "") + (mx.createdAt || 0)).localeCompare((my.date || "") + (my.createdAt || 0)); });
    a = { id: uid("p"), kind: "project", name: name || "Projet", matchIds: ids, stars: {}, myTeam: team || guessMyTeam(ids.map(function (id) { return S.docs[id]; })), createdAt: Date.now() };
    edit([a.id], "Nouveau projet", function () { S.docs[a.id] = a; });
  }
  $("pj-form").hidden = true; pjEditing = null; S.pjId = a.id;
  const first = pjMatches(a)[0];
  if (first) App.openMatch(first.id); else { renderHome(); toast("Projet créé. Ajoute-lui des matchs avec « Nouveau match », en choisissant ce projet.", false); }
}
function delProject(id) {
  const p = doc(id); if (!p) return;
  edit([id], "Supprimer le projet", function () { S.docs[id] = { id: id, deleted: true, updatedAt: Date.now() }; });
  renderHome(); toast("Projet supprimé. Ses matchs, eux, sont conservés.", true);
}
function delMatch(id) {
  const ids = [id].concat(projects().filter(function (a) { return (a.matchIds || []).indexOf(id) >= 0; }).map(function (a) { return a.id; }));
  edit(ids, "Supprimer le match", function () {
    ids.slice(1).forEach(function (pid) { const a = S.docs[pid]; a.matchIds = a.matchIds.filter(function (x) { return x !== id; }); });
    S.docs[id] = { id: id, deleted: true, updatedAt: Date.now() };
  });
  vsRemove(id); renderHome(); toast("Match supprimé.", true);
}

/* ---------- Export du match (CSV / projet) ---------- */
let exportId = null;
export function openExport(id) {
  const m = doc(id); if (!m || !Array.isArray(m.tags)) return;
  exportId = id;
  $("export-desc").textContent = m.home + " – " + m.away + ", " + m.tags.length + (m.tags.length > 1 ? " tags" : " tag") + ". Une ligne par tag, à ouvrir dans Excel ou Numbers.";
  $("export-msg").textContent = ""; $("export-text").hidden = true;
  renderSep(); $("export-overlay").hidden = false;
}
function renderSep() { const sep = pref("sep", ";"), b = document.querySelectorAll("#export-overlay [data-sep]"); for (let i = 0; i < b.length; i++) b[i].setAttribute("aria-pressed", String(b[i].dataset.sep === sep)); if (!$("export-text").hidden) showCsv(); }
function showCsv() { const m = doc(exportId); if (!m) return; $("export-text").value = buildCsv(m, layout(), pref("sep", ";")).replace(/^﻿/, ""); $("export-text").hidden = false; }
function saveCsv() {
  const m = doc(exportId); if (!m) return;
  if (!m.tags.length) { $("export-msg").textContent = "Ce match n'a encore aucun tag à exporter."; return; }
  saveFile(csvFileName(m), buildCsv(m, layout(), pref("sep", ";"))).then(function () { $("export-msg").textContent = "Fichier enregistré : " + csvFileName(m); }, function () { $("export-msg").textContent = "L'enregistrement n'est pas disponible ici. Copie le CSV ci-dessous."; showCsv(); });
}
function copyCsv() {
  showCsv(); const ta = $("export-text");
  const done = function () { $("export-msg").textContent = "CSV copié. Colle-le dans Notes, un mail ou un fichier .csv."; };
  const manual = function () { ta.focus(); ta.select(); try { if (document.execCommand("copy")) { done(); return; } } catch (e) {} $("export-msg").textContent = "Le texte est sélectionné : fais Copier depuis le menu."; };
  try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, manual); else manual(); } catch (e) { manual(); }
}
function exportProject() {
  const m = doc(exportId); if (!m) return;
  const docs = {}; docs[m.id] = m; if (S.docs.panel) docs.panel = S.docs.panel;
  saveFile(csvFileName(m).replace(/\.csv$/, "") + "_projet.json", JSON.stringify({ app: "rl-analysis", v: 3, docs: docs }, null, 1))
    .then(function () { $("export-msg").textContent = "Projet enregistré. Tu peux le réimporter depuis Mes projets."; });
}

/* ---------- Sauvegarde complète et import ---------- */
export function backupAll() {
  flush();
  const d = new Date(), stamp = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  const docs = {}; Object.keys(S.docs).forEach(function (k) { if (S.docs[k] && !S.docs[k].deleted) docs[k] = S.docs[k]; });
  saveFile("rl-analysis_sauvegarde_" + stamp + ".json", JSON.stringify({ app: "rl-analysis", v: 3, docs: docs }))
    .then(function () { toast("Sauvegarde complète enregistrée dans tes téléchargements.", false); }, function () { toast("La sauvegarde n'a pas pu être enregistrée.", false); });
}
let pendingImport = null;
function readImport(file) {
  const fr = new FileReader();
  fr.onerror = function () { toast("Ce fichier n'a pas pu être lu.", false); };
  fr.onload = function () {
    let parsed = null;
    try { parsed = parseImport(JSON.parse(String(fr.result))); } catch (e) { parsed = null; }
    if (!parsed) { toast("Ce fichier n'est pas une sauvegarde RL Analysis.", false); return; }
    pendingImport = parsed;
    const r = parsed.report, ul = $("import-list"); ul.textContent = "";
    $("import-desc").textContent = "Contenu du fichier : " + reportText(r) + ".";
    const exist = Object.keys(parsed.docs).filter(function (k) { return doc(k) && k !== "panel" && k !== "panelLib"; }).length;
    const lines = [];
    if (exist) lines.push(exist + " élément(s) existent déjà ici : ils seront remplacés par la version du fichier.");
    if (parsed.docs.panelLib || parsed.docs.panel) lines.push("Le panel actif et la liste des panels seront remplacés par ceux du fichier.");
    if (r.deleted) lines.push(r.deleted + " élément(s) supprimés dans l'ancienne appli sont ignorés.");
    if (r.droppedRefs) lines.push(r.droppedRefs + " référence(s) de projet vers des matchs supprimés sont retirées.");
    if (r.myTeamGuess) lines.push("« Mon équipe » déduite pour " + r.myTeamGuess + " projet(s) (modifiable dans le projet).");
    lines.forEach(function (t) { ul.appendChild(el("li", "", t)); });
    $("import-overlay").hidden = false;
  };
  fr.readAsText(file);
}
function applyImport() {
  const p = pendingImport; if (!p) return;
  pendingImport = null; $("import-overlay").hidden = true;
  const ids = Object.keys(p.docs);
  edit(ids, "Importer un fichier", function () { ids.forEach(function (k) { S.docs[k] = p.docs[k]; }); resetLayoutCache(); });
  renderHome();
  toast("Importé : " + reportText(p.report) + ".", true);
}

/* ---------- Branchements ---------- */
export function initHome() {
  $("go-new").addEventListener("click", function () { showHome("new"); });
  $("go-projects").addEventListener("click", function () { showHome("projects"); });
  $("go-panel").addEventListener("click", function () { App.openPanelEditor(); });
  $("view-home").addEventListener("click", function (e) { const b = e.target.closest("[data-home]"); if (b) showHome(b.dataset.home); });
  $("btn-settings").addEventListener("click", function () { App.openSettings("keys"); });
  try { const d = new Date(); $("f-date").value = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); } catch (e) {}
  renderPendingVideo();
  $("f-video-btn").addEventListener("click", function () { $("f-video").value = ""; $("f-video").click(); });
  $("f-video").addEventListener("change", function () { const f = $("f-video").files && $("f-video").files[0]; if (f) { pendingVideo = f; renderPendingVideo(); } });
  $("f-video-clear").addEventListener("click", function () { pendingVideo = null; renderPendingVideo(); });
  $("new-match").addEventListener("submit", function (e) {
    e.preventDefault();
    const home = $("f-home").value.trim(), away = $("f-away").value.trim();
    if (!home || !away) { $("form-error").textContent = "Indique le nom des deux équipes."; return; }
    $("form-error").textContent = "";
    const m = { id: uid("m"), kind: "match", home: home, away: away, date: $("f-date").value || "", comp: $("f-comp").value.trim(), createdAt: Date.now(), updatedAt: Date.now(), period: 1, phase: "pre", clock: { running: false, startedAt: 0, acc: 0 }, tags: [], lists: [] };
    const pjSel = $("f-proj").value, pjD = pjSel && pjDoc(pjSel);
    edit(pjD ? [m.id, pjD.id] : [m.id], "Nouveau match", function () { S.docs[m.id] = m; if (pjD) pjD.matchIds = (pjD.matchIds || []).concat([m.id]); });
    if (pjD) S.pjId = pjD.id;
    $("f-home").value = ""; $("f-away").value = ""; $("f-comp").value = "";
    const vf = pendingVideo; pendingVideo = null; renderPendingVideo();
    App.openMatch(m.id);
    if (vf) loadVideoFile(vf);
  });
  document.querySelector(".pr-bar .seg").addEventListener("click", function (e) { const b = e.target.closest("[data-prtab]"); if (!b) return; prTab = b.dataset.prtab; $("pj-form").hidden = true; renderPrTabs(); });
  $("pr-new").addEventListener("click", function () { if (prTab === "projects") openPjForm(null); else showHome("new"); });
  $("pj-cancel").addEventListener("click", function () { $("pj-form").hidden = true; pjEditing = null; });
  $("pj-form").addEventListener("submit", submitPj);
  $("pj-list").addEventListener("click", function (e) {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.pnew) { openPjForm(null); return; }
    if (b.dataset.pmenu) { const id = b.dataset.pmenu; openPop(b, [["Modifier (nom, Mon équipe, matchs)", function () { openPjForm(pjDoc(id)); }], ["Supprimer le projet", function () { delProject(id); }, true]]); return; }
    if (b.dataset.popen) { const a = pjDoc(b.dataset.popen); if (!a) return; S.pjId = a.id; const ms = pjMatches(a); const last = ms.filter(function (m) { return m.id === a.last; })[0] || ms[0]; if (last) App.openMatch(last.id); else openPjForm(a); }
  });
  $("match-list").addEventListener("click", function (e) {
    const b = e.target.closest("button[data-mmenu]");
    if (b) {
      const id = b.dataset.mmenu, items = [["Exporter (CSV)", function () { openExport(id); }]];
      if (vsMeta()[id]) items.push(["Libérer la vidéo", function () { vsRemove(id).then(function () { renderHome(); toast("Vidéo retirée de l'appareil. Les tags sont conservés.", false); }); }]);
      items.push(["Supprimer le match", function () { delMatch(id); }, true]);
      openPop(b, items); return;
    }
    const row = e.target.closest("[data-open]"); if (row) App.openMatch(row.dataset.open);
  });
  $("match-list").addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.dataset && e.target.dataset.open) { e.preventDefault(); App.openMatch(e.target.dataset.open); } });
  $("btn-backup").addEventListener("click", backupAll);
  $("btn-import").addEventListener("click", function () { $("import-file").value = ""; $("import-file").click(); });
  $("import-file").addEventListener("change", function () { const f = $("import-file").files && $("import-file").files[0]; if (f) readImport(f); });
  $("import-ok").addEventListener("click", applyImport);
  $("import-cancel").addEventListener("click", function () { pendingImport = null; $("import-overlay").hidden = true; });
  $("export-overlay").addEventListener("click", function (e) {
    if (e.target === $("export-overlay")) { $("export-overlay").hidden = true; return; }
    const b = e.target.closest("button[data-sep]"); if (b) { setPref("sep", b.dataset.sep); renderSep(); }
  });
  $("export-close").addEventListener("click", function () { $("export-overlay").hidden = true; });
  $("export-save").addEventListener("click", saveCsv); $("export-copy").addEventListener("click", copyCsv); $("export-project").addEventListener("click", exportProject);
}
