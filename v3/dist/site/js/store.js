/* Stockage sur l'appareil : IndexedDB (base « rl-analysis »).
   - docs : un document par match, projet, panel, bibliothèque de panels
   - kv   : réglages (raccourcis, séparateur CSV, zoom, synchro, vidéos gardées…)
   Écriture regroupée : chaque document modifié est réécrit au plus une fois toutes les 150 ms. */
import { parseImport } from "./legacy.js";

const DB_NAME = "rl-analysis", DB_VER = 1;
let db = null, memFallback = false;
const mem = { docs: {}, kv: {} };
const pending = {};
let pendingTimer = 0, flushPromise = null;
const writeListeners = [];

function req(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }

export function openStore() {
  return new Promise(function (resolve) {
    let r;
    try { r = indexedDB.open(DB_NAME, DB_VER); } catch (e) { memFallback = true; resolve(false); return; }
    r.onupgradeneeded = function () {
      const d = r.result;
      if (!d.objectStoreNames.contains("docs")) d.createObjectStore("docs", { keyPath: "id" });
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
    };
    r.onsuccess = function () { db = r.result; resolve(true); };
    r.onerror = function () { memFallback = true; resolve(false); };
    r.onblocked = function () { memFallback = true; resolve(false); };
  });
}
export function storeKind() { return memFallback ? "memory" : "indexeddb"; }

export function loadAllDocs() {
  if (memFallback) return Promise.resolve(Object.assign({}, mem.docs));
  return req(db.transaction("docs").objectStore("docs").getAll()).then(function (list) {
    const out = {}; list.forEach(function (d) { out[d.id] = d; }); return out;
  });
}
export function loadKV() {
  if (memFallback) return Promise.resolve(Object.assign({}, mem.kv));
  return new Promise(function (resolve, reject) {
    const out = {}, tx = db.transaction("kv"), st = tx.objectStore("kv");
    const c = st.openCursor();
    c.onsuccess = function () { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } };
    tx.oncomplete = function () { resolve(out); };
    tx.onerror = function () { reject(tx.error); };
  });
}

/* Écritures */
export function putDoc(doc) { pending["d:" + doc.id] = { type: "doc", doc: doc }; schedule(); }
export function removeDoc(id) { pending["d:" + id] = { type: "del", id: id }; schedule(); }
export function setKV(key, value) { pending["k:" + key] = { type: "kv", key: key, value: value }; schedule(); }
export function onWrite(fn) { writeListeners.push(fn); }

function schedule() { clearTimeout(pendingTimer); pendingTimer = setTimeout(flush, 150); }
export function flush() {
  clearTimeout(pendingTimer);
  const keys = Object.keys(pending);
  if (!keys.length) return flushPromise || Promise.resolve();
  const jobs = keys.map(function (k) { const j = pending[k]; delete pending[k]; return j; });
  if (memFallback) {
    jobs.forEach(function (j) {
      if (j.type === "doc") mem.docs[j.doc.id] = JSON.parse(JSON.stringify(j.doc));
      else if (j.type === "del") delete mem.docs[j.id];
      else mem.kv[j.key] = j.value;
    });
    writeListeners.forEach(function (f) { f(true); });
    return Promise.resolve();
  }
  const p = new Promise(function (resolve) {
    let tx;
    try { tx = db.transaction(["docs", "kv"], "readwrite"); } catch (e) { resolve(); return; }
    const docs = tx.objectStore("docs"), kv = tx.objectStore("kv");
    jobs.forEach(function (j) {
      try {
        if (j.type === "doc") docs.put(JSON.parse(JSON.stringify(j.doc)));
        else if (j.type === "del") docs.delete(j.id);
        else kv.put(JSON.parse(JSON.stringify(j.value === undefined ? null : j.value)), j.key);
      } catch (e) { /* document illisible : ignoré */ }
    });
    tx.oncomplete = function () { writeListeners.forEach(function (f) { f(true); }); resolve(); };
    tx.onerror = tx.onabort = function () { writeListeners.forEach(function (f) { f(false, tx.error); }); resolve(); };
  });
  flushPromise = p.then(function () { flushPromise = null; });
  return p;
}
export function hasPending() { return Object.keys(pending).length > 0; }

/* Taille approximative des données (octets) */
export function estimateDocsSize(docs) {
  let n = 0; Object.keys(docs).forEach(function (k) { try { n += JSON.stringify(docs[k]).length; } catch (e) {} }); return n;
}

/* Première ouverture : reprise des données de l'ancienne appli si elle tournait à la même adresse. */
export function readLegacyLocal() {
  try {
    const raw = localStorage.getItem("carnet-de-tags.v1");
    if (!raw) return null;
    const parsed = parseImport({ app: "carnet-de-tags", v: 1, all: JSON.parse(raw) });
    let videos = {}, prefs = {};
    try { videos = JSON.parse(localStorage.getItem("carnet-de-tags.videos") || "{}") || {}; } catch (e) {}
    try { prefs = JSON.parse(localStorage.getItem("carnet-de-tags.prefs") || "{}") || {}; } catch (e) {}
    return parsed ? { docs: parsed.docs, report: parsed.report, videos: videos, prefs: prefs } : null;
  } catch (e) { return null; }
}
