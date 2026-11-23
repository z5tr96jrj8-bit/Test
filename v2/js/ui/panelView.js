/* Éditeur du panel : le panel à gauche, les réglages du bouton sélectionné à droite.
   Toutes les modifications s'enregistrent tout de suite et peuvent être annulées. */

import { store } from "../core/store.js";
import { $, el, uid, clamp, isHex } from "../core/util.js";
import { t } from "../core/i18n.js";
import { activePanel, itemById, editPanel, defaultButtons, PRESETS, PATTERNS, ROLES, DEF_PRE, DEF_POST, COLS, paint, C_WITH, C_WITHOUT } from "../model/panel.js";
import { Pad } from "./pad.js";
import { icon } from "./icons.js";
import { toast, confirmBox } from "./dialogs.js";
import { openPanelMenu } from "./panelMenu.js";
import { onDoubleTap, inlineRename } from "./dialogs.js";

let go = null, pad = null, back = null, props = null, picker = null, built = false;
export function initPanelView(nav) { go = nav; }

function build() {
  const r = $("view-panel"); r.innerHTML = "";
  const top = el("header", "topbar");
  const b = el("button", "ib", null, { type: "button", title: t("Back"), "aria-label": t("Back") }); b.innerHTML = icon("back");
  b.addEventListener("click", () => (back ? go("match", { id: back }) : go("home")));
  top.append(b, el("b", "page-title", t("Edit the panel")));
  picker = el("button", "picker", null, { type: "button" });
  picker.addEventListener("click", () => openPanelMenu(picker));
  top.appendChild(picker);
  top.appendChild(el("span", "flex"));
  const undo = el("button", "ib", null, { type: "button", title: t("Undo") }); undo.innerHTML = icon("undo"); undo.addEventListener("click", () => store.undo());
  const redo = el("button", "ib", null, { type: "button", title: t("Redo") }); redo.innerHTML = icon("redo"); redo.addEventListener("click", () => store.redo());
  top.append(undo, redo);
  r.appendChild(top);
  const wrap = el("div", "editor");
  const left = el("section", "card editor-pad");
  left.appendChild(el("p", "muted small", t("Tap a button to select it, then drag it to move it or pull its bottom-right corner to resize it. Double-tap to rename.")));
  const host = el("div", "pad-host edit");
  left.appendChild(host);
  wrap.appendChild(left);
  const right = el("section", "card editor-props");
  const tools = el("div", "row-tools");
  const add = (label, fn, cls) => { const x = el("button", "btn small " + (cls || ""), label, { type: "button" }); x.addEventListener("click", fn); tools.appendChild(x); };
  add(t("Add a button"), () => addItem("button"), "primary");
  add(t("Add a title"), () => addItem("label"));
  add(t("Original layout"), async () => {
    if (!(await confirmBox(t("Original layout"), t("Replace this panel with the original RL Football layout? You can undo."), t("Replace")))) return;
    editPanel(t("Original layout"), (p) => { p.buttons = defaultButtons(); });
    pad.sel = null;
  }, "quiet");
  right.appendChild(tools);
  props = el("div", "props");
  right.appendChild(props);
  wrap.appendChild(right);
  r.appendChild(wrap);
  pad = new Pad(host, { mode: "edit", onSelect: () => renderProps() });
  onDoubleTap(pad.grid, "[data-id]", () => true, (n) => {
    const it = itemById(n.dataset.id); if (!it) return;
    inlineRename(n, it.label, (v) => editPanel(t("Rename"), (p) => { p.buttons.find((x) => x.id === it.id).label = v.slice(0, 30); }));
  });
  store.on("panel", () => { if (!$("view-panel").hidden) refresh(); });
  store.on("restore", (e) => { if (e.id === "panels" && !$("view-panel").hidden) refresh(); });
  built = true;
}
function refresh() {
  if (pad.sel && !itemById(pad.sel)) pad.sel = null;
  pad.render(); renderProps();
  picker.innerHTML = "<span>" + activePanel().name.replace(/[&<>]/g, "") + "</span>" + icon("chevd", 14);
}
export function showPanel(opts) {
  if (!built) build();
  back = opts && opts.back ? opts.back : null;
  refresh();
}

