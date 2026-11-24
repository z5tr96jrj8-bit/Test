/* Hors ligne, installation, démo, transfert : node tests/offline.mjs (Playwright requis) */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
execSync("node tools/build.mjs", { cwd: ROOT, stdio: "ignore" });
const SITE = path.join(ROOT, "dist/site");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const srv = http.createServer(function (q, r) {
  let f = path.join(SITE, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html";
  if (!f.startsWith(SITE) || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); r.end(fs.readFileSync(f));
}).listen(0);
const URL_ = "http://localhost:" + srv.address().port + "/";
let failed = 0;
function check(n, ok, i) { console.log((ok ? "OK   " : "ÉCHEC") + " " + n + (i ? " — " + i : "")); if (!ok) failed++; }

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 1024 }, acceptDownloads: true });
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
const errors = []; p.on("pageerror", function (e) { errors.push(e.message); });
await p.goto(URL_); await p.waitForTimeout(500);
const man = await p.evaluate(function () { return fetch("manifest.webmanifest").then(function (r) { return r.json(); }); });
check("manifeste d'installation", man.display === "standalone" && man.icons.length === 3, man.name);
await p.evaluate(function () { return navigator.serviceWorker.ready.then(function () { return true; }); });
await p.waitForFunction(function () { return !!navigator.serviceWorker.controller; }, null, { timeout: 8000 }).catch(function () {});
await p.reload(); await p.waitForTimeout(500);
check("service worker actif", await p.evaluate(function () { return !!navigator.serviceWorker.controller; }));
const cached = await p.evaluate(function () { return caches.keys().then(function (k) { return Promise.all(k.map(function (n) { return caches.open(n).then(function (c) { return c.keys(); }); })); }); });
check("programme gardé sur l'appareil", cached[0].length >= 30, cached[0].length + " fichiers");

/* Mode démo (avec données gardées) */
await p.click("#go-demo"); await p.waitForSelector("#view-match:not([hidden])");
check("match d'exemple ouvert", /Équipe Démo/.test(await p.textContent("#sc-teams")));
await p.click("#at-mode [data-lay='ana']"); await p.waitForTimeout(400);
check("timeline du match d'exemple", (await p.$$eval(".tl-block", function (a) { return a.length; })) > 10);
await p.click("#btn-back"); await p.waitForTimeout(300);

/* Hors ligne : on coupe le réseau et on recharge */
await ctx.setOffline(true);
await p.reload(); await p.waitForTimeout(800);
check("rechargement hors ligne", await p.isVisible("#go-new"));
await p.click("#go-projects"); await p.click("#pr-tab-m");
check("données lisibles hors ligne", /Équipe Démo/.test(await p.textContent("#match-list")));
await p.click("[data-open]"); await p.waitForSelector("#view-match:not([hidden])");
await p.click("#at-mode [data-lay='code']");
check("codage hors ligne", await p.isVisible("#event-grid .pb"));
await ctx.setOffline(false);

/* Transfert d'un appareil à l'autre : Tout sauvegarder → Importer */
await p.click("#btn-back");
const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#btn-backup")]);
const file = path.join(os.tmpdir(), "rl-transfer.json"); await dl.saveAs(file);
const saved = JSON.parse(fs.readFileSync(file, "utf8"));
check("sauvegarde complète", saved.app === "rl-analysis" && saved.docs.mdemo0000001 && saved.docs.pdemo0000001, Object.keys(saved.docs).length + " éléments");
const ctx2 = await b.newContext({ viewport: { width: 1366, height: 1024 } });
const p2 = await ctx2.newPage(); p2.setDefaultTimeout(8000); p2.on("pageerror", function (e) { errors.push(e.message); });
await p2.goto(URL_); await p2.waitForTimeout(500);
await p2.click("#go-projects"); await p2.setInputFiles("#import-file", file); await p2.waitForSelector("#import-overlay:not([hidden])");
await p2.click("#import-ok"); await p2.click("#pr-tab-m");
check("import sur un autre appareil", /Équipe Démo/.test(await p2.textContent("#match-list")), (await p2.textContent("#toast-text")));

/* Depuis un fichier : pas de service worker, l'appli marche quand même */
const p3 = await (await b.newContext()).newPage();
await p3.goto("file://" + path.join(ROOT, "dist/RL-Analysis.html")); await p3.waitForTimeout(500);
await p3.click("#go-demo"); await p3.waitForSelector("#view-match:not([hidden])");
check("ouverture depuis un fichier", true);
check("aucune erreur JavaScript", !errors.length, errors.join(" | "));
await b.close(); srv.close();
console.log(failed ? failed + " échec(s)" : "Tout est bon.");
process.exit(failed ? 1 : 0);
