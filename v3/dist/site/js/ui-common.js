/* Éléments d'interface partagés : registre des écrans, toast, menus, renommage, peinture des boutons. */
import { $, el, textOn, isHex } from "./util.js";
import { undo } from "./state.js";

/* Registre : chaque écran y range ses fonctions, pour que les modules s'appellent sans dépendance circulaire. */
export const App = {};

/* ---------- Toast (avec « Annuler ») ---------- */
let toastTimer = 0;
export function toast(text, withUndo) {
  $("toast-text").textContent = text;
  $("toast-undo").hidden = !withUndo;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { $("toast").hidden = true; }, 7000);
}
export function initToast() {
  $("toast-undo").addEventListener("click", function () { $("toast").hidden = true; const l = undo(); if (l) { App.afterHistory(); toast("Annulé : " + l, false); } });
}

/* ---------- Menu déroulant ---------- */
export function openPop(anchor, items, alignLeft) {
  const pop = $("pop"); pop.textContent = "";
  items.forEach(function (it) {
    const b = el("button", it[2] ? "dg" : "", it[0]); b.type = "button";
    if (it[3]) { const k = el("span", "kb", it[3]); b.appendChild(k); }
    if (it[1]) b.addEventListener("click", function () { closePop(); it[1](); }); else b.disabled = true;
    pop.appendChild(b);
  });
  pop.hidden = false;
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  const left = alignLeft ? r.left : r.right - w;
  pop.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, left)) + "px";
  pop.style.top = (r.bottom + 4 + h > window.innerHeight ? Math.max(4, r.top - h - 4) : r.bottom + 4) + "px";
}
export function closePop() { $("pop").hidden = true; }
export function initPop() {
  document.addEventListener("click", function (e) { if (!e.target.closest("#pop, [data-mmenu]")) closePop(); });
  window.addEventListener("resize", closePop);
}

/* ---------- Renommer sur place ---------- */
export function inlineRename(anchor, value, done) {
  if (!anchor) return;
  const old = document.querySelector(".inline-rename"); if (old) old.remove();
  const r = anchor.getBoundingClientRect();
  const inp = el("input", "inline-rename"); inp.maxLength = 30; inp.value = value; inp.setAttribute("aria-label", "Nouveau nom");
  inp.style.left = r.left + "px"; inp.style.top = r.top + "px"; inp.style.width = Math.max(160, r.width) + "px"; inp.style.height = Math.max(36, r.height) + "px";
  document.body.appendChild(inp);
  let closed = false;
  function close(save) { if (closed) return; closed = true; const v = inp.value.trim(); inp.remove(); if (save && v && v !== value) done(v); }
  inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); close(true); } else if (e.key === "Escape") close(false); });
  inp.addEventListener("blur", function () { close(true); });
  setTimeout(function () { inp.focus(); inp.select(); }, 0);
}
/* Double toucher sur un élément (sans déplacement). */
export function onDoubleTap(box, sel, ok, cb) {
  let start = null, last = null;
  box.addEventListener("pointerdown", function (e) { const n = e.target.closest(sel); start = n && ok() ? { x: e.clientX, y: e.clientY, n: n } : null; });
  box.addEventListener("pointerup", function (e) {
    if (!start) return;
    const n = e.target.closest(sel) || start.n, key = n.dataset.item || n.dataset.row, moved = Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 12;
    start = null;
    if (moved || !key) { last = null; return; }
    const now = Date.now();
    if (last && last.key === key && now - last.t < 450) { last = null; e.preventDefault(); cb(key); } else last = { key: key, t: now };
  });
}

/* ---------- Peinture des boutons du panel ---------- */
export function patternCss(pat, base) {
  const light = textOn(base) === "#FFFFFF";
  const ink = light ? "rgba(255,255,255,.26)" : "rgba(0,0,0,.2)";
  if (pat === "vlines") return { image: "repeating-linear-gradient(90deg, " + ink + " 0, " + ink + " 1px, transparent 1px, transparent 7px)", size: "auto", repeat: "no-repeat", position: "0 0" };
  if (pat === "hlines") return { image: "repeating-linear-gradient(0deg, " + ink + " 0, " + ink + " 1px, transparent 1px, transparent 6px)", size: "auto", repeat: "no-repeat", position: "0 0" };
  if (pat === "target") { const ring = light ? "rgba(255,255,255,.8)" : "rgba(12,30,70,.88)"; return { image: "repeating-radial-gradient(circle at 50% 50%, transparent 0, transparent 4px, " + ring + " 4px, " + ring + " 7px, transparent 7px, transparent 10px)", size: "auto", repeat: "no-repeat", position: "0 0" }; }
  if (pat === "stripes") return { image: "repeating-linear-gradient(135deg, transparent 0, transparent 7px, " + ink + " 7px, " + ink + " 8px)", size: "auto", repeat: "no-repeat", position: "0 0" };
  if (pat === "grid") return { image: "linear-gradient(" + ink + " 1px, transparent 1px), linear-gradient(90deg, " + ink + " 1px, transparent 1px)", size: "12px 12px", repeat: "repeat", position: "-1px -1px" };
  return { image: "none", size: "auto", repeat: "repeat", position: "0 0" };
}
export function borderCss(bd, bw) { const w = bw || (bd ? 2 : 0); return w ? w + "px solid " + (bd || "rgba(255,255,255,.28)") : ""; }
export function paint(node, color, pat, bd, bw) {
  const p = patternCss(pat || "none", color);
  if (bd !== undefined) node.style.border = borderCss(bd, bw);
  node.dataset.pat = pat || "none"; node.style.setProperty("--pb-bg", color);
  node.style.backgroundColor = color; node.style.backgroundImage = p.image; node.style.backgroundSize = p.size;
  node.style.backgroundRepeat = p.repeat; node.style.backgroundPosition = p.position;
  node.style.color = isHex(color) ? textOn(color) : "";
}

export function anyOverlayOpen() {
  return !!document.querySelector(".overlay:not([hidden])") || !!document.querySelector(".inline-rename");
}
export function showOnly(viewId) {
  ["view-home", "view-match", "view-panel", "view-sort"].forEach(function (id) { $(id).hidden = id !== viewId; });
}
