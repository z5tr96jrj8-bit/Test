/* État de l'application + enregistrement automatique + annuler/rétablir.
   - Tous les documents sont en mémoire (Map id -> doc).
   - Chaque modification passe par store.mutate() : copie pour l'annulation, horodatage,
     écriture groupée (60 ms) du SEUL document modifié, puis notification des écrans abonnés. */

import { db } from "./db.js";
import { clone } from "./util.js";

const docs = new Map();
const dirty = new Set();
const removed = new Set();
const listeners = new Map();
let flushTimer = 0;
let flushing = null;
let lastError = null;

const undoStack = [];
const redoStack = [];
const HISTORY_MAX = 100;

function emit(type, detail) {
  (listeners.get(type) || []).forEach((fn) => { try { fn(detail); } catch (e) { console.error(e); } });
  (listeners.get("*") || []).forEach((fn) => { try { fn(type, detail); } catch (e) { console.error(e); } });
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 60);
}

/** Écrit les documents modifiés. Une erreur est signalée à l'écran, jamais ignorée. */
function flush() {
  clearTimeout(flushTimer);
  if (flushing) return flushing.then(flush);
  if (!dirty.size && !removed.size) return Promise.resolve();
  const ids = [...dirty]; dirty.clear();
  const gone = [...removed]; removed.clear();
  const batch = ids.map((id) => docs.get(id)).filter(Boolean);
  emit("save", { state: "saving" });
  flushing = db.putMany(batch)
    .then(() => (gone.length ? db.remove(gone) : null))
    .then(() => {
      batch.filter((d) => d.kind === "match").forEach((d) => db.backup(d).catch(() => {}));
      lastError = null; flushing = null;
      emit("save", { state: "saved" });
    }, (err) => {
      ids.forEach((id) => dirty.add(id)); gone.forEach((id) => removed.add(id));
      lastError = err; flushing = null;
      emit("save", { state: "error", error: err });
      flushTimer = setTimeout(flush, 5000); // nouvel essai
    });
  return flushing;
}

export const store = {
  load() {
    return db.all().then((list) => { list.forEach((d) => docs.set(d.id, d)); db.persist(); });
  },
  get: (id) => docs.get(id) || null,
  all: (kind) => [...docs.values()].filter((d) => d.kind === kind),
  on(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); return () => store.off(type, fn); },
  off(type, fn) { const l = listeners.get(type); if (l) listeners.set(type, l.filter((f) => f !== fn)); },
  emit,

  /** Ajoute ou remplace un document entier (création, import). */
  put(doc, evt) {
    doc.updatedAt = Date.now();
    docs.set(doc.id, doc); dirty.add(doc.id); removed.delete(doc.id);
    scheduleFlush();
    emit(evt || "doc", { id: doc.id, kind: doc.kind });
  },

  /**
   * Modifie un document avec possibilité d'annuler.
   * @param id      document modifié
   * @param label   texte affiché dans « Undo … »
   * @param fn      fonction qui modifie doc ; peut renvoyer un événement { type, ... }
   * @param opts    { history: false } pour les petites modifications sans annulation (note en cours de frappe)
   */
  mutate(id, label, fn, opts) {
    const doc = docs.get(id); if (!doc) return null;
    const before = opts && opts.history === false ? null : JSON.stringify(doc);
    const evt = fn(doc) || { type: "doc" };
    if (evt === false) return null; // rien n'a changé
    doc.updatedAt = Date.now();
    dirty.add(id); scheduleFlush();
    if (before) {
      undoStack.push({ id, label, before });
      if (undoStack.length > HISTORY_MAX) undoStack.shift();
      redoStack.length = 0;
      emit("history", store.historyState());
    }
    emit(evt.type, Object.assign({ id, kind: doc.kind }, evt));
    return evt;
  },

  remove(id, label) {
    const doc = docs.get(id); if (!doc) return;
    undoStack.push({ id, label, before: JSON.stringify(doc), wasRemoved: true });
    redoStack.length = 0;
    docs.delete(id); dirty.delete(id); removed.add(id); scheduleFlush();
    emit("history", store.historyState());
    emit("remove", { id, kind: doc.kind });
  },

  undo() { return swap(undoStack, redoStack); },
  redo() { return swap(redoStack, undoStack); },
  historyState: () => ({
    canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
    undoLabel: undoStack.length ? undoStack[undoStack.length - 1].label : "",
    redoLabel: redoStack.length ? redoStack[redoStack.length - 1].label : ""
  }),
  flush,
  pending: () => dirty.size > 0 || !!flushing,
  lastError: () => lastError,
  estimateBytes() { let n = 0; docs.forEach((d) => { n += JSON.stringify(d).length; }); return n; }
};

/* Annuler et rétablir échangent l'état courant d'un document avec l'état mémorisé. */
function swap(from, to) {
  const step = from.pop(); if (!step) return null;
  const now = docs.get(step.id);
  to.push({ id: step.id, label: step.label, before: now ? JSON.stringify(now) : null, wasRemoved: !now });
  if (step.before == null) { docs.delete(step.id); removed.add(step.id); }
  else { const d = JSON.parse(step.before); docs.set(d.id, d); dirty.add(d.id); removed.delete(d.id); }
  scheduleFlush();
  emit("history", store.historyState());
  emit("restore", { id: step.id });
  return step;
}

/* On écrit tout de suite si l'utilisateur quitte ou met l'app en arrière-plan (iPad). */
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
window.addEventListener("pagehide", () => flush());

export { clone };
