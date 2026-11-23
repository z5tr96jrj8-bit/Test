/* Fenêtres, menus et messages : remplacent window.prompt / confirm (bloquants et peu lisibles sur iPad). */

import { el } from "../core/util.js";
import { t } from "../core/i18n.js";

let toastTimer = 0;
/** Message en bas de l'écran, avec un bouton d'action facultatif (ex. Undo). */
export function toast(text, action) {
  let box = document.getElementById("toast");
  if (!box) { box = el("div", "toast", null, { id: "toast", role: "status" }); document.body.appendChild(box); }
  box.textContent = "";
  box.appendChild(el("span", "", text));
  if (action) {
    const b = el("button", "toast-btn", action.label, { type: "button" });
    b.addEventListener("click", () => { box.hidden = true; action.run(); });
    box.appendChild(b);
  }
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, action ? 7000 : 3500);
}

/** Fenêtre modale. content : élément ou texte. buttons : [{ label, primary?, danger?, value }] */
export function modal(title, content, buttons, opts) {
  return new Promise((resolve) => {
    const ov = el("div", "overlay");
    const dlg = el("div", "dialog" + (opts && opts.wide ? " wide" : ""), null, { role: "dialog", "aria-modal": "true" });
    dlg.appendChild(el("h2", "", title));
    if (typeof content === "string") dlg.appendChild(el("p", "dlg-text", content));
    else if (content) dlg.appendChild(content);
    const acts = el("div", "dlg-actions");
    const close = (v) => { ov.remove(); document.removeEventListener("keydown", onKey, true); resolve(v); };
    (buttons || [{ label: t("Close"), value: null }]).forEach((b) => {
      const btn = el("button", "btn" + (b.primary ? " primary" : "") + (b.danger ? " danger" : ""), b.label, { type: "button" });
      btn.addEventListener("click", () => close(typeof b.value === "function" ? b.value() : b.value));
      acts.appendChild(btn);
    });
    dlg.appendChild(acts);
    ov.appendChild(dlg);
    ov.addEventListener("pointerdown", (e) => { if (e.target === ov) close(null); });
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(null); }
      if (e.key === "Enter" && opts && opts.enter && e.target.tagName !== "TEXTAREA") { e.preventDefault(); e.stopPropagation(); close(opts.enter()); }
    };
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(ov);
    const f = dlg.querySelector("input, select, textarea") || acts.querySelector(".primary");
    if (f) setTimeout(() => { f.focus(); if (f.select) f.select(); }, 30);
    if (opts && opts.onOpen) opts.onOpen(dlg, close);
  });
}

export function confirmBox(title, text, okLabel, danger) {
  return modal(title, text, [{ label: t("Cancel"), value: false }, { label: okLabel || t("OK"), value: true, primary: !danger, danger: !!danger }]);
}

export function promptBox(title, label, value) {
  const wrap = el("div", "field");
  wrap.appendChild(el("label", "", label));
  const inp = el("input", "", null, { maxlength: "40" });
  inp.value = value || "";
  wrap.appendChild(inp);
  const get = () => inp.value.trim() || null;
  return modal(title, wrap, [{ label: t("Cancel"), value: null }, { label: t("OK"), value: get, primary: true }], { enter: get });
}

/** Petit menu ancré sous un bouton. items : [[libellé, action, danger?]] ou null pour un séparateur. */
export function menu(anchor, items) {
  closeMenu();
  const pop = el("div", "menu", null, { id: "menu", role: "menu" });
  items.forEach((it) => {
    if (!it) { pop.appendChild(el("hr")); return; }
    const b = el("button", it[2] ? "danger" : "", it[0], { type: "button", role: "menuitem" });
    if (it[3]) b.setAttribute("aria-checked", "true");
    b.addEventListener("click", () => { closeMenu(); it[1](); });
    pop.appendChild(b);
  });
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left)) + "px";
  pop.style.top = (r.bottom + 4 + h > innerHeight ? Math.max(6, r.top - h - 4) : r.bottom + 4) + "px";
  setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
}
function outside(e) { if (!e.target.closest("#menu")) closeMenu(); }
export function closeMenu() {
  const m = document.getElementById("menu"); if (m) m.remove();
  document.removeEventListener("pointerdown", outside, true);
}

/** Petit champ posé sur un élément pour le renommer (double toucher). */
export function inlineRename(anchor, value, done) {
  const old = document.querySelector(".inline-rename"); if (old) old.remove();
  const r = anchor.getBoundingClientRect();
  const inp = el("input", "inline-rename", null, { maxlength: "30", "aria-label": t("New name") });
  inp.value = value;
  Object.assign(inp.style, { left: r.left + "px", top: r.top + "px", width: Math.max(160, r.width) + "px", height: Math.max(30, r.height) + "px" });
  document.body.appendChild(inp);
  let closed = false;
  const close = (save) => { if (closed) return; closed = true; const v = inp.value.trim(); inp.remove(); if (save && v && v !== value) done(v); };
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); close(true); } else if (e.key === "Escape") close(false); });
  inp.addEventListener("blur", () => close(true));
  setTimeout(() => { inp.focus(); inp.select(); }, 0);
}

/** Double toucher sur un élément d'une zone (fonctionne au doigt, sans dblclick d'iOS). */
export function onDoubleTap(box, selector, ok, cb) {
  let start = null, last = null;
  box.addEventListener("pointerdown", (e) => { const n = e.target.closest(selector); start = n && ok() ? { x: e.clientX, y: e.clientY, n } : null; });
  box.addEventListener("pointerup", (e) => {
    if (!start) return;
    const n = start.n, moved = Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 8;
    start = null;
    if (moved) { last = null; return; }
    const now = Date.now();
    if (last && last.n === n && now - last.t < 450) { last = null; cb(n); } else last = { n, t: now };
  });
}
