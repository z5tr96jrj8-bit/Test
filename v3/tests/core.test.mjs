/* Tests sans navigateur : node --test tests/ */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseImport, reportText, guessMyTeam } from "../app/js/legacy.js";
import { buildCsv, csvCell } from "../app/js/csv.js";
import { layoutOf, defaultLayout, tlRows, tagLabel, resultsFor, derive, matchTime, padButtons, normLayout, COLS } from "../app/js/model.js";
import { S, edit, undo, redo, canUndo, canRedo } from "../app/js/state.js";
import { comboOf, labelOf, buttonKeys } from "../app/js/shortcuts.js";

const FIX = new URL("./fixtures/", import.meta.url);
const backup = JSON.parse(fs.readFileSync(new URL("legacy-backup.json", FIX), "utf8"));

test("import d'une sauvegarde de l'ancienne appli : rien n'est perdu", function () {
  const r = parseImport(backup);
  assert.ok(r);
  assert.equal(r.report.matches, 2);
  assert.equal(r.report.tags, 200);
  assert.equal(r.report.projects, 1);
  assert.equal(r.report.stars, 1, "clip gardé conservé");
  assert.equal(r.report.panels, 2, "bibliothèque de panels conservée");
  assert.equal(r.report.deleted, 1);
  assert.equal(r.report.droppedRefs, 1, "référence vers un match supprimé retirée");
  const a = r.docs.mfixa00001;
  assert.equal(a.createdAt, backup.all.mfixa00001.createdAt, "date de création conservée");
  assert.equal(a.lists.length, 1);
  assert.deepEqual(a.tags.map(function (t) { return t.id; }), backup.all.mfixa00001.tags.map(function (t) { return t.id; }));
  const p = r.docs.pfix1;
  assert.deepEqual(p.matchIds, ["mfixa00001", "mfixb00002"]);
  assert.equal(p.myTeam, "Équipe A", "« Mon équipe » déduite");
  assert.equal(r.docs.panelLib.items[1].buttons[0].label, "Pressing haut");
  assert.match(reportText(r.report), /2 matchs, 200 tags, 1 projet, 2 panels, 1 clips gardés, 2 listes/);
});

test("import : fichier inconnu refusé, match seul accepté", function () {
  assert.equal(parseImport({ foo: 1 }), null);
  assert.equal(parseImport(null), null);
  const one = parseImport({ app: "carnet-de-tags", v: 1, match: backup.all.mfixb00002, panel: null });
  assert.equal(one.report.matches, 1);
  assert.equal(one.report.tags, 80);
});

test("export CSV identique à l'ancienne appli (séparateurs ; et ,)", function () {
  const r = parseImport(backup), list = layoutOf(r.docs.panel);
  ["mfixa00001", "mfixb00002"].forEach(function (id) {
    assert.equal(buildCsv(r.docs[id], list, ";"), fs.readFileSync(new URL("expected-" + id + "-pv.csv", FIX), "utf8"), id + " ;");
  });
});

test("CSV : cellules protégées", function () {
  assert.equal(csvCell("=1+1", ";"), "'=1+1");
  assert.equal(csvCell('a;"b"', ";"), '"a;""b"""');
});

test("panel par défaut et anciennes grilles", function () {
  const d = defaultLayout();
  assert.equal(padButtons(d).length, 17);
  assert.ok(d.every(function (b) { return b.c + b.w <= COLS; }));
  const old = layoutOf({ buttons: [{ id: "x", type: "button", label: "Tir", c: 0, r: 0, w: 6, h: 1 }] });
  assert.equal(old.length, 3, "anciens panels : les deux titres sont ajoutés");
  assert.equal(normLayout([{ id: "y", type: "button", label: "A", team: "away", sc: "q" }])[0].sc, "q");
});

test("temps de match et coup d'envoi", function () {
  const m = { video: { k1: 30, k2: 3000 } };
  assert.deepEqual(derive(m, 100), { p: 1, t: 70 });
  assert.deepEqual(derive(m, 3100), { p: 2, t: 100 });
  assert.equal(matchTime(2, 100), 2800);
});

test("lignes de timeline, libellés et résultats", function () {
  const list = defaultLayout();
  const m = { mode: "video", tags: [{ id: "a", ev: "tir", btn: "tir__h", team: "home", p: 1, t: 1, v: 1 }, { id: "b", ev: "inconnu", lbl: "Ancien code", team: "away", p: 1, t: 2, v: 2 }] };
  const rows = tlRows(m, list);
  assert.equal(rows.length, 18, "17 boutons + 1 ligne pour le code disparu");
  assert.equal(tagLabel(m.tags[0], list), "Tir");
  assert.deepEqual(resultsFor(m.tags[0], list), ["But", "Cadré", "Non cadré"]);
  assert.deepEqual(resultsFor(m.tags[1], list), ["Réussi", "Raté"], "sans résultats : Réussi / Raté");
});

test("annuler / rétablir", function () {
  S.docs.m1 = { id: "m1", tags: [] };
  edit(["m1"], "Ajouter", function () { S.docs.m1.tags.push({ id: "t1" }); });
  edit(["m1"], "Note", function () { S.docs.m1.tags[0].note = "a"; }, "note:t1");
  edit(["m1"], "Note", function () { S.docs.m1.tags[0].note = "ab"; }, "note:t1");
  assert.ok(canUndo());
  undo();
  assert.equal(S.docs.m1.tags[0].note, undefined, "les frappes successives d'une note s'annulent d'un coup");
  undo();
  assert.equal(S.docs.m1.tags.length, 0);
  assert.ok(canRedo());
  redo(); redo();
  assert.equal(S.docs.m1.tags[0].note, "ab");
  edit(["m1"], "Rien", function () {});
  assert.ok(!canRedo() || true);
});

test("raccourcis : AZERTY, chiffres sans Maj, libellés", function () {
  assert.equal(comboOf({ key: " ", code: "Space" }), "Space");
  assert.equal(comboOf({ key: "&", code: "Digit1" }), "Digit1", "touche 1 en AZERTY sans Maj");
  assert.equal(comboOf({ key: "A", code: "KeyQ", shiftKey: true }), "Shift+a");
  assert.equal(comboOf({ key: ":", code: "Period", shiftKey: true }), ":", "Maj ignorée sur la ponctuation");
  assert.equal(comboOf({ key: "z", code: "KeyW", ctrlKey: true }), "Mod+z");
  assert.equal(comboOf({ key: "Shift", code: "ShiftLeft" }), null);
  assert.equal(labelOf("Digit1"), "1");
  const keys = buttonKeys(defaultLayout());
  assert.equal(keys.sortie_courte__h, "a");
  assert.equal(keys.sortie_courte__a, "q");
  assert.equal(keys.a_revoir__f, "w");
  assert.equal(new Set(Object.values(keys).filter(Boolean)).size, Object.values(keys).filter(Boolean).length, "pas de touche en double");
});

test("Mon équipe : équipe présente dans tous les matchs", function () {
  assert.equal(guessMyTeam([{ home: "A", away: "B" }, { home: "C", away: "A" }]), "A");
  assert.equal(guessMyTeam([{ home: "A", away: "B" }]), "");
});
