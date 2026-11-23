/* Menu des panels enregistrés : changer, nouveau, dupliquer, renommer, supprimer. */

import { store } from "../core/store.js";
import { t } from "../core/i18n.js";
import { uid, clone } from "../core/util.js";
import { panelsDoc, activePanel, defaultButtons, invalidate } from "../model/panel.js";
import { menu, promptBox, confirmBox, toast } from "./dialogs.js";

function change(label, fn) {
  store.mutate("panels", label, (d) => { fn(d); invalidate(); return { type: "panel" }; });
}

export function openPanelMenu(anchor) {
  const d = panelsDoc(), cur = activePanel();
  const items = d.items.map((p) => [p.name, () => {
    if (p.id === d.active) return;
    change(t("Switch panel"), (x) => { x.active = p.id; });
    toast(t("Panel “{n}”", { n: p.name }));
  }, false, p.id === d.active]);
  items.push(null);
  items.push([t("New panel"), async () => {
    const n = await promptBox(t("New panel"), t("Name"), t("New panel")); if (!n) return;
    change(t("New panel"), (x) => { const it = { id: uid("pl"), name: n.slice(0, 30), buttons: defaultButtons() }; x.items.push(it); x.active = it.id; });
  }]);
  items.push([t("Duplicate this panel"), async () => {
    const n = await promptBox(t("Duplicate this panel"), t("Name"), cur.name + " (copy)"); if (!n) return;
    change(t("Duplicate this panel"), (x) => { const it = { id: uid("pl"), name: n.slice(0, 30), buttons: clone(cur.buttons).map((b) => Object.assign(b, { id: uid("b") })) }; x.items.push(it); x.active = it.id; });
  }]);
  items.push([t("Rename this panel"), async () => {
    const n = await promptBox(t("Rename this panel"), t("Name"), cur.name); if (!n) return;
    change(t("Rename this panel"), (x) => { x.items.find((i) => i.id === x.active).name = n.slice(0, 30); });
  }]);
  if (d.items.length > 1) items.push([t("Delete this panel"), async () => {
    if (!(await confirmBox(t("Delete this panel"), t("Delete the panel “{n}”? Tags already coded are kept.", { n: cur.name }), t("Delete"), true))) return;
    change(t("Delete this panel"), (x) => { x.items = x.items.filter((i) => i.id !== x.active); x.active = x.items[0].id; });
  }, true]);
  menu(anchor, items);
}
