/* Vidéos gardées sur l'appareil (stockage privé du navigateur, OPFS) : plus besoin de rechoisir le fichier.
   Même dossier « videos » que la v1 : une vidéo déjà gardée par la v1 est réutilisée sans la copier une 2e fois.
   Rien n'est envoyé sur un serveur. */

import { store } from "../core/store.js";
import { readV1Videos } from "../core/migrate.js";

export const vaultOk = !!(navigator.storage && navigator.storage.getDirectory && window.Worker);
let job = null; // { id, p }

/* Écriture dans un Worker : Safari iPad n'autorise l'écriture rapide (createSyncAccessHandle) que là. */
const WORKER = `onmessage=async function(e){var id=e.data.id,file=e.data.file;try{var r=await navigator.storage.getDirectory();var d=await r.getDirectoryHandle('videos',{create:true});var fh=await d.getFileHandle(id,{create:true});var h=await fh.createSyncAccessHandle();h.truncate(0);var CH=8388608,off=0,last=0;while(off<file.size){var b=new Uint8Array(await file.slice(off,off+CH).arrayBuffer());var n=h.write(b,{at:off});if(n!==b.byteLength)throw new Error('write');off+=b.byteLength;if(off-last>=33554432||off>=file.size){last=off;postMessage({p:off/file.size});}}h.flush();h.close();postMessage({done:true});}catch(err){try{var r2=await navigator.storage.getDirectory();var d2=await r2.getDirectoryHandle('videos',{create:true});await d2.removeEntry(id);}catch(x){}postMessage({error:String(err&&err.name||err)});}};`;

function metaDoc() {
  let d = store.get("vault");
  if (!d) { d = { id: "vault", kind: "vault", files: {} }; store.put(d); }
  return d;
}
const dir = () => navigator.storage.getDirectory().then((r) => r.getDirectoryHandle("videos", { create: true }));

export const vault = {
  meta: (id) => metaDoc().files[id] || null,
  count: () => Object.keys(metaDoc().files).length,
  total: () => Object.values(metaDoc().files).reduce((n, f) => n + (f.size || 0), 0),
  job: () => job,

  /** Renvoie le fichier gardé pour ce match, ou null. */
  get(id) {
    const meta = vault.meta(id);
    if (!vaultOk || !meta) return Promise.resolve(null);
    return dir().then((d) => d.getFileHandle(id)).then((h) => h.getFile())
      .then((f) => (f && f.size === meta.size ? f : null), () => null);
  },

  /** Copie la vidéo sur l'appareil, en arrière-plan. onDone(ok, message) */
  save(id, file, onProgress, onDone) {
    if (!vaultOk || job || !file) return;
    const go = () => {
      let w;
      try { w = new Worker(URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }))); } catch (e) { onDone && onDone(false, "unavailable"); return; }
      job = { id, p: 0 }; onProgress && onProgress(job);
      w.onmessage = (e) => {
        const d = e.data || {};
        if (d.p != null) { job.p = d.p; onProgress && onProgress(job); return; }
        w.terminate(); job = null;
        if (d.done) {
          store.mutate("vault", "", (v) => { v.files[id] = { name: file.name, size: file.size }; }, { history: false });
          onDone && onDone(true);
        } else onDone && onDone(false, /Quota/i.test(d.error || "") ? "quota" : "error");
        onProgress && onProgress(null);
      };
      w.onerror = () => { try { w.terminate(); } catch (e) { /* rien */ } job = null; onProgress && onProgress(null); onDone && onDone(false, "error"); };
      w.postMessage({ id, file });
    };
    if (navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        if (est && est.quota && est.quota - (est.usage || 0) < file.size + 50 * 1024 * 1024) onDone && onDone(false, "quota");
        else go();
      }, go);
    } else go();
  },

  remove(id) {
    if (!vault.meta(id)) return Promise.resolve();
    store.mutate("vault", "", (v) => { delete v.files[id]; }, { history: false });
    return vaultOk ? dir().then((d) => d.removeEntry(id)).catch(() => {}) : Promise.resolve();
  },

  /** Reprend les vidéos que la v1 a déjà gardées pour ces matchs (après un import). */
  adoptV1(matchIds) {
    const v1 = readV1Videos();
    const add = matchIds.filter((id) => v1[id] && !vault.meta(id));
    if (!add.length) return;
    store.mutate("vault", "", (v) => { add.forEach((id) => { v.files[id] = { name: v1[id].name, size: v1[id].size }; }); }, { history: false });
  }
};
