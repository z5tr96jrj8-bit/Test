/* Petits outils partagés par tous les modules. */

export const $ = (id) => document.getElementById(id);

/** Crée un élément : el("button", "btn primary", "OK", { type: "button" }) */
export function el(tag, cls, text, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (attrs) for (const k in attrs) {
    if (k === "dataset") Object.assign(e.dataset, attrs[k]);
    else if (k in e && typeof attrs[k] !== "string") e[k] = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  return e;
}

export function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const r1 = (x) => Math.round(x * 10) / 10;
export const pad2 = (n) => (n < 10 ? "0" : "") + n;

/** 125 -> "02:05" */
export function fmt(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return pad2(Math.floor(sec / 60)) + ":" + pad2(sec % 60);
}
/** 3725 -> "1:02:05" */
export function fmtLong(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 3600) + ":" + pad2(Math.floor(sec / 60) % 60) + ":" + pad2(sec % 60);
}
export function fmtSize(n) {
  if (n >= 1 << 30) return (n / (1 << 30)).toFixed(1) + " GB";
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + " MB";
  return Math.max(n > 0 ? 1 : 0, Math.round(n / 1024)) + " KB";
}

export const isHex = (c) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
function rgb(hex) { return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); }
/** Couleur de texte lisible sur un fond donné. */
export function textOn(hex) {
  if (!isHex(hex)) return "#FFFFFF";
  const c = rgb(hex);
  return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 > 0.6 ? "#0B0F17" : "#FFFFFF";
}
export function tint(hex, a) {
  if (!isHex(hex)) return "rgba(255,255,255," + a + ")";
  const c = rgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export const clone = (o) => JSON.parse(JSON.stringify(o));

/** Nom de fichier sans accents ni caractères spéciaux. */
export function cleanName(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const MIME = { csv: "text/csv;charset=utf-8", json: "application/json", mp4: "video/mp4", webm: "video/webm", png: "image/png", html: "text/html" };
/** Remet un fichier au navigateur (Téléchargements sur ordinateur, « Enregistrer dans Fichiers » sur iPad). */
export function downloadFile(filename, data) {
  const ext = String(filename).split(".").pop().toLowerCase();
  const blob = data instanceof Blob ? data : new Blob([data], { type: MIME[ext] || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = el("a", "", null, { href: url, download: filename });
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60000);
}

/** Lit un fichier choisi par l'utilisateur. */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = el("input", "", null, { type: "file", accept });
    inp.style.display = "none";
    inp.addEventListener("change", () => { resolve(inp.files && inp.files[0] ? inp.files[0] : null); inp.remove(); });
    document.body.appendChild(inp);
    inp.click();
  });
}

export const today = () => { const d = new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); };
export const normLabel = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
