/* Synchronisation en ligne (Supabase), facultative et DÉSACTIVÉE par défaut.
   Elle ne démarre que si tu te connectes dans Réglages → Synchro. Même table que l'appli actuelle (carnet_docs). */
import { S, pref, setPref } from "./state.js";
import { putDoc } from "./store.js";

export const SYNC_DEFAULT = { url: "https://ywsxfikvjaxlwtzpogck.supabase.co", key: "sb_publishable_hgZrsWt9l1R2LaE78y_vaQ_7oykggbZ" };
export const Y = { cfg: null, state: "off", dirty: {}, timer: 0, flushing: false, sizes: null, onState: null, onPulled: null, onLost: null };

function setState(s) { Y.state = s; if (Y.onState) Y.onState(s); }
export function syncOn() { return !!(Y.cfg && Y.cfg.refresh); }

function auth(grant, body, cfg) {
  return fetch(cfg.url + "/auth/v1/token?grant_type=" + grant, { method: "POST", headers: { apikey: cfg.key, "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.access_token) throw { code: r.status >= 500 ? "unavailable" : "auth", message: j.error_description || j.msg || j.message || "Connexion refusée." };
        return j;
      });
    }, function () { throw { code: "unavailable", message: "Pas de réseau, ou adresse du projet incorrecte." }; });
}
function token() {
  const c = Y.cfg; if (!c) return Promise.reject({ code: "auth" });
  if (c.access && Date.now() < c.exp - 60000) return Promise.resolve(c.access);
  if (!c.refreshing) {
    c.refreshing = auth("refresh_token", { refresh_token: c.refresh }, c).then(function (j) {
      c.access = j.access_token; c.refresh = j.refresh_token || c.refresh; c.exp = Date.now() + (j.expires_in || 3600) * 1000;
      c.refreshing = null; saveCfg(); return c.access;
    }, function (e) { c.refreshing = null; throw e; });
  }
  return c.refreshing;
}
function api(path, opts) {
  return token().then(function (tok) {
    opts = opts || {};
    const h = { apikey: Y.cfg.key, Authorization: "Bearer " + tok, "Content-Type": "application/json" };
    Object.keys(opts.headers || {}).forEach(function (k) { h[k] = opts.headers[k]; });
    opts.headers = h;
    return fetch(Y.cfg.url + "/rest/v1/" + path, opts).then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) throw { code: (r.status >= 500 || r.status === 429) ? "unavailable" : (r.status === 401 ? "auth" : "invalid_argument"), message: t };
        return t ? JSON.parse(t) : null;
      });
    }, function () { throw { code: "unavailable" }; });
  });
}
function saveCfg() { const c = Y.cfg; setPref("sync", c ? { url: c.url, key: c.key, email: c.email, refresh: c.refresh } : null); }
function lost(e) {
  if (e && e.code === "auth") { Y.cfg = null; saveCfg(); setState("off"); if (Y.onLost) Y.onLost("Synchronisation arrêtée : reconnecte-toi dans Réglages."); }
  if (e && e.code === "invalid_argument" && Y.onLost) Y.onLost("La base en ligne a refusé l'enregistrement. Vérifie que la table a bien été créée.");
  throw e;
}
function size(o) { try { return new Blob([JSON.stringify(o)]).size; } catch (e) { return 0; } }

export function markDirty(id) {
  if (!syncOn()) return;
  Y.dirty[id] = true; setState("syncing");
  clearTimeout(Y.timer); Y.timer = setTimeout(flushSync, 1500);
}
export function flushSync() {
  if (!syncOn() || Y.flushing) return;
  const ids = Object.keys(Y.dirty);
  if (!ids.length) { setState("synced"); return; }
  Y.flushing = true;
  const rows = [], stamps = {};
  ids.forEach(function (id) { const d = S.docs[id]; if (!d) { delete Y.dirty[id]; return; } stamps[id] = d.updatedAt; rows.push({ id: id, body: d, updated_at: Number(d.updatedAt) || Date.now() }); });
  api("carnet_docs?on_conflict=user_id,id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) })
    .catch(lost)
    .then(function () {
      rows.forEach(function (r) { if (S.docs[r.id] && S.docs[r.id].updatedAt === stamps[r.id]) delete Y.dirty[r.id]; if (!Y.sizes) Y.sizes = {}; Y.sizes[r.id] = size(r.body); });
      Y.flushing = false;
      if (Object.keys(Y.dirty).length) flushSync(); else setState("synced");
    }, function (e) {
      Y.flushing = false;
      if (e && e.code === "unavailable") { setState("error"); clearTimeout(Y.timer); Y.timer = setTimeout(flushSync, 20000); }
    });
}
export function pull() {
  if (!syncOn()) return Promise.resolve();
  return api("carnet_docs?select=id,body").catch(lost).then(function (list) {
    let changed = false; const seen = {};
    Y.sizes = {};
    (list || []).forEach(function (r) {
      const b = r.body; if (!b || typeof b !== "object") return;
      seen[r.id] = true; Y.sizes[r.id] = size(b);
      const l = S.docs[r.id], ru = Number(b.updatedAt) || 0;
      if (!l || ru > (Number(l.updatedAt) || 0)) { const d = JSON.parse(JSON.stringify(b)); d.id = r.id; S.docs[r.id] = d; putDoc(d); changed = true; }
      else if ((Number(l.updatedAt) || 0) > ru) Y.dirty[r.id] = true;
    });
    Object.keys(S.docs).forEach(function (id) { if (!seen[id]) Y.dirty[id] = true; });
    if (changed && Y.onPulled) Y.onPulled();
    if (Object.keys(Y.dirty).length) { setState("syncing"); flushSync(); } else setState("synced");
  }, function () { setState("error"); });
}
export function signIn(url, key, email, password) {
  const cfg = { url: url, key: key, email: email };
  return auth("password", { email: email, password: password }, cfg).then(function (j) {
    cfg.access = j.access_token; cfg.refresh = j.refresh_token; cfg.exp = Date.now() + (j.expires_in || 3600) * 1000;
    Y.cfg = cfg; saveCfg(); return pull();
  });
}
export function signOut() { Y.cfg = null; Y.dirty = {}; Y.sizes = null; saveCfg(); setState("off"); }
export function initSync() {
  const c = pref("sync", null);
  if (c && c.url && c.key && c.refresh) { Y.cfg = c; pull(); } else setState("off");
}
export function syncLabel() {
  return { off: "Synchro désactivée", syncing: "Synchro en cours", synced: "Synchronisé en ligne", error: "Synchro en attente du réseau" }[Y.state] || "";
}
