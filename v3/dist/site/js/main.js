/* Démarrage de l'appli et liaison des écrans. */
import { $ } from "./util.js";
import { S, cur, onChange, onHistory, layout, pref, setPref, edit, commitLayout } from "./state.js";
import { itemIn } from "./model.js";
import { openStore, loadAllDocs, loadKV, putDoc, setKV, flush, readLegacyLocal, onWrite, hasPending } from "./store.js";
import { App, initToast, initPop, showOnly, anyOverlayOpen, toast } from "./ui-common.js";
import { installShortcuts } from "./shortcuts.js";
import { initPlayer, clockAction, savePos, unloadVideo } from "./player.js";
import { initPad, renderPad, setPadEdit } from "./pad.js";
import { initMatch, openMatch, leaveMatch, renderMatch, renderSelection, tickTimeline, tagFromButton, afterHistory, matchKeys, renderTimeline } from "./match.js";
import { initHome, showHome, renderHome, openPjForm, openExport, backupAll } from "./home.js";
import { initSort, openSort, leaveSort, renderSort, cancelMontage } from "./sort.js";
import { initSettings, openSettings } from "./settings.js";
import { initSync, markDirty, Y } from "./sync.js";

/* ---------- Écran « Modifier le panel » ---------- */
function openPanelEditor() {
  App.leaveOthers();
  S.panelMode = true; S.padEdit = true; S.padSel = null;
  showOnly("view-panel");
  $("panel-host").appendChild($("events"));
  renderPad(null);
}
function leavePanel() {
  if (!S.panelMode) return;
  S.panelMode = false; S.padEdit = false; S.padSel = null;
  $("board").insertBefore($("events"), $("videobox"));
  $("view-panel").hidden = true;
}

/* ---------- Écran allumé ---------- */
let wake = null;
function requestWake() { try { if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request("screen").then(function (w) { wake = w; }, function () {}); } catch (e) {} }
function releaseWake() { try { if (wake) { wake.release(); wake = null; } } catch (e) {} }

Object.assign(App, {
  openMatch: openMatch, renderMatch: renderMatch, renderSelection: renderSelection, tickTimeline: tickTimeline,
  tagFromButton: tagFromButton, showHome: showHome, openPjForm: openPjForm, openExport: openExport, openSort: openSort,
  openSettings: openSettings, openPanelEditor: openPanelEditor, cancelMontage: cancelMontage, requestWake: requestWake, releaseWake: releaseWake,
  afterHistory: afterHistory,
  leaveOthers: function () { leaveSort(); leavePanel(); leaveMatch(); },
  renderAll: function () {
    if (S.panelMode) renderPad(null);
    else if (!$("view-sort").hidden) renderSort();
    else if (S.currentMatchId && cur()) renderMatch();
    else renderHome();
  },
  afterPadChange: function () { if (S.panelMode) renderPad(null); else if (cur()) renderMatch(); },
  afterSettings: function () { App.renderAll(); },
  saveNow: function () { savePos(true); flush().then(function () { toast("Enregistré sur cet appareil" + (Y.state !== "off" ? " (la synchro suit)" : "") + ".", false); }); },
  clockToggle: function () { const m = cur(); if (!m) return; if (m.phase === "live") clockAction(m.clock.running ? "pause" : "resume"); else if (m.phase === "pre") clockAction("kickoff"); },
  renameButton: function (id, v) { edit(["panel"], "Renommer « " + v + " »", function () { const it = itemIn(layout(), id); if (it) it.label = v; commitLayout(); }); App.afterPadChange(); }
});

/* ---------- Enregistrement : indicateur ---------- */
function saveState(ok) {
  const el = $("save-state"); if (!el) return;
  el.textContent = ok === false ? "Erreur d'enregistrement : fais « Tout sauvegarder »" : (Y.state !== "off" ? "Enregistré · " + ({ syncing: "synchro en cours", synced: "synchronisé", error: "synchro en attente" }[Y.state] || "") : "Enregistré automatiquement");
}

/* ---------- Hors ligne (adresse en ligne uniquement ; pas depuis un fichier) ---------- */
function registerOffline() {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", function () { if (had) toast("Nouvelle version installée : ferme puis rouvre l'appli pour l'utiliser.", false); });
  navigator.serviceWorker.register("sw.js").catch(function () {});
}

/* ---------- Démarrage ---------- */
openStore().then(function () { return Promise.all([loadAllDocs(), loadKV()]); }).then(function (r) {
  S.docs = r[0]; S.kv = r[1];
  /* Première ouverture : reprise de l'ancienne appli si elle tournait à la même adresse */
  if (!S.kv.migrated) {
    const old = readLegacyLocal();
    if (old && !Object.keys(S.docs).length) {
      Object.keys(old.docs).forEach(function (k) { S.docs[k] = old.docs[k]; putDoc(old.docs[k]); });
      if (old.videos && Object.keys(old.videos).length) setPref("videos", old.videos);
      if (old.prefs && (old.prefs.sep === ";" || old.prefs.sep === ",")) setPref("sep", old.prefs.sep);
      setTimeout(function () { toast("Données de l'ancienne appli reprises : " + old.report.matches + " matchs, " + old.report.tags + " tags.", false); }, 600);
    }
    try { const a = JSON.parse(localStorage.getItem("rl-atelier.v1") || "null"); if (a && !S.kv.atelier) setPref("atelier", { hidden: a.hidden || {}, lay: a.lay === "ana" ? "ana" : "code", zoomSet: !!a.zoomSet }); } catch (e) {}
    setPref("migrated", true);
  }
  start();
}, function () { start(); });

function start() {
  initToast(); initPop(); initPlayer(); initPad(); initMatch(); initHome(); initSort(); initSettings();
  $("panel-back").addEventListener("click", function () { showHome("menu"); });
  onChange(function (id) { markDirty(id); });
  onHistory(function () { const u = $("tb-undo"); if (u && cur()) { u.disabled = false; } });
  onWrite(saveState);
  Y.onState = function () { saveState(true); if (!$("view-home").hidden) renderHome(); };
  Y.onPulled = function () { App.renderAll(); };
  Y.onLost = function (msg) { toast(msg, false); };
  installShortcuts(matchKeys, tagFromButton, function () { return !!cur() && !$("view-match").hidden && !S.padEdit && !anyOverlayOpen(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { ["export-overlay", "import-overlay", "settings-overlay"].forEach(function (id) { $(id).hidden = true; }); } });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") { savePos(true); flush(); } else if (cur()) requestWake(); });
  window.addEventListener("pagehide", function () { savePos(true); flush(); });
  window.addEventListener("beforeunload", function (e) { if (hasPending()) { flush(); } });
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}
  saveState(true);
  registerOffline();
  showHome("menu");
  initSync();
}
