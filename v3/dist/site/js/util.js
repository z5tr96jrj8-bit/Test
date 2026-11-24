/* Petits outils partagés. Aucun état. */

export function $(id) { return document.getElementById(id); }

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
export function pad2(n) { return (n < 10 ? "0" : "") + n; }
export function fmt(sec) { sec = Math.max(0, Math.floor(sec)); return pad2(Math.floor(sec / 60)) + ":" + pad2(sec % 60); }
export function fmtLong(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 3600) + ":" + pad2(Math.floor(sec / 60) % 60) + ":" + pad2(sec % 60); }
export function isHex(c) { return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c); }
export function rgbOf(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
export function textOn(hex) {
  if (!isHex(hex)) return "#FFFFFF";
  const c = rgbOf(hex);
  return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 > 0.6 ? "#0A1020" : "#FFFFFF";
}
export function tint(hex, a) { if (!isHex(hex)) return "transparent"; const c = rgbOf(hex); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
export function clampInt(v, lo, hi, d) { v = Math.round(Number(v)); if (!isFinite(v)) v = d; return Math.min(hi, Math.max(lo, v)); }
export function r1(x) { return Math.round(x * 10) / 10; }
export function fmtSize(n) {
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(1).replace(".", ",") + " Go";
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1).replace(".", ",") + " Mo";
  return (n > 0 ? Math.max(1, Math.round(n / 1024)) : 0) + " Ko";
}
export function fmtSec(x) { return String(Math.round(x * 10) / 10).replace(".", ","); }
export function sentence(s) { s = String(s); return s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s; }
export function cleanName(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
export function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
