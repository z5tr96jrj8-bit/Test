/* Assemble l'appli en un seul fichier HTML (dist/RL-Analysis.html) qui s'ouvre directement depuis le disque,
   et copie le dossier prêt à déposer sur Netlify / Cloudflare Pages (dist/site/).
   Aucune dépendance : node tools/build.mjs */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(ROOT, "app"), DIST = path.join(ROOT, "dist");
const read = function (p) { return fs.readFileSync(path.join(APP, p), "utf8"); };

/* ---------- JavaScript : ordre des modules d'après leurs imports ---------- */
const mods = {};
function load(name) {
  if (mods[name]) return;
  const src = read("js/" + name);
  const deps = [];
  src.replace(/^import\s+[^;]*?from\s+"\.\/([\w-]+\.js)";\s*$/gm, function (_, d) { deps.push(d); return ""; });
  mods[name] = { src: src, deps: deps };
  deps.forEach(load);
}
load("main.js");
const order = [], seen = {}, visiting = {};
function visit(n, chain) {
  if (seen[n]) return;
  if (visiting[n]) throw new Error("Dépendance circulaire : " + chain.concat([n]).join(" → "));
  visiting[n] = true; mods[n].deps.forEach(function (d) { visit(d, chain.concat([n])); }); seen[n] = true; order.push(n);
}
visit("main.js", []);
/* Chaque module garde son propre espace de noms ; ses exports sont passés aux modules qui les importent. */
function v(n) { return "__" + n.replace(/\W/g, "_"); }
const parts = order.map(function (n) {
  let s = mods[n].src;
  s = s.replace(/^import\s*\{([^}]*)\}\s*from\s*"\.\/([\w-]+\.js)";\s*$/gm, function (_, names, d) { return "const {" + names + "} = " + v(d) + ";"; });
  if (/^import\s/m.test(s)) throw new Error(n + " : import non reconnu");
  if (/^export\s+(default|\{)/m.test(s)) throw new Error(n + " : export non pris en charge");
  const ex = [];
  /* « export const A = 1, B = 2; » sur une ligne : tous les noms sont exportés */
  s = s.replace(/^export\s+(const|let|var)\s+([^;\n]*);/gm, function (all, kw, body) {
    if (/[{}[\]()]/.test(body.replace(/"[^"]*"|'[^']*'/g, ""))) return all;
    body.split(",").forEach(function (part) { const mm = part.trim().match(/^([A-Za-z_$][\w$]*)\s*=/); if (mm) ex.push(mm[1]); });
    return kw + " " + body + ";";
  });
  s = s.replace(/^export\s+((?:async\s+)?function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm, function (_, kw, id) { ex.push(id); return kw + " " + id; });
  return "/* ===== " + n + " ===== */\nconst " + v(n) + " = (function () {\n" + s + "\nreturn { " + ex.map(function (e) { return e + ": " + e; }).join(", ") + " };\n})();";
});
const js = "(function () {\n\"use strict\";\n" + parts.join("\n") + "\n})();\n";

/* ---------- CSS avec polices intégrées ---------- */
function inlineFonts(css) {
  return css.replace(/url\(\.\.\/fonts\/([\w-]+\.woff2)\)/g, function (_, f) {
    return "url(data:font/woff2;base64," + fs.readFileSync(path.join(APP, "fonts", f)).toString("base64") + ")";
  });
}
const css = inlineFonts(read("css/theme.css")) + "\n" + read("css/app.css");
const icon = "data:image/png;base64," + fs.readFileSync(path.join(APP, "icons/icon.png")).toString("base64");

let html = read("index.html");
html = html.replace(/<link rel="stylesheet" href="css\/theme\.css">\s*<link rel="stylesheet" href="css\/app\.css">/, function () { return "<style>\n" + css + "\n</style>"; });
html = html.replace(/href="icons\/icon\.png"/g, function () { return 'href="' + icon + '"'; });
html = html.replace(/<link rel="manifest"[^>]*>\s*/, "");
html = html.replace(/<script type="module" src="js\/main\.js"><\/script>/, function () { return "<script>\n" + js.replace(/<\/script/g, "<\\/script") + "</script>"; });
if (/src="js\/|href="css\//.test(html)) throw new Error("Une ressource n'a pas été intégrée");

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "RL-Analysis.html"), html);

/* ---------- Dossier du site (Netlify, Cloudflare Pages) ---------- */
const SITE = path.join(DIST, "site");
fs.rmSync(SITE, { recursive: true, force: true });
fs.cpSync(APP, SITE, { recursive: true });

/* Service worker : liste exacte des fichiers + version = empreinte du contenu (une mise à jour change la version) */
import crypto from "node:crypto";
const files = [];
(function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else files.push(path.relative(SITE, f).split(path.sep).join("/")); }); })(SITE);
const cacheable = files.filter(function (f) { return f !== "sw.js" && f !== "_headers"; }).sort();
const hash = crypto.createHash("sha256"); cacheable.forEach(function (f) { hash.update(f); hash.update(fs.readFileSync(path.join(SITE, f))); });
const version = hash.digest("hex").slice(0, 12);
let sw = fs.readFileSync(path.join(SITE, "sw.js"), "utf8");
sw = sw.replace('const VERSION = "dev";', 'const VERSION = "' + version + '";').replace(/const FILES = \[.*\];/, function () { return "const FILES = " + JSON.stringify(["./"].concat(cacheable)) + ";"; });
fs.writeFileSync(path.join(SITE, "sw.js"), sw);
fs.writeFileSync(path.join(DIST, "VERSION.txt"), version + "\n");

/* Zip du site (index.html à la racine) : se dépose tel quel sur Netlify / Cloudflare */
try { const { execSync } = await import("node:child_process"); fs.rmSync(path.join(DIST, "RL-Analysis-site.zip"), { force: true }); execSync("zip -qr ../RL-Analysis-site.zip .", { cwd: SITE }); } catch (e) { console.log("(zip non créé : commande « zip » absente)"); }

console.log("dist/RL-Analysis.html : " + Math.round(html.length / 1024) + " Ko, " + order.length + " modules (" + order.join(", ") + ")");
console.log("dist/site/ : dossier à déposer tel quel (version " + version + ", " + cacheable.length + " fichiers hors ligne)");
