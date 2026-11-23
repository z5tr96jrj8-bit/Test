/* Démarrage et navigation entre les écrans. */

import { store } from "./core/store.js";
import { $ } from "./core/util.js";
import { t } from "./core/i18n.js";
import { panelsDoc } from "./model/panel.js";
import { initHome, showHome, showNew, showProjects } from "./ui/homeView.js";
import { initMatchView, openMatch, leaveMatch, matchViewState } from "./ui/matchView.js";
import { initPanelView, showPanel } from "./ui/panelView.js";
import { initSortView, showSort, leaveSort } from "./ui/sortView.js";
import { closeMenu, toast } from "./ui/dialogs.js";

const VIEWS = { home: "view-home", new: "view-home", projects: "view-home", match: "view-match", panel: "view-panel", sort: "view-sort" };
let current = null;

function go(name, args) {
  args = args || {};
  closeMenu();
  if (current === "match" && name !== "match") leaveMatch();
  if (current === "sort" && name !== "sort") leaveSort();
  Object.values(VIEWS).forEach((id) => { $(id).hidden = id !== VIEWS[name]; });
  current = name;
  window.scrollTo(0, 0);
  if (name === "home") showHome();
  else if (name === "new") showNew();
  else if (name === "projects") showProjects(args);
  else if (name === "panel") showPanel(args);
  else if (name === "sort") showSort(args);
  else if (name === "match") {
    openMatch(args.id, args);
  }
}

/* iPad : la vidéo se mélange à la musique d'une autre app au lieu de la couper. */
try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (e) { /* rien */ }

store.load().then(() => {
  panelsDoc(); // crée le panel par défaut au premier lancement
  initHome(go); initMatchView(go); initPanelView(go); initSortView(go);
  $("boot").remove();
  go("home");
}, (err) => {
  $("boot").textContent = t("This browser cannot store data (private browsing?). RL Analysis needs it to keep your coding.");
  console.error(err);
});

/* Hors ligne : l'application reste utilisable sans réseau une fois ouverte une première fois. */
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
window.addEventListener("error", (e) => { if (e && e.message && !/ResizeObserver/.test(e.message)) toast(t("Unexpected error: {m}", { m: e.message })); });

export { matchViewState };
