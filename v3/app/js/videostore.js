/* Vidéos gardées sur l'appareil (stockage privé du navigateur, dossier « videos »).
   Même emplacement que l'appli actuelle : les vidéos déjà gardées sont retrouvées. */
import { pref, setPref } from "./state.js";

export const VS = { ok: !!(typeof navigator !== "undefined" && navigator.storage && navigator.storage.getDirectory && window.Worker && window.Blob), job: null };
export function vsMeta() { return pref("videos", {}); }
function setMeta(m) { setPref("videos", m); }
function dir() { return navigator.storage.getDirectory().then(function (r) { return r.getDirectoryHandle("videos", { create: true }); }); }

export function vsHas(id) { return !!vsMeta()[id]; }
export function vsGet(id) {
  const meta = vsMeta()[id];
  if (!VS.ok || !meta) return Promise.resolve(null);
  return dir().then(function (d) { return d.getFileHandle(id); }).then(function (h) { return h.getFile(); })
    .then(function (f) { return f && f.size === meta.size ? f : null; }, function () { return null; });
}
export function vsRemove(id) {
  const m = Object.assign({}, vsMeta());
  if (!m[id]) return Promise.resolve();
  delete m[id]; setMeta(m);
  if (!VS.ok) return Promise.resolve();
  return dir().then(function (d) { return d.removeEntry(id); }).catch(function () {});
}
export function vsTotal() { const m = vsMeta(); let n = 0; Object.keys(m).forEach(function (k) { n += m[k].size || 0; }); return n; }

const WORKER = "onmessage=async function(e){var id=e.data.id,file=e.data.file;try{var r=await navigator.storage.getDirectory();var d=await r.getDirectoryHandle('videos',{create:true});var fh=await d.getFileHandle(id,{create:true});var h=await fh.createSyncAccessHandle();h.truncate(0);var CH=8388608,off=0,last=0;while(off<file.size){var b=new Uint8Array(await file.slice(off,off+CH).arrayBuffer());var n=h.write(b,{at:off});if(n!==b.byteLength)throw new Error('write');off+=b.byteLength;if(off-last>=33554432||off>=file.size){last=off;postMessage({p:off/file.size});}}h.flush();h.close();postMessage({done:true});}catch(err){try{var r2=await navigator.storage.getDirectory();var d2=await r2.getDirectoryHandle('videos',{create:true});await d2.removeEntry(id);}catch(x){}postMessage({error:String(err&&err.name||err)});}};";

/* Copie la vidéo choisie sur l'appareil, en tâche de fond. cb(événement) : "progress" | "done" | "error" (message). */
export function vsSave(id, file, cb) {
  if (!VS.ok || VS.job || !file) return;
  const go = function () {
    let w;
    try { w = new Worker(URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }))); } catch (e) { VS.ok = false; return; }
    VS.job = { id: id, p: 0 }; cb("progress");
    w.onmessage = function (e) {
      const d = e.data || {};
      if (d.p != null) { VS.job.p = d.p; cb("progress"); return; }
      w.terminate(); VS.job = null;
      if (d.done) { const m = Object.assign({}, vsMeta()); m[id] = { name: file.name, size: file.size }; setMeta(m); cb("done"); }
      else if (/Security|NotAllowed|InvalidState|TypeError/i.test(d.error || "")) { VS.ok = false; cb("error", ""); }
      else cb("error", /Quota/i.test(d.error || "") ? "Plus assez de place pour garder cette vidéo sur l'appareil. Elle reste lisible pour cette séance." : "La vidéo n'a pas pu être gardée sur l'appareil. Elle reste lisible pour cette séance.");
    };
    w.onerror = function () { try { w.terminate(); } catch (e) {} VS.job = null; VS.ok = false; cb("error", ""); };
    w.postMessage({ id: id, file: file });
  };
  try { if (navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}
  if (navigator.storage.estimate) navigator.storage.estimate().then(function (est) {
    if (est && est.quota && est.quota - (est.usage || 0) < file.size + 50 * 1024 * 1024) cb("error", "Plus assez de place pour garder cette vidéo sur l'appareil. Libère la vidéo d'un ancien match dans Mes projets.");
    else go();
  }, go); else go();
}