function addItem(type) {
  const id = uid("b");
  const maxR = activePanel().buttons.reduce((n, it) => Math.max(n, it.r + it.h), 0);
  editPanel(type === "button" ? t("Add a button") : t("Add a title"), (p) => {
    p.buttons.push(type === "button"
      ? { id, type: "button", label: "NEW", side: "with", color: C_WITH, pat: "none", bd: "", bw: 0, role: "", pre: null, post: null, res: [], key: "", c: 0, r: maxR, w: 24, h: 8 }
      : { id, type: "label", label: "TITLE", color: "", pat: "none", bd: "", bw: 0, c: 0, r: maxR, w: COLS, h: 6 });
  });
  pad.sel = id; refresh();
  const lab = props.querySelector("input"); if (lab) { lab.focus(); lab.select(); }
}

/* Réglages du bouton sélectionné */
function renderProps() {
  props.textContent = "";
  const it = pad.sel ? itemById(pad.sel) : null;
  if (!it) { props.appendChild(el("p", "muted", t("Tap a button of the panel to change its text, colour, border, clip length or results."))); return; }
  const isBtn = it.type === "button";
  const set = (label, fn, now) => editPanel(label, (p) => { const x = p.buttons.find((y) => y.id === it.id); if (!x) return false; fn(x); });
  const row = (label, node) => { const r = el("div", "prop"); r.append(el("span", "prop-lab", label), node); props.appendChild(r); return r; };

  const name = el("input", "", null, { maxlength: "30" }); name.value = it.label;
  name.addEventListener("change", () => set(t("Rename"), (x) => { x.label = name.value.trim().slice(0, 30) || x.label; }));
  row(t("Text"), name);

  if (isBtn) {
    const seg = el("div", "seg");
    [["with", t("With ball")], ["without", t("Without ball")]].forEach(([v, l]) => { const b = el("button", it.side === v ? "on" : "", l, { type: "button" }); b.addEventListener("click", () => set(t("Phase"), (x) => { const wasDef = x.color === (x.side === "with" ? C_WITH : C_WITHOUT); x.side = v; if (wasDef) x.color = v === "with" ? C_WITH : C_WITHOUT; })); seg.appendChild(b); });
    row(t("Phase"), seg);
  }
  // Couleur
  const sw = el("div", "swatches");
  if (!isBtn) { const n = el("button", "no-fill" + (!it.color ? " on" : ""), t("None"), { type: "button" }); n.addEventListener("click", () => set(t("Colour"), (x) => { x.color = ""; })); sw.appendChild(n); }
  PRESETS.forEach(([c, l]) => { const b = el("button", it.color === c ? "on" : "", null, { type: "button", title: t(l), "aria-label": t(l) }); b.style.background = c; b.addEventListener("click", () => set(t("Colour"), (x) => { x.color = c; })); sw.appendChild(b); });
  const custom = el("input", "", null, { type: "color", "aria-label": t("Other colour") }); custom.value = isHex(it.color) ? it.color.toLowerCase() : "#888888";
  custom.addEventListener("change", () => set(t("Colour"), (x) => { x.color = custom.value.toUpperCase(); }));
  sw.appendChild(custom);
  row(t("Colour"), sw);
  if (it.color) {
    const pt = el("div", "swatches pats");
    PATTERNS.forEach(([p, l]) => { const b = el("button", (it.pat || "none") === p ? "on" : "", null, { type: "button", title: t(l), "aria-label": t(l) }); paint(b, { color: it.color, pat: p }); b.addEventListener("click", () => set(t("Pattern"), (x) => { x.pat = p; })); pt.appendChild(b); });
    row(t("Pattern"), pt);
  }
  // Bord
  const bd = el("div", "swatches");
  const nb = el("button", "no-fill" + (!it.bd ? " on" : ""), t("Default"), { type: "button" }); nb.addEventListener("click", () => set(t("Border"), (x) => { x.bd = ""; })); bd.appendChild(nb);
  PRESETS.forEach(([c, l]) => { const b = el("button", it.bd === c ? "on" : "", null, { type: "button", title: t(l) }); b.style.background = "transparent"; b.style.border = "4px solid " + c; b.addEventListener("click", () => set(t("Border"), (x) => { x.bd = c; if (!x.bw) x.bw = 2; })); bd.appendChild(b); });
  row(t("Border"), bd);
  const bw = el("div", "seg small");
  [1, 2, 3, 4, 6].forEach((n) => { const b = el("button", (it.bw || (it.bd ? 2 : 1)) === n ? "on" : "", String(n), { type: "button" }); b.addEventListener("click", () => set(t("Border"), (x) => { x.bw = n; })); bw.appendChild(b); });
  row(t("Thickness"), bw);

  if (isBtn) {
    const clip = el("div", "clip-row");
    const stepper = (key, def, label) => {
      const s = el("span", "stepper");
      const v = it[key] != null ? it[key] : def;
      const mk = (txt, d) => { const b = el("button", "", txt, { type: "button" }); b.addEventListener("click", () => set(t("Clip length"), (x) => { x[key] = clamp((x[key] != null ? x[key] : def) + d, 0, 60); })); return b; };
      s.append(mk("−", -1), el("span", "", label.replace("{s}", v)), mk("+", 1));
      return s;
    };
    clip.append(stepper("pre", DEF_PRE, t("{s} s before")), stepper("post", DEF_POST, t("{s} s after")));
    row(t("Clip"), clip);
    props.appendChild(el("p", "muted small", t("One tap on this button keeps these seconds before and after the tagged moment.")));
    const res = el("input", "", null, { maxlength: "120", placeholder: t("e.g. Ball won, Broken") }); res.value = it.res.join(", ");
    res.addEventListener("change", () => set(t("Results"), (x) => { x.res = res.value.split(",").map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 6); }));
    row(t("Results"), res);
    const role = el("select");
    ROLES.forEach(([v, l]) => { const o = el("option", "", t(l)); o.value = v; if (it.role === v) o.selected = true; role.appendChild(o); });
    role.addEventListener("change", () => set(t("Role"), (x) => { x.role = role.value; }));
    row(t("Role"), role);
    props.appendChild(el("p", "muted small", t("“Goal (for)” and “Goal (against)” buttons make the score.")));
  }
  const acts = el("div", "row-tools");
  if (isBtn) {
    const dup = el("button", "btn small", t("Duplicate"), { type: "button" });
    dup.addEventListener("click", () => {
      const id = uid("b"), maxR = activePanel().buttons.reduce((n, x) => Math.max(n, x.r + x.h), 0);
      editPanel(t("Duplicate"), (p) => { const src = p.buttons.find((x) => x.id === it.id); p.buttons.push(Object.assign(JSON.parse(JSON.stringify(src)), { id, r: maxR, c: 0 })); });
      pad.sel = id; refresh(); toast(t("Button duplicated, at the bottom of the panel."));
    });
    acts.appendChild(dup);
  }
  const del = el("button", "btn small danger", t("Delete"), { type: "button" });
  del.addEventListener("click", () => { editPanel(t("Delete button"), (p) => { p.buttons = p.buttons.filter((x) => x.id !== it.id); }); pad.sel = null; refresh(); toast(t("Button deleted. Tags already coded are kept."), { label: t("Undo"), run: () => store.undo() }); });
  acts.appendChild(del);
  props.appendChild(acts);
}
