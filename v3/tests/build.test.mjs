/* La version en un seul fichier doit exporter exactement les mêmes noms que les modules. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("le fichier unique reprend tous les exports de chaque module", async function () {
  execSync("node tools/build.mjs", { cwd: ROOT, stdio: "ignore" });
  const html = fs.readFileSync(ROOT + "dist/RL-Analysis.html", "utf8");
  const files = fs.readdirSync(ROOT + "app/js").filter(function (f) { return f.endsWith(".js") && f !== "main.js"; });
  for (const f of files) {
    const mod = await import(ROOT + "app/js/" + f);
    const re = new RegExp("const __" + f.replace(/\W/g, "_") + " = \\(function \\(\\) \\{[\\s\\S]*?\\nreturn \\{ ([^}]*) \\};\\n\\}\\)\\(\\);");
    const m = html.match(re);
    assert.ok(m, f + " absent du fichier unique");
    const got = m[1].split(",").map(function (x) { return x.split(":")[0].trim(); }).filter(Boolean).sort();
    assert.deepEqual(got, Object.keys(mod).sort(), f);
  }
});
