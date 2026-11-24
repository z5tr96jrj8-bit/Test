/* Réglages : raccourcis clavier, synchro en ligne (désactivée par défaut), stockage. */
import { $, el, fmtSize } from "./util.js";
import { S, layout } from "./state.js";
import { padButtons } from "./model.js";
import { ACTIONS, bindings, setBinding, resetBindings, buttonKeys, setButtonKey, labelOf, captureCombo } from "./shortcuts.js";
import { Y, SYNC_DEFAULT, syncOn, signIn, signOut } from "./sync.js";
import { estimateDocsSize, storeKind } from "./store.js";
import { vsMeta, vsTotal } from "./videostore.js";
import { App } from "./ui-common.js";

let tab = "keys", waiting = null;

export function openSettings(t) { tab = t || tab; render(); $("settings-overlay").hidden = false; }
function render() {
  const tb = $("set-tabs").children; for (let i = 0; i < tb.length; i++) tb[i].setAttribute("aria-pressed", String(tb[i].dataset.st === tab));
  const panes = document.querySelectorAll(".set-pane"); for (let j = 0; j < panes.length; j++) panes[j].hidden = panes[j].dataset.sp !== tab;
  if (tab === "keys") renderKeys(); else if (tab === "sync") renderSync(""); else renderStore();
}
function keyRow(label, combo, id, dup) {
  const r = el("div", "key-row"); r.appendChild(el("span", "lab", label));
  const b = el("button", (waiting === id ? "wait" : "") + (dup ? " dup" : ""), waiting === id ? "Appuie…" : labelOf(combo)); b.type = "button"; b.dataset.key = id;
  if (dup) b.title = "Cette touche sert aussi ailleurs";
  r.appendChild(b); return r;
}
function renderKeys() {
  const acts = bindings(), keys = buttonKeys(layout()), used = {};
  Object.keys(acts).forEach(function (k) { if (acts[k]) used[acts[k]] = (used[acts[k]] || 0) + 1; });
  Object.keys(keys).forEach(function (k) { if (keys[k]) used[keys[k]] = (used[keys[k]] || 0) + 1; });
  const box = $("set-keys"); box.textContent = "";
  ACTIONS.forEach(function (a) { box.appendChild(keyRow(a[1], acts[a[0]], "a:" + a[0], acts[a[0]] && used[acts[a[0]]] > 1)); });
  const bb = $("set-btnkeys"); bb.textContent = "";
  padButtons(layout()).forEach(function (b) { bb.appendChild(keyRow(b.label + (b.flag ? "" : b.team === "away" ? " (Extérieur)" : " (Domicile)"), keys[b.id], "b:" + b.id, keys[b.id] && used[keys[b.id]] > 1)); });
}
function renderSync(msg) {
  const on = syncOn();
  $("sync-form").hidden = on; $("sync-on").hidden = !on;
  if (on) $("sync-who").textContent = "Connecté en tant que " + Y.cfg.email + ". État : " + ({ syncing: "envoi en cours", synced: "à jour", error: "en attente du réseau" }[Y.state] || "") + ".";
  if (!$("sy-url").value) $("sy-url").value = SYNC_DEFAULT.url;
  if (!$("sy-key").value) $("sy-key").value = SYNC_DEFAULT.key;
  $("sync-msg").textContent = msg || "";
}
function renderStore() {
  const box = $("set-store"); box.textContent = "";
  const ms = Object.keys(S.docs).filter(function (k) { return S.docs[k] && !S.docs[k].deleted && Array.isArray(S.docs[k].tags); });
  let tags = 0; ms.forEach(function (k) { tags += S.docs[k].tags.length; });
  box.appendChild(el("p", "", "Données : " + ms.length + " matchs, " + tags + " tags, " + fmtSize(estimateDocsSize(S.docs)) + " (" + (storeKind() === "indexeddb" ? "base IndexedDB de ce navigateur" : "mémoire seulement : ce navigateur refuse le stockage, pense à « Tout sauvegarder »") + ")."));
  box.appendChild(el("p", "", "Vidéos gardées sur cet appareil : " + Object.keys(vsMeta()).length + " · " + fmtSize(vsTotal()) + "."));
  box.appendChild(el("p", "hint", "Les données restent dans ce navigateur, à cette adresse. Pour les retrouver ailleurs : Mes projets → « Tout sauvegarder », puis « Importer » sur l'autre appareil (ou active la synchro)."));
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (est) { if (est && est.quota) box.appendChild(el("p", "", "Place utilisée par le navigateur : " + fmtSize(est.usage || 0) + " sur " + fmtSize(est.quota) + " disponibles.")); });
}
export function initSettings() {
  $("set-tabs").addEventListener("click", function (e) { const b = e.target.closest("button"); if (b) { tab = b.dataset.st; render(); } });
  $("settings-close").addEventListener("click", function () { $("settings-overlay").hidden = true; App.afterSettings(); });
  $("settings-overlay").addEventListener("click", function (e) {
    if (e.target === $("settings-overlay")) { $("settings-overlay").hidden = true; App.afterSettings(); return; }
    const b = e.target.closest("button[data-key]"); if (!b || waiting) return;
    waiting = b.dataset.key; renderKeys();
    captureCombo(function (combo) {
      const id = waiting; waiting = null;
      if (combo) { if (id.indexOf("a:") === 0) setBinding(id.slice(2), combo); else setButtonKey(id.slice(2), combo); }
      renderKeys();
    });
  });
  $("set-keys-reset").addEventListener("click", function () { resetBindings(); renderKeys(); });
  $("sync-form").addEventListener("submit", function (e) {
    e.preventDefault();
    let url = $("sy-url").value.trim() || SYNC_DEFAULT.url;
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    try { url = new URL(url).origin; } catch (err) { url = ""; }
    const key = $("sy-key").value.trim() || SYNC_DEFAULT.key, mail = $("sy-mail").value.trim(), pw = $("sy-pw").value;
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(url)) { $("sync-adv").open = true; renderSync("L'adresse du projet doit ressembler à https://xxxx.supabase.co"); return; }
    if (!mail || !pw) { renderSync("Saisis ton e-mail et ton mot de passe."); return; }
    renderSync("Connexion en cours.");
    signIn(url, key, mail, pw).then(function () { $("sy-pw").value = ""; renderSync(Y.state === "error" ? "Connecté, mais la base a refusé l'accès. Vérifie que la table a bien été créée." : "Synchronisation active."); App.renderAll(); },
      function (err) { renderSync(err && err.code === "unavailable" ? err.message : "Connexion refusée : vérifie ton e-mail et ton mot de passe."); });
  });
  $("sync-off").addEventListener("click", function () { signOut(); renderSync("Synchronisation désactivée. Tes matchs restent sur cet appareil."); App.renderAll(); });
}
