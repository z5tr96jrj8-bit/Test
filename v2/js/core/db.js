/* Stockage IndexedDB : un enregistrement par document (match, projet, panels, préférences…).
   Remplace le localStorage de la v1 (limite d'environ 5 Mo, tout réécrit à chaque modification). */

const DB_NAME = "rl-analysis-v2";
const DB_VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("backups")) db.createObjectStore("backups", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("abort"));
  }));
}

function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export const db = {
  all: () => tx("docs", "readonly", (s) => reqP(s.getAll())),
  /** Écrit plusieurs documents dans une seule transaction. */
  putMany: (docs) => tx("docs", "readwrite", (s) => { docs.forEach((d) => s.put(d)); }),
  remove: (ids) => tx("docs", "readwrite", (s) => { ids.forEach((id) => s.delete(id)); }),
  /** Copies de secours tournantes : on garde les 5 dernières versions de chaque match. */
  backup: (doc) => tx("backups", "readwrite", (s) => {
    const slot = Math.floor(Date.now() / 600000) % 5; // une case par tranche de 10 minutes
    s.put({ key: doc.id + "#" + slot, id: doc.id, at: Date.now(), doc });
  }),
  backupsOf: (id) => tx("backups", "readonly", (s) => reqP(s.getAll())).then((l) => l.filter((b) => b.id === id).sort((a, b) => b.at - a.at)),
  estimate: () => (navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null)),
  persist: () => { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* rien */ } }
};
