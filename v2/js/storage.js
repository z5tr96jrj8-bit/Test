/* RL Analysis v2 : enregistrement des données dans IndexedDB.

   Pourquoi : la v1 écrivait TOUT dans le localStorage (limite d'environ 5 Mo) à chaque modification,
   et une erreur d'écriture passait inaperçue (risque de perdre un codage sans le savoir).
   Ici :
   - chaque match / projet / panel est un enregistrement séparé ; seuls ceux qui ont changé sont réécrits ;
   - l'écriture est groupée (250 ms) et forcée quand l'app passe en arrière-plan ou se ferme ;
   - une erreur d'écriture est signalée à l'écran ;
   - les données de la v2 sont séparées de celles de la v1 (base « rl-analysis » au lieu de « carnet-de-tags.v1 »).

   Ce fichier charge d'abord les données, puis lance l'application (js/app.js). */
(function () {
  "use strict";
  var DB_NAME = "rl-analysis", STORE = "docs";
  var db = null, lastSaved = {}, timer = 0, writing = null, errorCb = null, pendingAll = null;

  function open() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: "id" }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function readAll() {
    return new Promise(function (resolve, reject) {
      var r = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      r.onsuccess = function () { resolve(r.result || []); };
      r.onerror = function () { reject(r.error); };
    });
  }

  /* Écrit les documents modifiés depuis la dernière écriture, et supprime ceux qui ont disparu. */
  function flush() {
    clearTimeout(timer);
    if (!db || !pendingAll) return Promise.resolve();
    if (writing) return writing.then(flush);
    var all = pendingAll, puts = [], dels = [], seen = {};
    Object.keys(all).forEach(function (id) {
      var d = all[id]; if (!d || typeof d !== "object") return;
      seen[id] = true;
      var s;
      try { s = JSON.stringify(d); } catch (e) { return; }
      if (lastSaved[id] !== s) puts.push([id, s]);
    });
    Object.keys(lastSaved).forEach(function (id) { if (!seen[id]) dels.push(id); });
    if (!puts.length && !dels.length) return Promise.resolve();
    writing = new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, "readwrite"), st = tx.objectStore(STORE);
      puts.forEach(function (p) { var o = JSON.parse(p[1]); o.id = p[0]; st.put(o); });
      dels.forEach(function (id) { st.delete(id); });
      tx.oncomplete = function () {
        puts.forEach(function (p) { lastSaved[p[0]] = p[1]; });
        dels.forEach(function (id) { delete lastSaved[id]; });
        resolve();
      };
      tx.onerror = tx.onabort = function () { reject(tx.error || new Error("write")); };
    }).then(function () { writing = null; }, function (err) {
      writing = null;
      if (errorCb) errorCb(err);
      timer = setTimeout(flush, 5000); // nouvel essai
      throw err;
    });
    return writing;
  }

  window.RL2 = {
    data: {},
    /** À appeler après chaque modification (remplace localStorage.setItem de la v1). */
    save: function (all) { pendingAll = all; clearTimeout(timer); timer = setTimeout(function () { flush().catch(function () {}); }, 250); },
    flush: function () { return flush(); },
    onError: function (cb) { errorCb = cb; },
    /** Place occupée par les données de codage (octets). */
    bytes: function () { var n = 0; Object.keys(lastSaved).forEach(function (k) { n += lastSaved[k].length; }); return n; },
    ok: false
  };

  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush().catch(function () {}); });
  window.addEventListener("pagehide", function () { flush().catch(function () {}); });

  function start() {
    var s = document.createElement("script");
    s.src = "js/app.js";
    document.body.appendChild(s);
    if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  open().then(function (d) { db = d; return readAll(); }).then(function (list) {
    list.forEach(function (doc) { if (doc && doc.id) { window.RL2.data[doc.id] = doc; lastSaved[doc.id] = JSON.stringify(doc); } });
    window.RL2.ok = true;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) { /* rien */ }
    start();
  }, function () {
    // Navigation privée ou stockage bloqué : l'app fonctionne quand même, avec un avertissement.
    start();
    setTimeout(function () { alert("Ce navigateur ne peut pas enregistrer de données (navigation privée ?). Tes tags ne seront pas gardés."); }, 500);
  });
})();
