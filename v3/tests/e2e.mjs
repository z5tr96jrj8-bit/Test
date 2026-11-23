/* Test de bout en bout dans un vrai navigateur (Playwright, si installé) :
   node tests/e2e.mjs [chemin-vers-une-video.mp4]
   Teste la version en un seul fichier (dist/RL-Analysis.html) ouverte depuis le disque. */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
execSync("node tools/build.mjs", { cwd: ROOT, stdio: "inherit" });

let video = process.argv[2];
if (!video) {
  video = path.join(os.tmpdir(), "rl-test-video.mp4");
  if (!fs.existsSync(video)) execSync('ffmpeg -loglevel error -y -f lavfi -i "color=c=0x2E6B34:s=640x360:d=3600" -c:v libx264 -preset ultrafast -crf 40 -pix_fmt yuv420p ' + video);
}
const fixture = path.join(ROOT, "tests/fixtures/legacy-backup.json");
let failed = 0;
function check(name, ok, info) { console.log((ok ? "OK   " : "ÉCHEC") + " " + name + (info ? " — " + info : "")); if (!ok) failed++; }

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 1024 } });
p.setDefaultTimeout(8000);
const errors = [];
p.on("pageerror", function (e) { errors.push(e.message); });
await p.goto("file://" + path.join(ROOT, "dist/RL-Analysis.html"));
await p.waitForTimeout(600);
check("accueil affiché", await p.isVisible("#go-new"));

await p.click("#go-projects");
await p.setInputFiles("#import-file", fixture);
await p.waitForSelector("#import-overlay:not([hidden])");
check("rapport d'import", /2 matchs, 200 tags, 1 projet, 2 panels/.test(await p.textContent("#import-desc")), await p.textContent("#import-desc"));
await p.click("#import-ok");
await p.click("#pr-tab-p");
await p.click("[data-popen]");
await p.waitForSelector("#view-match:not([hidden])");
check("match ouvert", (await p.textContent("#sc-teams")).length > 3, await p.textContent("#sc-teams"));
await p.click("#at-combo"); await p.click("#pop button:has-text('Équipe A – Équipe B')");
await p.setInputFiles("#video-file", video);
await p.waitForFunction(function () { return !document.getElementById("video").hidden; });
await p.evaluate(function () { document.getElementById("video").currentTime = 600; });
await p.waitForTimeout(300);

/* Codage au clavier */
await p.click("#at-mode [data-lay='ana']"); await p.click("#at-tabs [data-t='last']");
const before = await p.evaluate(function () { return document.querySelectorAll("#tag-list li").length; });
await p.keyboard.press("a"); await p.keyboard.press("Digit2");
check("tag par la touche A + résultat 2", /Perdue/.test(await p.textContent("#at-last-tm")), await p.textContent("#at-last-nm") + " " + await p.textContent("#at-last-tm"));
await p.click("#at-tabs [data-t='cur']");
await p.click("#note"); await p.keyboard.type("aqz");
check("raccourcis inactifs pendant la saisie", (await p.inputValue("#note")) === "aqz" && (await p.evaluate(function () { return document.querySelectorAll("#tag-list li").length; })) === before + 1);
await p.click("#tb-undo");
check("annuler (note)", (await p.inputValue("#note")) === "");
await p.click("#tb-undo");
const afterUndo = await p.evaluate(function () { return document.querySelectorAll("#tag-list li").length; });
await p.click("#tb-undo");
check("annuler (tag)", (await p.evaluate(function () { return document.querySelectorAll("#tag-list li").length; })) === before, String(afterUndo));
await p.click("#tb-redo"); await p.click("#tb-redo");
check("rétablir", /Perdue/.test(await p.textContent("#at-last-tm")));

/* Persistance */
await p.waitForTimeout(400);
await p.reload(); await p.waitForTimeout(600);
await p.click("#go-projects"); await p.click("#pr-tab-m");
check("données conservées après rechargement", /121 tags/.test(await p.textContent("#match-list")), (await p.textContent("#match-list")).replace(/\s+/g, " ").slice(0, 120));

/* Fluidité : 2 000 tags */
const t = await p.evaluate(function () {
  return new Promise(function (resolve) {
    const req = indexedDB.open("rl-analysis");
    req.onsuccess = function () {
      const tx = req.result.transaction("docs", "readwrite"), st = tx.objectStore("docs");
      const g = st.get("mfixa00001");
      g.onsuccess = function () {
        const m = g.result, base = m.tags.slice();
        while (m.tags.length < 2000) { const c = Object.assign({}, base[m.tags.length % base.length]); c.id = "perf" + m.tags.length; c.v = (m.tags.length * 1.7) % 3500; m.tags.push(c); }
        st.put(m); tx.oncomplete = function () { resolve(m.tags.length); };
      };
    };
  });
});
await p.reload(); await p.waitForTimeout(600);
await p.click("#go-projects"); await p.click("#pr-tab-m"); await p.click("[data-open='mfixa00001']");
await p.setInputFiles("#video-file", video);
await p.waitForFunction(function () { return !document.getElementById("video").hidden; });
await p.click("#at-mode [data-lay='code']");
const ms = await p.evaluate(function () {
  const t0 = performance.now(), n = 20;
  for (let i = 0; i < n; i++) document.querySelector("#event-grid .pb").click();
  return (performance.now() - t0) / n;
});
check("ajout d'un tag avec " + t + " tags dans le match", ms < 120, Math.round(ms) + " ms par tag (machine de test)");
await p.click("#at-mode [data-lay='ana']");
const msAna = await p.evaluate(function () { const t0 = performance.now(); document.querySelector("#event-grid .pb").click(); return performance.now() - t0; });
check("ajout d'un tag en page Analyse (timeline complète)", msAna < 400, Math.round(msAna) + " ms");

check("aucune erreur JavaScript", !errors.length, errors.join(" | "));
await b.close();
console.log(failed ? failed + " échec(s)" : "Tout est bon.");
process.exit(failed ? 1 : 0);
