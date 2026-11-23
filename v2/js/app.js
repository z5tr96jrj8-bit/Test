(function () {
  "use strict";

  /* ============ Configuration : modifie ici tes événements ============ */
  /* v2 : aucun bouton pré-enregistré, le panel de départ est vierge. */
  var DEFAULT_EVENTS = [];
  var FLAG_EVENT = { id: "a_revoir", label: "À revoir", res: [], flag: true };
  var FAMS = ["#8FD3C8", "#E6B8F2", "#F2B6A8", "#F5D98B", "#B9C6F5", "#A9D5A0"];
  var DEF_PRE = 5, DEF_POST = 5;
  var THIRDS = ["Défensif", "Médian", "Offensif"];
  var LANES = ["Aile gauche", "Demi-espace gauche", "Axe", "Demi-espace droit", "Aile droite"];
  var PERIODS = [null,
    { name: "1re mi-temps", base: 0 },
    { name: "2e mi-temps", base: 45 },
    { name: "Prolongation 1", base: 90 },
    { name: "Prolongation 2", base: 105 }
  ];
  /* v2 : données dans IndexedDB (js/storage.js), réglages séparés de la v1 */
  var PREFS_KEY = "rl2.prefs";

  /* ============ État ============ */
  var matches = {};        // id -> match (ou { id, deleted, updatedAt })
  var currentMatchId = null;
  var activeTeam = "home";
  var currentTagId = null;
  var prefs = { sep: ";", tlZoom: 1, tlFold: false };
  var TL_MAX = 40;
  var undoState = null;
  var toastTimer = null;

  function $(id) { return document.getElementById(id); }
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  var panelCache = { stamp: null, list: null };
  function normEvents(arr) {
    var out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (e) {
      if (!e || typeof e.id !== "string" || typeof e.label !== "string" || !e.label.trim() || e.id === FLAG_EVENT.id) return;
      out.push({
        id: e.id.slice(0, 40), label: e.label.trim().slice(0, 30),
        grp: typeof e.grp === "string" ? e.grp.trim().slice(0, 24) : "",
        fam: /^#[0-9a-fA-F]{6}$/.test(e.fam || "") ? e.fam : FAMS[out.length % FAMS.length],
        res: (Array.isArray(e.res) ? e.res : []).filter(function (r) { return typeof r === "string" && r.trim(); }).slice(0, 4).map(function (r) { return r.trim().slice(0, 20); })
      });
    });
    return out.slice(0, 16);
  }
  function panelEvents() {
    var p = matches.panel;
    if (!p || p.deleted || !Array.isArray(p.events)) return DEFAULT_EVENTS;
    if (panelCache.stamp !== p.updatedAt || !panelCache.list) { panelCache = { stamp: p.updatedAt, list: normEvents(p.events) }; }
    return panelCache.list.length ? panelCache.list : DEFAULT_EVENTS;
  }
  function events() { return panelEvents().concat([FLAG_EVENT]); }

  /* Pupitre libre : chaque bouton a une place (colonne c, ligne r) et une taille (w, h) sur une grille de 12 colonnes. */
  var COLS = 48, ROW_H = 4, PAD_GAP = 2, MAX_ROW = 600;
  var C_HOME = "#24408A", C_AWAY = "#DC3C41", C_FLAG = "#EAB308";
  var PRESETS = [["#24408A", "Bleu"], ["#DC3C41", "Rouge"], ["#1F7A4D", "Vert"], ["#EAB308", "Jaune"], ["#E8730C", "Orange"], ["#7C3AED", "Violet"], ["#334155", "Gris"], ["#F1F5F9", "Blanc"]];
  var NAMED = { blue: "#24408A", red: "#DC3C41", white: "#F1F5F9", grey: "#334155", yellow: "#EAB308", green: "#1F7A4D" };
  function isHex(c) { return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c); }
  function teamColor(team) { return team === "away" ? C_AWAY : C_HOME; }
  function rgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
  function textOn(hex) { var c = rgb(hex); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 > 0.6 ? "#0A1020" : "#FFFFFF"; }
  function tint(hex, a) { var c = rgb(hex); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  var layoutCache = { stamp: null, list: null };
  var PATTERNS = [["none", "Uni"], ["vlines", "Lignes verticales"], ["hlines", "Lignes horizontales"], ["stripes", "Diagonales"], ["grid", "Quadrillage"], ["target", "Cercles"]];
  var PAT_OLD = { waves: "hlines", arcs: "stripes", dots: "grid" };
  function isPat(p) { for (var i = 0; i < PATTERNS.length; i++) if (PATTERNS[i][0] === p) return true; return false; }
  /* Motif dessiné par-dessus la couleur : clair sur fond foncé, sombre sur fond clair. */
  function patternCss(pat, base) {
    var light = textOn(base) === "#FFFFFF";
    var ink = light ? "rgba(255,255,255,.26)" : "rgba(0,0,0,.2)";
    if (pat === "vlines") return { image: "repeating-linear-gradient(90deg, " + ink + " 0, " + ink + " 1px, transparent 1px, transparent 7px)", size: "auto", repeat: "no-repeat", position: "0 0" };
    if (pat === "hlines") return { image: "repeating-linear-gradient(0deg, " + ink + " 0, " + ink + " 1px, transparent 1px, transparent 6px)", size: "auto", repeat: "no-repeat", position: "0 0" };
    if (pat === "target") {
      var ring = light ? "rgba(255,255,255,.8)" : "rgba(12,30,70,.88)";
      return { image: "repeating-radial-gradient(circle at 50% 50%, transparent 0, transparent 4px, " + ring + " 4px, " + ring + " 7px, transparent 7px, transparent 10px)", size: "auto", repeat: "no-repeat", position: "0 0" };
    }
    if (pat === "waves") {
      var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='36' height='14' viewBox='0 0 36 14'><path d='M0 7 Q9 -1 18 7 T36 7' fill='none' stroke='" + (light ? "white" : "black") + "' stroke-opacity='" + (light ? ".3" : ".22") + "' stroke-width='1.6'/></svg>";
      return { image: "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")", size: "36px 14px", repeat: "repeat", position: "0 0" };
    }
    if (pat === "arcs") return { image: "repeating-radial-gradient(circle at 0% 100%, transparent 0, transparent 11px, " + ink + " 11px, " + ink + " 13px)", size: "auto", repeat: "no-repeat", position: "0 0" };
    if (pat === "stripes") return { image: "repeating-linear-gradient(135deg, transparent 0, transparent 7px, " + ink + " 7px, " + ink + " 8px)", size: "auto", repeat: "no-repeat", position: "0 0" };
    if (pat === "dots") return { image: "radial-gradient(circle, " + ink + " 1.6px, transparent 2px)", size: "10px 10px", repeat: "repeat", position: "0 0" };
    if (pat === "grid") return { image: "linear-gradient(" + ink + " 1px, transparent 1px), linear-gradient(90deg, " + ink + " 1px, transparent 1px)", size: "12px 12px", repeat: "repeat", position: "-1px -1px" };
    return { image: "none", size: "auto", repeat: "repeat", position: "0 0" };
  }
  function borderCss(bd, bw) { var w = bw || (bd ? 2 : 0); return w ? w + "px solid " + (bd || "rgba(255,255,255,.28)") : ""; }
  function paint(node, color, pat, bd, bw) {
    var p = patternCss(pat || "none", color);
    if (bd !== undefined) { node.style.border = borderCss(bd, bw); }
    node.dataset.pat = pat || "none"; node.style.setProperty("--pb-bg", color);
    node.style.backgroundColor = color;
    node.style.backgroundImage = p.image;
    node.style.backgroundSize = p.size;
    node.style.backgroundRepeat = p.repeat;
    node.style.backgroundPosition = p.position;
    node.style.color = textOn(color);
  }
  function headItems() {
    return [
      { id: "head_off", type: "label", label: "Offensive", color: "#3B6FE0", pat: "none", c: 0, r: 0, w: 6, h: 1 },
      { id: "head_def", type: "label", label: "Défensive", color: C_AWAY, pat: "none", c: 6, r: 0, w: 6, h: 1 }
    ];
  }
  /* Grille fine : les anciens pupitres (12 colonnes, lignes de 32 px) sont convertis en 24 colonnes et demi-lignes. */
  function scaleItems(list) { list.forEach(function (it) { it.c *= 2; it.w *= 2; it.r *= 2; it.h *= 2; }); return list; }
  function toV4(list) { list.forEach(function (it) { it.c *= 2; it.w *= 2; it.r *= 3; it.h *= 3; }); return list; }
  function defaultLayout(evs) {
    var out = [], r = 0, last = null; /* v2 : pas de titres imposés */
    evs.forEach(function (e) {
      var g = e.grp || "";
      if (g !== last) { last = g; if (g) { out.push({ id: "l_" + r, type: "label", label: g, c: 0, r: r, w: 12, h: 1 }); r++; } }
      out.push({ id: e.id + "__h", type: "button", key: e.id, label: e.label, team: "home", color: C_HOME, res: e.res.slice(), c: 0, r: r, w: 6, h: 1 });
      out.push({ id: e.id + "__a", type: "button", key: e.id, label: e.label, team: "away", color: C_AWAY, res: e.res.slice(), c: 6, r: r, w: 6, h: 1 });
      r++;
    });
    /* v2 : pas de bouton « À revoir » imposé */
    return toV4(scaleItems(out));
  }
  function clampInt(v, lo, hi, d) { v = Math.round(Number(v)); if (!isFinite(v)) v = d; return Math.min(hi, Math.max(lo, v)); }
  function normLayout(arr) {
    var out = [], ids = {};
    (Array.isArray(arr) ? arr : []).slice(0, 80).forEach(function (b) {
      if (!b || typeof b !== "object" || typeof b.label !== "string") return;
      var id = typeof b.id === "string" && b.id && !ids[b.id] ? b.id.slice(0, 48) : uid("b");
      ids[id] = true;
      var w = clampInt(b.w, 1, COLS, 6), c = clampInt(b.c, 0, COLS - 1, 0);
      if (c + w > COLS) c = COLS - w;
      var it = { id: id, type: b.type === "label" ? "label" : "button", label: b.label.slice(0, 30), c: c, r: clampInt(b.r, 0, MAX_ROW, 0), w: w, h: clampInt(b.h, 1, 200, 1) };
      it.bw = clampInt(b.bw, 0, 8, 0);
      it.dur = "";
      it.pre = typeof b.pre === "number" ? clampInt(b.pre, 0, 60, DEF_PRE) : null;
      it.post = typeof b.post === "number" ? clampInt(b.post, 0, 60, DEF_POST) : null;
      it.pat = isPat(b.pat) ? b.pat : (PAT_OLD[b.pat] || "none");
      it.bd = isHex(b.bd) ? b.bd.toUpperCase() : "";
      if (it.type === "label") it.color = isHex(b.color) ? b.color.toUpperCase() : "";
      if (it.type === "button") {
        it.key = typeof b.key === "string" && b.key ? b.key.slice(0, 48) : id;
        it.team = b.team === "away" ? "away" : "home";
        it.flag = it.key === FLAG_EVENT.id;
        it.color = isHex(b.color) ? b.color.toUpperCase() : (NAMED[b.color] || (it.flag ? C_FLAG : teamColor(it.team)));
        it.res = (Array.isArray(b.res) ? b.res : []).filter(function (x) { return typeof x === "string" && x.trim(); }).slice(0, 4).map(function (x) { return x.trim().slice(0, 20); });
      }
      out.push(it);
    });
    return out;
  }
  function layout() {
    var p = matches.panel;
    var stamp = p && !p.deleted ? "p" + p.updatedAt : "default";
    if (layoutCache.stamp === stamp && layoutCache.list) return layoutCache.list;
    var list = p && !p.deleted && Array.isArray(p.buttons) ? normLayout(p.buttons) : [];
    if (list.length && p.v !== 4) {
      if (p.v !== 3) {
      if (!(p.h >= 1)) {
        /* Ancien pupitre enregistré : on ajoute les deux en-têtes en haut et on décale le reste d'une ligne. */
        list.forEach(function (it) { it.r = it.r + 1; });
        list = headItems().concat(list);
      }
      scaleItems(list);
      }
      toV4(list);
    }
    if (!list.length) list = defaultLayout(panelEvents());
    layoutCache = { stamp: stamp, list: list };
    return list;
  }
  function commitLayout() {
    var list = layout();
    var old = {}; ((matches.panel && matches.panel.buttons) || []).forEach(function (b) { old[b.id] = b.label; });
    list.forEach(function (b) {
      if (b.type !== "button" || !old[b.id] || old[b.id] === b.label) return;
      Object.keys(matches).forEach(function (k) {
        var m = matches[k]; if (!m || m.deleted || !Array.isArray(m.tags)) return;
        var hit = false;
        m.tags.forEach(function (t) { if (t.btn === b.id && (!t.lbl || t.lbl === old[b.id])) { t.lbl = b.label; hit = true; } });
        if (hit) m.updatedAt = Date.now();
      });
    });
    matches.panel = { id: "panel", kind: "panel", v: 4, h: 1, buttons: JSON.parse(JSON.stringify(list)), updatedAt: Date.now() };
    layoutCache = { stamp: "p" + matches.panel.updatedAt, list: list };
    saveLocal(); markDirty("panel");
  }
  function itemById(id) { var l = layout(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function evFind(id) {
    var l = layout();
    for (var i = 0; i < l.length; i++) if (l[i].type === "button" && l[i].key === id) return { id: id, label: l[i].label, res: l[i].res, flag: !!l[i].flag };
    if (id === FLAG_EVENT.id) return FLAG_EVENT;
    for (var j = 0; j < DEFAULT_EVENTS.length; j++) if (DEFAULT_EVENTS[j].id === id) return DEFAULT_EVENTS[j];
    return null;
  }
  function evDef(id) { return evFind(id) || { id: id, label: id, res: [] }; }
  /* v2 : le nom enregistré avec le tag est prioritaire (renommer un bouton met aussi à jour ce nom, voir commitLayout). */
  function tagLabel(t) { if (t.lbl) return t.lbl; if (t.btn) { var b = btnIndex().byId[t.btn]; if (b) return b.label; } var e = evFind(t.ev); return e ? e.label : t.ev; }
  function isFlag(t) { return t.ev === FLAG_EVENT.id; }
  function resFor(tag) {
    var lbl = tagLabel(tag), l = layout(), any = null;
    for (var i = 0; i < l.length; i++) {
      if (l[i].type !== "button" || l[i].label !== lbl) continue;
      if (l[i].team === tag.team) return l[i].res;
      if (!any) any = l[i];
    }
    return any ? any.res : evDef(tag.ev).res;
  }
  function allRows(m) {
    var rows = [], seen = {};
    layout().filter(function (b) { return b.type === "button"; }).sort(function (a, b) { return (a.r - b.r) || (a.c - b.c); }).forEach(function (b) {
      var r = seen["k:" + b.label];
      if (!r) { r = seen["k:" + b.label] = { id: b.label, label: b.label, flag: !!b.flag, res: [] }; rows.push(r); }
      b.res.forEach(function (x) { if (r.res.indexOf(x) < 0) r.res.push(x); });
    });
    m.tags.forEach(function (t) {
      var l = tagLabel(t);
      if (!seen["k:" + l]) { seen["k:" + l] = { id: l, label: l, flag: isFlag(t), res: [] }; rows.push(seen["k:" + l]); }
    });
    return rows;
  }
  /* v2 : boutons triés et index (id, libellé) calculés une seule fois par version du panel.
     La v1 retriait tous les boutons pour chaque tag à chaque affichage. */
  var pbCache = { key: null };
  function btnIndex() {
    var l = layout(), key = layoutCache.stamp + ":" + l.length;
    if (pbCache.key === key && pbCache.list === l) return pbCache;
    var out = l.filter(function (b) { return b.type === "button"; }).sort(function (a, b) { return (a.r - b.r) || (a.c - b.c); });
    var byId = {}, byLab = {};
    out.forEach(function (b) { byId[b.id] = b; var k = normLab(b.label); (byLab[k] = byLab[k] || []).push(b); });
    pbCache = { key: key, list: l, out: out, byId: byId, byLab: byLab };
    return pbCache;
  }
  function normLab(x) { return String(x || "").trim().toLowerCase(); }
  function padButtons() { return btnIndex().out; }
  /* v2 : un tag n'est rattaché au bouton de même identifiant que si le nom correspond.
     En v1, changer de panel affichait les tags sous le nom d'un autre bouton (ex. « OFF TRANSITION » devenait « Pressing »). */
  function tagButton(t) {
    var ix = btnIndex(), lbl = normLab(t.lbl);
    var b = t.btn ? ix.byId[t.btn] : null;
    if (b && (!t.lbl || normLab(b.label) === lbl)) return b;
    var same = ix.byLab[lbl || normLab(tagLabel(t))] || [];
    for (var i = 0; i < same.length; i++) if (same[i].flag || same[i].team === t.team) return same[i];
    return same.length === 1 ? same[0] : null;
  }
  function tagColor(t) { var b = tagButton(t); return b ? b.color : (isHex(t.col) ? t.col : (isFlag(t) ? C_FLAG : teamColor(t.team))); }
  function tlRows(m) {
    var rows = [], byBtn = {}, orphan = {};
    padButtons().forEach(function (b) { var r = { key: "b:" + b.id, label: b.label, color: b.color, team: b.flag ? "" : b.team, tags: [] }; byBtn[b.id] = r; rows.push(r); });
    m.tags.forEach(function (t) {
      var b = tagButton(t);
      if (b) { byBtn[b.id].tags.push(t); return; }
      var k = "k:" + tagLabel(t) + "|" + (isFlag(t) ? "" : t.team);
      if (!orphan[k]) { orphan[k] = { key: k, label: tagLabel(t), color: tagColor(t), team: isFlag(t) ? "" : t.team, tags: [] }; rows.push(orphan[k]); }
      orphan[k].tags.push(t);
    });
    return rows;
  }
  function pre(t) { return typeof t.d0 === "number" ? t.d0 : DEF_PRE; }
  function post(t) { return typeof t.d1 === "number" ? t.d1 : DEF_POST; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmt(sec) { sec = Math.max(0, Math.floor(sec)); return pad(Math.floor(sec / 60)) + ":" + pad(sec % 60); }
  function matchTime(p, t) { return (PERIODS[p] ? PERIODS[p].base : 0) * 60 + t; }
  function fmtLong(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 3600) + ":" + pad(Math.floor(sec / 60) % 60) + ":" + pad(sec % 60); }
  function teamName(m, team) { return team === "home" ? m.home : m.away; }
  var panelMode = false;
  var panelDummy = { id: "__panel", home: "Domicile", away: "Extérieur", date: "", comp: "", tags: [], lists: [], period: 1, phase: "pre", clock: { running: false, startedAt: 0, acc: 0 } };
  function cur() { if (panelMode) return panelDummy; var m = matches[currentMatchId]; return m && !m.deleted ? m : null; }

  /* ============ Stockage local ============ */
  function loadLocal() {
    matches = (window.RL2 && window.RL2.data) || {};
    try {
      var p = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (p && (p.sep === ";" || p.sep === ",")) prefs.sep = p.sep;
      if (p && typeof p.tlZoom === "number" && p.tlZoom >= 1 && p.tlZoom <= TL_MAX) prefs.tlZoom = p.tlZoom;
    } catch (e) {}
  }
  /* v2 : écriture groupée et différée des seuls documents modifiés ; une erreur est signalée. */
  function saveLocal() { if (window.RL2) window.RL2.save(matches); }
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} }

  function touch(m) {
    if (undoState) { undoState = null; clearTimeout(toastTimer); $("toast").hidden = true; }
    m.updatedAt = Date.now();
    saveLocal();
    markDirty(m.id);
  }

  /* ============ Sauvegarde sur le compte (facultative) ============ */
  var cloud = null;           // référence de collection privée, ou null
  var cloudState = "local";   // local | syncing | synced | error
  var dirty = {};
  var flushTimer = null;
  var flushing = false;

  function setCloudState(s) { cloudState = s; renderSync(); }
  function renderSync() {
    var txt = {
      local: "Enregistré sur cet appareil",
      syncing: "Sauvegarde en cours",
      synced: "Synchronisé en ligne",
      error: "Enregistré sur cet appareil, sauvegarde en attente"
    }[cloudState];
    $("sync-home").textContent = txt;
    var sl = $("sync-line"); if (sl) sl.textContent = sync && cloud ? txt : "Enregistré sur cet appareil.";
    var sb = $("btn-sync"); if (sb) { var son = !!(sync && cloud); sb.classList.toggle("on", son); sb.setAttribute("aria-label", son ? "Connexion et synchronisation (connecté)" : "Connexion et synchronisation (non connecté)"); }
    var prs = $("pr-sync"); if (prs) prs.textContent = txt;
  }
  function markDirty(id) {
    if (!cloud) return;
    dirty[id] = true;
    setCloudState("syncing");
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 1500);
  }
  function flush() {
    if (!cloud || flushing) return;
    var ids = Object.keys(dirty);
    if (!ids.length) { setCloudState("synced"); return; }
    flushing = true;
    var failed = false;
    var i = 0;
    function next() {
      if (i >= ids.length) {
        flushing = false;
        if (failed) { setCloudState("error"); clearTimeout(flushTimer); flushTimer = setTimeout(flush, 20000); }
        else if (Object.keys(dirty).length) { flush(); }
        else setCloudState("synced");
        return;
      }
      var id = ids[i++];
      var m = matches[id];
      if (!m) { delete dirty[id]; next(); return; }
      var stamp = m.updatedAt;
      var body;
      try { body = JSON.parse(JSON.stringify(m)); } catch (e) { delete dirty[id]; next(); return; }
      var p;
      try { p = cloud.doc(id).set(body); } catch (e) { delete dirty[id]; next(); return; }
      p.then(function () {
        if (matches[id] && matches[id].updatedAt === stamp) delete dirty[id];
        next();
      }, function (err) {
        var code = err && err.code;
        if (code === "unavailable" || code === "resource_exhausted") { failed = true; next(); }
        else { cloud = null; dirty = {}; flushing = false; setCloudState("local"); }
      });
    }
    next();
  }
  function pull() {
    if (!cloud) return Promise.resolve();
    return cloud.limit(500).get().then(function (snap) {
      var changed = false;
      var seen = {};
      snap.docs.forEach(function (d) {
        var r = d.data();
        if (!r || typeof r !== "object") return;
        seen[d.id] = true;
        var l = matches[d.id];
        var ru = Number(r.updatedAt) || 0;
        if (!l || ru > (Number(l.updatedAt) || 0)) {
          matches[d.id] = JSON.parse(JSON.stringify(r));
          matches[d.id].id = d.id;
          changed = true;
        } else if ((Number(l.updatedAt) || 0) > ru) {
          dirty[d.id] = true;
        }
      });
      Object.keys(matches).forEach(function (id) { if (!seen[id]) dirty[id] = true; });
      if (changed) { saveLocal(); if (currentMatchId && !cur()) { currentMatchId = null; } renderAll(); }
      if (Object.keys(dirty).length) { setCloudState("syncing"); flush(); } else setCloudState("synced");
    }, function () { setCloudState("error"); });
  }
  function initCloud() {
    if (!window.claude || typeof window.claude.use !== "function") return;
    Promise.all([window.claude.use("db"), window.claude.use("user")]).then(function (r) {
      var db = r[0], user = r[1];
      if (!db || !user) return null;
      return user.id().then(function (id) {
        if (!id) return;
        cloud = db.collection("data/users/" + id);
        return pull();
      });
    }).catch(function () { cloud = null; setCloudState("local"); });
  }

  /* ============ Chrono ============ */
  function elapsedMs(m) {
    var c = m.clock;
    return c.acc + (c.running ? Date.now() - c.startedAt : 0);
  }
  function periodSec(m) { return Math.max(0, Math.floor(elapsedMs(m) / 1000)); }
  function startClock(m) { if (!m.clock.running) { m.clock.running = true; m.clock.startedAt = Date.now(); } }
  function stopClock(m) { if (m.clock.running) { m.clock.acc = elapsedMs(m); m.clock.running = false; m.clock.startedAt = 0; } }

  var pendingUndo = null;
  function snapshot(m) { pendingUndo = { id: m.id, json: JSON.stringify(m) }; }
  function showToast(text, withUndo) {
    undoState = withUndo ? pendingUndo : null;
    pendingUndo = null;
    $("toast-text").textContent = text;
    $("toast-undo").hidden = !withUndo;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $("toast").hidden = true; undoState = null; }, 7000);
  }
  function undo() {
    if (!undoState) return;
    var restored = JSON.parse(undoState.json);
    matches[restored.id] = restored;
    touch(restored);
    renderAll();
  }

  function clockAction(action) {
    var m = cur(); if (!m) return;
    if (action === "kickoff") {
      m.period = 1; m.phase = "live"; m.clock = { running: false, startedAt: 0, acc: 0 }; startClock(m);
    } else if (action === "pause") {
      stopClock(m);
    } else if (action === "resume") {
      startClock(m);
    } else if (action === "end") {
      snapshot(m);
      stopClock(m);
      m.phase = (m.period === 1 || m.period === 3) ? "break" : "done";
      touch(m); renderMatch();
      showToast(m.phase === "break" ? "Période terminée." : "Match terminé.", true);
      return;
    } else if (action === "next") {
      m.period = Math.min(4, m.period + 1); m.phase = "live";
      m.clock = { running: false, startedAt: 0, acc: 0 }; startClock(m);
    } else if (action === "minus" || action === "plus") {
      var delta = action === "plus" ? 10000 : -10000;
      var now = elapsedMs(m);
      var target = Math.max(0, now + delta);
      if (m.clock.running) { m.clock.acc = target; m.clock.startedAt = Date.now(); }
      else m.clock.acc = target;
    }
    touch(m); renderMatch();
  }

  /* ============ Vidéo du match ============ */
  var vid = null;            // élément <video>
  var videoReady = false;    // un fichier est chargé pour le match ouvert
  var videoUrl = null;
  var lastPosSave = 0;

  function isVideo(m) { return m && m.mode === "video"; }
  function derive(m, v) {
    var k1 = m.video && m.video.k1 != null ? m.video.k1 : 0;
    var k2 = m.video ? m.video.k2 : null;
    if (k2 != null && v >= k2) return { p: 2, t: Math.floor(v - k2) };
    return { p: 1, t: Math.max(0, Math.floor(v - k1)) };
  }
  function recomputeTags(m) {
    m.tags.forEach(function (t) {
      if (t.v != null) { var d = derive(m, t.v); t.p = d.p; t.t = d.t; }
    });
  }
  function videoPos(m) { return videoReady ? (vid.currentTime || 0) : ((m.video && m.video.pos) || 0); }
  function unloadVideo() {
    if (recState) cancelRec("");
    if (vid) { vid.style.aspectRatio = ""; vid.style.width = ""; vid.style.height = ""; vid.style.maxHeight = ""; }
    play = null;
    videoReady = false;
    try { vid.pause(); vid.removeAttribute("src"); vid.load(); } catch (e) {}
    if (videoUrl) { try { URL.revokeObjectURL(videoUrl); } catch (e) {} videoUrl = null; }
    $("video-msg").hidden = true;
  }
  /* ============ Vidéos gardées sur l'appareil (stockage privé du site) ============ */
  var VS_KEY = "carnet-de-tags.videos";
  var vsMeta = {};   // id du match -> { name, size }
  try { vsMeta = JSON.parse(localStorage.getItem(VS_KEY) || "{}") || {}; } catch (e) { vsMeta = {}; }
  function vsSaveMeta() { try { localStorage.setItem(VS_KEY, JSON.stringify(vsMeta)); } catch (e) {} }
  var vsOk = !!(navigator.storage && navigator.storage.getDirectory && window.Worker && window.Blob);
  var vsJob = null;     // { id, p } enregistrement en cours
  var vsLoading = null; // id du match dont on relit la vidéo
  function vsDir() { return navigator.storage.getDirectory().then(function (r) { return r.getDirectoryHandle("videos", { create: true }); }); }
  function vsGet(id) {
    var meta = vsMeta[id]; if (!vsOk || !meta) return Promise.resolve(null);
    return vsDir().then(function (d) { return d.getFileHandle(id); }).then(function (h) { return h.getFile(); })
      .then(function (f) { return f && f.size === meta.size ? f : null; }, function () { return null; });
  }
  function vsRemove(id) {
    if (!vsMeta[id]) return Promise.resolve();
    delete vsMeta[id]; vsSaveMeta();
    if (!vsOk) return Promise.resolve();
    return vsDir().then(function (d) { return d.removeEntry(id); }).catch(function () {});
  }
  var VS_WORKER = "onmessage=async function(e){var id=e.data.id,file=e.data.file;try{var r=await navigator.storage.getDirectory();var d=await r.getDirectoryHandle('videos',{create:true});var fh=await d.getFileHandle(id,{create:true});var h=await fh.createSyncAccessHandle();h.truncate(0);var CH=8388608,off=0,last=0;while(off<file.size){var b=new Uint8Array(await file.slice(off,off+CH).arrayBuffer());var n=h.write(b,{at:off});if(n!==b.byteLength)throw new Error('write');off+=b.byteLength;if(off-last>=33554432||off>=file.size){last=off;postMessage({p:off/file.size});}}h.flush();h.close();postMessage({done:true});}catch(err){try{var r2=await navigator.storage.getDirectory();var d2=await r2.getDirectoryHandle('videos',{create:true});await d2.removeEntry(id);}catch(x){}postMessage({error:String(err&&err.name||err)});}};";
  function vsSave(m, file) {
    if (!vsOk || vsJob || !file) return;
    var id = m.id;
    var go = function () {
      var w;
      try { w = new Worker(URL.createObjectURL(new Blob([VS_WORKER], { type: "text/javascript" }))); } catch (e) { vsOk = false; return; }
      vsJob = { id: id, p: 0 }; renderVsBadge();
      w.onmessage = function (e) {
        var d = e.data || {};
        if (d.p != null) { vsJob.p = d.p; renderVsBadge(); return; }
        w.terminate(); vsJob = null;
        if (d.done) { vsMeta[id] = { name: file.name, size: file.size }; vsSaveMeta(); showToast("Vidéo gardée sur cet appareil : tu n'auras plus à la rechoisir.", false); }
        else if (/Security|NotAllowed|InvalidState|TypeError/i.test(d.error || "")) vsOk = false;
        else showToast(/Quota/i.test(d.error || "") ? "Plus assez de place pour garder cette vidéo sur l'appareil. Elle reste lisible pour cette séance." : "La vidéo n'a pas pu être gardée sur l'appareil. Elle reste lisible pour cette séance.", false);
        renderVsBadge(); if (!$("view-home").hidden) renderHome();
      };
      w.onerror = function () { try { w.terminate(); } catch (e) {} vsJob = null; vsOk = false; renderVsBadge(); };
      w.postMessage({ id: id, file: file });
    };
    try { if (navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}
    if (navigator.storage.estimate) navigator.storage.estimate().then(function (est) {
      if (est && est.quota && est.quota - (est.usage || 0) < file.size + 50 * 1024 * 1024) showToast("Plus assez de place pour garder cette vidéo sur l'appareil. Libère la vidéo d'un ancien match dans Mes projets.", false);
      else go();
    }, go); else go();
  }
  function renderVsBadge() {
    var b = $("vs-badge"); if (!b) return;
    var m = cur();
    if (vsJob && m && vsJob.id === m.id) { b.hidden = false; b.textContent = "Enregistrement de la vidéo sur l'appareil… " + Math.round(vsJob.p * 100) + " %"; }
    else b.hidden = true;
  }
  function vsTryLoad(m) {
    if (!vsOk || !isVideo(m) || videoReady || !vsMeta[m.id]) return;
    vsLoading = m.id; renderMatch();
    vsGet(m.id).then(function (f) {
      var still = cur() && cur().id === m.id && !videoReady;
      vsLoading = null;
      if (!f) { if (vsMeta[m.id]) { delete vsMeta[m.id]; vsSaveMeta(); } if (still) renderMatch(); return; }
      if (still) loadVideoFile(f, true); 
    });
  }
  function vsTotal() { var n = 0; Object.keys(vsMeta).forEach(function (k) { n += vsMeta[k].size || 0; }); return n; }
  function loadVideoFile(file, fromStore) {
    var m = cur(); if (!m || !file) return;
    unloadVideo();
    if (!isVideo(m)) { m.mode = "video"; }
    if (!m.video) m.video = { name: "", pos: 0, k1: null, k2: null };
    if (m.video.name && m.video.name !== file.name) m.video.pos = 0;
    m.video.name = file.name;
    if (!fromStore) { var sm = vsMeta[m.id]; if (!sm || sm.size !== file.size || sm.name !== file.name) { if (sm) vsRemove(m.id); vsSave(m, file); } }
    try {
      videoUrl = URL.createObjectURL(file);
      vid.src = videoUrl;
      vid.load();
    } catch (e) { videoError(); }
    touch(m);
    renderMatch();
  }
  function videoError() {
    videoReady = false;
    $("video-msg").textContent = "Cette vidéo ne peut pas être lue ici. Essaie avec un fichier MP4 enregistré dans l'appli Fichiers.";
    $("video-msg").hidden = false;
    renderMatch();
  }
  function savePos(force) {
    var m = cur(); if (!m || !isVideo(m) || !videoReady) return;
    var now = Date.now();
    if (!force && now - lastPosSave < 10000) return;
    lastPosSave = now;
    m.video.pos = Math.floor(vid.currentTime || 0);
    saveLocal();
  }
  function seekTo(sec) {
    if (!videoReady) return;
    var d = vid.duration;
    if (isFinite(d)) sec = Math.min(sec, Math.max(0, d - 0.2));
    try { vid.currentTime = Math.max(0, sec); } catch (e) {}
    renderClock();
  }
  var rate = 1;
  var RATES = [1, 1.5, 2, 0.5];
  var play = null;   // lecture de clips : { clips, i, waiting }
  function clipOf(m, t) {
    var p = tlPos(m, t); if (p == null) return null;
    return { start: Math.max(0, p - pre(t)), end: p + post(t), tagId: t.id };
  }
  function stopPlayback() { play = null; }
  function playClips(clips) {
    var m = cur(); if (!m || !videoReady) return;
    clips = clips.filter(function (c) { return !!c; });
    if (!clips.length) return;
    play = { clips: clips, i: 0, waiting: false };
    startClip();
  }
  function startClip() {
    var m = cur(); if (!m || !play) return;
    var c = play.clips[play.i];
    var st = play;
    st.waiting = true;
    setTimeout(function () { if (play === st) st.waiting = false; }, 1500);
    currentTagId = c.tagId; renderCurrent(m); renderLog(m);
    seekTo(c.start);
    var pr = vid.play(); if (pr && pr.catch) pr.catch(function () {});
  }
  function playTick() {
    if (!play || play.waiting || !videoReady || recState) return;
    var c = play.clips[play.i];
    if (vid.currentTime >= c.end - 0.05 || vid.ended) {
      play.i++;
      if (play.i < play.clips.length) startClip();
      else { play = null; vid.pause(); }
    }
  }

  /* ---- Export de clips en vidéo (enregistrement en temps réel) ---- */
  var recState = null;
  function pickMime() {
    var c = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    for (var i = 0; i < c.length; i++) { try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) {} }
    return "";
  }
  function recUnavailable() {
    showToast("L'export vidéo n'est pas disponible sur cet appareil. Utilise l'export CSV pour découper les clips dans Metrica.", false);
  }
  function exportClips(clips, baseName) {
    var m = cur(); if (!m || !videoReady || recState) return;
    clips = clips.filter(function (c) { return !!c; });
    if (!clips.length) return;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream || !downloads) { recUnavailable(); return; }
    stopPlayback(); vid.pause();
    var w = vid.videoWidth || 1280, h = vid.videoHeight || 720;
    var sc = Math.min(1, 1280 / w);
    w = Math.max(2, Math.round(w * sc / 2) * 2); h = Math.max(2, Math.round(h * sc / 2) * 2);
    var canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext("2d");
    var mime = pickMime(), rec;
    try {
      var stream = canvas.captureStream(30);
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 5000000 } : undefined);
    } catch (e) { recUnavailable(); return; }
    var chunks = [];
    var st = recState = { clips: clips, i: 0, rec: rec, ctx: ctx, w: w, h: h, cancelled: false, raf: 0, lastT: -1, lastMove: Date.now(),
      prevRate: vid.playbackRate, prevMuted: vid.muted, prevTime: vid.currentTime };
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      vid.pause();
      vid.playbackRate = st.prevRate; vid.muted = st.prevMuted;
      try { vid.currentTime = st.prevTime; } catch (e) {}
      recState = null;
      if (st.cancelled) { $("rec-overlay").hidden = true; return; }
      if (!chunks.length) { $("rec-msg").textContent = "L'enregistrement n'a rien produit. Réessaie avec un clip plus long."; $("rec-cancel").textContent = "Fermer"; return; }
      var type = rec.mimeType || mime || "video/webm";
      var ext = /mp4/.test(type) ? "mp4" : "webm";
      var blob = new Blob(chunks, { type: type });
      $("rec-msg").textContent = "Vidéo prête. Confirme l'enregistrement du fichier.";
      $("rec-cancel").textContent = "Fermer";
      downloads.save({ filename: baseName + "." + ext, data: blob }).then(function () {
        $("rec-overlay").hidden = true;
        showToast("Vidéo enregistrée : " + baseName + "." + ext, false);
      }, function (err) {
        var code = err && err.code;
        $("rec-msg").textContent = code === "declined" ? "Enregistrement annulé." : (code === "too_large" ? "Le fichier est trop lourd. Exporte moins de clips à la fois." : "Le fichier n'a pas pu être enregistré ici.");
      });
    };
    vid.playbackRate = 1; vid.muted = true;
    $("rec-cancel").textContent = "Annuler";
    $("rec-overlay").hidden = false;
    try { rec.start(1000); rec.pause(); } catch (e) { recState = null; $("rec-overlay").hidden = true; recUnavailable(); return; }
    recNext(st);
  }
  function recNext(st) {
    if (recState !== st || st.cancelled) return;
    if (st.i >= st.clips.length) { try { st.rec.stop(); } catch (e) {} return; }
    var c = st.clips[st.i];
    $("rec-msg").textContent = "Enregistrement du clip " + (st.i + 1) + " sur " + st.clips.length + ", en temps réel. Garde cette page ouverte et l'écran allumé.";
    var end = isFinite(vid.duration) ? Math.min(c.end, vid.duration - 0.05) : c.end;
    var started = false;
    var go = function () {
      if (started || recState !== st || st.cancelled) return;
      started = true;
      vid.removeEventListener("seeked", go);
      try { st.ctx.drawImage(vid, 0, 0, st.w, st.h); } catch (e) {}
      try { st.rec.resume(); } catch (e) {}
      var pr = vid.play(); if (pr && pr.catch) pr.catch(function () {});
      st.lastT = -1; st.lastMove = Date.now();
      var frame = function () {
        if (recState !== st || st.cancelled) return;
        try { st.ctx.drawImage(vid, 0, 0, st.w, st.h); } catch (e) {}
        var t = vid.currentTime;
        if (t !== st.lastT) { st.lastT = t; st.lastMove = Date.now(); }
        if (t >= end || vid.ended) {
          vid.pause(); try { st.rec.pause(); } catch (e) {}
          st.i++; recNext(st); return;
        }
        if (Date.now() - st.lastMove > 8000) { cancelRec("La lecture s'est arrêtée pendant l'enregistrement. Réessaie en gardant la page au premier plan."); return; }
        st.raf = requestAnimationFrame(frame);
      };
      st.raf = requestAnimationFrame(frame);
    };
    vid.addEventListener("seeked", go);
    try { vid.currentTime = c.start; } catch (e) {}
    setTimeout(go, 2500);
  }
  function cancelRec(msg) {
    var st = recState;
    if (!st) { $("rec-overlay").hidden = true; return; }
    st.cancelled = true;
    cancelAnimationFrame(st.raf);
    try { st.rec.stop(); } catch (e) { recState = null; }
    $("rec-overlay").hidden = true;
    if (msg) showToast(msg, false);
  }

  function videoAction(action) {
    var m = cur(); if (!m) return;
    stopPlayback();
    if (action === "pick") { $("video-file").value = ""; $("video-file").click(); return; }
    if (!videoReady) return;
    if (action === "vplay") {
      if (vid.paused) { var pr = vid.play(); if (pr && pr.catch) pr.catch(function () {}); } else vid.pause();
    } else if (action === "vback") { seekTo(vid.currentTime - 5);
    } else if (action === "vfwd") { seekTo(vid.currentTime + 5);
    } else if (action === "vback20") { seekTo(vid.currentTime - 20);
    } else if (action === "vfwd20") { seekTo(vid.currentTime + 20);
    } else if (action === "vfwd300") { seekTo(vid.currentTime + 300);
    } else if (action === "vr1" || action === "vr15" || action === "vr2") {
      rate = action === "vr15" ? 1.5 : (action === "vr2" ? 2 : 1);
      vid.playbackRate = rate; renderClockBar(m);
    } else if (action === "vstart") { seekTo(0);
    } else if (action === "vmute") { vid.muted = !vid.muted; renderClockBar(m);
    } else if (action === "rate") {
      rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
      vid.playbackRate = rate; renderClockBar(m);
    } else if (action === "k1" || action === "k2") {
      var v = Math.floor(vid.currentTime || 0);
      if (action === "k2" && v <= (m.video.k1 || 0)) {
        showToast("La 2e mi-temps doit commencer après le coup d'envoi.", false);
        return;
      }
      snapshot(m);
      if (action === "k1") { m.video.k1 = v; if (m.video.k2 != null && m.video.k2 <= v) m.video.k2 = null; }
      else m.video.k2 = v;
      recomputeTags(m);
      touch(m); renderMatch();
      showToast((action === "k1" ? "Coup d'envoi" : "2e mi-temps") + " placé à " + fmtLong(v) + " de la vidéo.", true);
    }
  }

  /* ============ Tags ============ */
  function addTag(evId, lbl, btnId, col) {
    var m = cur(); if (!m) return;
    var tag, bt = btnId ? itemById(btnId) : null;
    var P0 = bt && bt.pre != null ? bt.pre : DEF_PRE, P1 = bt && bt.post != null ? bt.post : DEF_POST;
    if (isVideo(m)) {
      if (!videoReady) return;
      var v = Math.round((vid.currentTime || 0) * 10) / 10;
      var d = derive(m, v);
      tag = { id: uid("t"), p: d.p, t: d.t, v: v, team: activeTeam, ev: evId, lbl: lbl || evDef(evId).label, btn: btnId || "", col: col || "", d0: P0, d1: P1, third: "", lane: "", res: "", note: "" };
      stopPlayback();
      m.tags.push(tag); currentTagId = tag.id; savePos(true); touch(m); renderMatch();
      return tag;
    }
    if (m.phase !== "live") return;
    tag = { id: uid("t"), p: m.period, t: periodSec(m), team: activeTeam, ev: evId, lbl: lbl || evDef(evId).label, btn: btnId || "", col: col || "", d0: P0, d1: P1, third: "", lane: "", res: "", note: "" };
    m.tags.push(tag);
    currentTagId = tag.id;
    touch(m);
    renderMatch();
    return tag;
  }
  /* Bouton « Début → Fin » : le 1er toucher ouvre le clip, le 2e le ferme */
  function openTagOf(m, btnId) { for (var i = m.tags.length - 1; i >= 0; i--) if (m.tags[i].btn === btnId && m.tags[i].open) return m.tags[i]; return null; }
  function toggleTag(it) {
    var m = cur(); if (!m) return;
    var t = openTagOf(m, it.id);
    if (t) {
      var len;
      if (isVideo(m)) len = (vid.currentTime || 0) - t.v;
      else len = m.period === t.p ? periodSec(m) - t.t : DEF_POST;
      t.d1 = Math.max(1, Math.round(len * 10) / 10);
      delete t.open; currentTagId = t.id;
      touch(m); renderMatch();
      return;
    }
    t = addTag(it.key, it.label, it.id, it.color);
    if (t) { t.d0 = 0; t.d1 = 0; t.open = true; touch(m); renderMatch(); }
  }
  function findTag(m, id) { for (var i = 0; i < m.tags.length; i++) if (m.tags[i].id === id) return m.tags[i]; return null; }
  function currentTag() { var m = cur(); return m && currentTagId ? findTag(m, currentTagId) : null; }

  function goals(m, team) {
    var n = 0;
    m.tags.forEach(function (t) { if (t.team === team && t.res === "But") n++; });
    return n;
  }

  /* ============ Rendu : accueil ============ */
  function liveMatches() {
    return Object.keys(matches).map(function (k) { return matches[k]; })
      .filter(function (m) { return m && !m.deleted && Array.isArray(m.tags); })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function phaseLabel(m) {
    if (isVideo(m)) return "sur vidéo";
    if (m.phase === "pre") return "pas commencé";
    if (m.phase === "done") return "terminé";
    if (m.phase === "break") return "pause entre deux périodes";
    return "en cours, " + PERIODS[m.period].name;
  }
  /* Place prise par les matchs et le pupitre dans le stockage du navigateur (limite d'environ 5 Mo). */
  var STORE_LIMIT = 500 * 1024 * 1024; /* v2 : IndexedDB, bien au-delà des 5 Mo de la v1 */
  function fmtSize(n) {
    if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(1).replace(".", ",") + " Go";
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1).replace(".", ",") + " Mo";
    return (n > 0 ? Math.max(1, Math.round(n / 1024)) : 0) + " Ko";
  }
  function renderStore() {
    if (sync && cloud && onlineSizes) {
      /* Connecté : on affiche la place prise par tes données dans la base en ligne (500 Mo sur la formule gratuite). */
      var tot = 0; Object.keys(onlineSizes).forEach(function (k) { tot += onlineSizes[k]; });
      var lim = 500 * 1024 * 1024, p = Math.min(100, tot / lim * 100);
      $("store-text").textContent = "Stockage en ligne : " + fmtSize(tot) + " / 500 Mo (" + (p < 1 && tot > 0 ? "moins de 1" : Math.round(p)) + " %)";
      $("store-fill").style.width = Math.max(tot > 0 ? 1 : 0, p) + "%";
      $("store-fill").classList.toggle("warn", p >= 80);
      $("store-track").setAttribute("aria-valuenow", String(Math.round(p)));
      $("store-track").setAttribute("aria-label", "Stockage utilisé en ligne");
      return;
    }
    $("store-track").setAttribute("aria-label", "Stockage utilisé sur cet appareil");
    var used = window.RL2 ? window.RL2.bytes() : 0;
    var pct = Math.min(100, used / STORE_LIMIT * 100);
    $("store-text").textContent = "Stockage sur cet appareil : " + fmtSize(used) + " / 500 Mo (" + (pct < 1 && used > 0 ? "moins de 1" : Math.round(pct)) + " %)";
    $("store-fill").style.width = Math.max(used > 0 ? 1 : 0, pct) + "%";
    $("store-fill").classList.toggle("warn", pct >= 80);
    $("store-track").setAttribute("aria-valuenow", String(Math.round(pct)));
  }
  function renderHome() {
    renderStore();
    var vn = Object.keys(vsMeta).length;
    $("vs-text").hidden = !vn;
    if (vn) {
      $("vs-text").textContent = "Vidéos gardées sur cet appareil : " + vn + " · " + fmtSize(vsTotal());
      if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (est) { if (est && est.quota) $("vs-text").textContent = "Vidéos gardées sur cet appareil : " + vn + " · " + fmtSize(vsTotal()) + " (place disponible ≈ " + fmtSize(Math.max(0, est.quota - (est.usage || 0))) + ")"; }, function () {});
    }
    var list = $("match-list");
    list.textContent = "";
    var ms = liveMatches();
    $("match-empty").hidden = ms.length > 0;
    $("tile-projects").textContent = ms.length ? "Rouvrir un match déjà tagué, " + ms.length + (ms.length > 1 ? " projets enregistrés" : " projet enregistré") : "Rouvrir un match déjà tagué, aucun projet pour l'instant";
    ms.forEach(function (m) {
      var li = el("li", "mrow"); li.dataset.open = m.id; li.setAttribute("role", "button"); li.tabIndex = 0;
      var info = el("div", "info");
      info.appendChild(el("div", "t", m.home + " – " + m.away));
      var meta = [];
      if (m.date) meta.push(m.date.split("-").reverse().join("/"));
      if (m.comp) meta.push(m.comp);
      meta.push(m.tags.length + (m.tags.length > 1 ? " tags" : " tag"));
      info.appendChild(el("div", "d", meta.join(" · ")));
      li.appendChild(info);
      var pj = pjOf(m.id); li.appendChild(el("span", "pj", pj ? pj.name : "—"));
      var dots = el("button", "dots-btn", "⋯"); dots.type = "button"; dots.dataset.mmenu = m.id; dots.setAttribute("aria-label", "Options du match");
      li.appendChild(dots);
      list.appendChild(li);
    });
    renderPrTabs();
    renderPjHome();
    renderSync();
  }

  /* ============ Rendu : match ============ */
  function renderClock() {
    var m = cur(); if (!m) return;
    var c = $("clock");
    var txt, paused;
    var total = "", live = false;
    if (isVideo(m)) {
      var v = videoPos(m);
      var d = derive(m, v);
      txt = fmtLong(v);
      total = videoReady && isFinite(vid.duration) && vid.duration > 0 ? "/ " + fmtLong(vid.duration) : "";
      paused = !videoReady || vid.paused;
      var marks = !!(m.video && (m.video.k1 != null || m.video.k2 != null));
      $("period").hidden = videoReady;
      var pn = videoReady ? fmt(matchTime(d.p, d.t)) : "";
      if ($("period-name").textContent !== pn) $("period-name").textContent = pn;
      var st = videoReady ? PERIODS[d.p].name : (m.video && m.video.name ? "Vidéo à rouvrir : " + m.video.name : "Aucune vidéo choisie");
      if ($("period-state").textContent !== st) $("period-state").textContent = st;
      savePos(false);
    } else {
      txt = fmt(m.phase === "pre" ? 0 : matchTime(m.period, periodSec(m)));
      paused = !m.clock.running;
      live = m.phase === "live" && m.clock.running;
      $("period").hidden = false;
    }
    if ($("clock-total").textContent !== total) $("clock-total").textContent = total;
    $("period").classList.toggle("live-on", live);
    if (c.textContent !== txt) c.textContent = txt;
    c.classList.toggle("paused", paused);
    var nowT = isVideo(m) ? videoPos(m) : (m.phase === "pre" ? 0 : matchTime(m.period, periodSec(m)));
    if (!isVideo(m) && nowT + 30 > tlDur) renderTimeline(m);
    var frac = Math.max(0, Math.min(1, nowT / tlDur));
    $("tl-playhead").style.setProperty("--p", String(frac));
    if (isVideo(m) ? (videoReady && !vid.paused) : m.clock.running) tlReveal(frac, false);
  }
  var ICONS = {
    start: '<path d="M6 5v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M19 5.5v13L9.5 12z"/>',
    rew: '<path d="M12 6v12L3.5 12z"/><path d="M21 6v12l-8.5-6z"/>',
    prev: '<path d="M14.5 5.5 8 12l6.5 6.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    play: '<path d="M7 4.5v15l12.5-7.5z"/>',
    pause: '<rect x="6" y="4.5" width="4.2" height="15" rx="0.8"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="0.8"/>',
    next: '<path d="M9.5 5.5 16 12l-6.5 6.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    ff: '<path d="M12 6v12l8.5-6z"/><path d="M3 6v12l8.5-6z"/>',
    end: '<path d="M18 5v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M5 5.5v13l9.5-6.5z"/>',
    sound: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
    mute: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
    film: '<path d="M3 7a2 2 0 0 1 2-2h4.2l2 2.2H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" fill="none"/>'
  };
  function ictl(icon, action, label, cls) {
    var b = el("button", "tbtn " + (cls || ""));
    b.type = "button"; b.dataset.clock = action; b.setAttribute("aria-label", label); b.title = label;
    b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">' + ICONS[icon] + '</svg>';
    return b;
  }
  function ctl(label, action, cls) {
    var b = el("button", "btn " + (cls || ""), label);
    b.type = "button"; b.dataset.clock = action; return b;
  }
  function renderClockBar(m) {
    /* Pendant un changement de match, on garde la barre telle quelle jusqu'à ce que la nouvelle vidéo soit prête */
    if (isVideo(m) && !videoReady && snapActive()) return;
    var box = $("clock-controls"), extra = $("clock-extra");
    box.textContent = ""; extra.textContent = "";
    $("clockbar").classList.toggle("is-video", isVideo(m));
    var name = "", state = "";
    if (isVideo(m)) {
      if (!videoReady) {
        box.appendChild(ctl(m.video && m.video.name ? "Rouvrir la vidéo" : "Choisir la vidéo", "pick", "primary"));
      } else {
        box.appendChild(ictl("rew", "vback20", "Reculer de 20 secondes"));
        box.appendChild(ictl("prev", "vback", "Reculer de 5 secondes"));
        box.appendChild(ictl(vid.paused ? "play" : "pause", "vplay", vid.paused ? "Lecture" : "Pause", "main"));
        box.appendChild(ictl("next", "vfwd", "Avancer de 5 secondes"));
        box.appendChild(ictl("ff", "vfwd20", "Avancer de 20 secondes"));
        extra.appendChild(ictl(vid.muted ? "mute" : "sound", "vmute", vid.muted ? "Remettre le son" : "Couper le son"));
        var seg = el("span", "rate-seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Vitesse de lecture");
        [["vr1", 1, "×1"], ["vr15", 1.5, "×1,5"], ["vr2", 2, "×2"]].forEach(function (r) {
          var rb = el("button", "tbtn rate", r[2]); rb.type = "button"; rb.dataset.clock = r[0];
          rb.setAttribute("aria-pressed", String(rate === r[1])); rb.setAttribute("aria-label", "Vitesse " + r[2]);
          seg.appendChild(rb);
        });
        extra.appendChild(seg);
        extra.appendChild(ictl("film", "pick", "Changer de vidéo"));
      }
      renderClock();
      return;
    }
    if (m.phase === "pre") {
      name = "Avant-match"; state = "En direct ou sur une vidéo enregistrée";
      box.appendChild(ctl("Coup d'envoi", "kickoff", "primary"));
      if (!m.tags.length) box.appendChild(ctl("Taguer sur une vidéo", "pick"));
    } else if (m.phase === "live") {
      name = PERIODS[m.period].name;
      state = m.clock.running ? "Chrono en marche" : "Chrono en pause";
      box.appendChild(ctl("− 10 s", "minus", "small"));
      box.appendChild(ctl("+ 10 s", "plus", "small"));
      box.appendChild(m.clock.running ? ctl("Pause", "pause") : ctl("Reprendre", "resume", "primary"));
      var endLabel = m.period === 1 ? "Mi-temps" : (m.period === 3 ? "Fin de la période" : "Fin du match");
      box.appendChild(ctl(endLabel, "end"));
    } else if (m.phase === "break") {
      name = m.period === 1 ? "Mi-temps" : "Pause";
      state = PERIODS[m.period].name + " terminée";
      box.appendChild(ctl("Lancer la " + PERIODS[m.period + 1].name.toLowerCase(), "next", "primary"));
    } else {
      name = "Match terminé"; state = "Tu peux encore corriger tes tags";
      if (m.period === 2) box.appendChild(ctl("Jouer la prolongation", "next"));
    }
    $("period-name").textContent = name;
    $("period-state").textContent = state;
    renderClock();
  }
  function renderEvents(m) {
    $("events").dataset.team = activeTeam;
    var tg = $("team-toggle").children;
    for (var i = 0; i < tg.length; i++) {
      var t = tg[i].dataset.team;
      tg[i].textContent = teamName(m, t);
      tg[i].setAttribute("aria-pressed", String(t === activeTeam));
    }
    var grid = $("event-grid");
    var canTag = isVideo(m) ? (videoReady || snapActive()) : m.phase === "live";
    grid.textContent = "";
    grid.classList.toggle("editing", padEdit);
    var maxRow = 0;
    layout().forEach(function (it) {
      var node;
      if (it.type === "label") {
        node = el("div", "pad-grp" + (it.color ? " filled" : ""));
        node.appendChild(el("span", "", it.label));
        if (it.color) paint(node, it.color, it.pat, it.bd, it.bw); else node.style.border = borderCss(it.bd, it.bw);
      }
      else {
        node = el("button", "pb" + (it.flag ? " flag" : ""));
        if (it.dur === "toggle" && !panelMode && m && m.tags && openTagOf(m, it.id)) node.classList.add("rec");
        node.type = "button"; node.dataset.team = it.flag ? "" : it.team;
        paint(node, it.color, it.pat, it.bd, it.bw);
        node.setAttribute("aria-label", it.label);
        node.appendChild(el("span", "", it.label));
        if (!padEdit) node.disabled = !canTag;
      }
      node.dataset.item = it.id;
      node.style.gridColumn = (it.c + 1) + " / span " + it.w;
      node.style.gridRow = (it.r + 1) + " / span " + it.h;
      if (padEdit && it.id === padSel) { node.classList.add("sel"); node.appendChild(el("span", "rs")); }
      grid.appendChild(node);
      maxRow = Math.max(maxRow, it.r + it.h);
    });
    grid.style.gridTemplateRows = "repeat(" + (maxRow + (padEdit ? 12 : 0)) + ", " + ROW_H + "px)";
    $("pad-tools").hidden = !padEdit; $("pad-edit-hint").hidden = !padEdit;
    $("btn-panel").textContent = padEdit ? "Terminer" : "Modifier les boutons";
    $("btn-panel").classList.toggle("primary", padEdit);
    renderPadProps(m);
    var hint = "";
    if (isVideo(m)) hint = videoReady ? "" : "Choisis la vidéo du match pour taguer.";
    else if (m.phase === "pre") hint = "Lance le chrono pour commencer à taguer.";
    else if (m.phase === "break") hint = "Lance la période suivante pour taguer.";
    else if (m.phase === "done") hint = "Le match est terminé.";
    else if (!m.clock.running) hint = "Chrono en pause : les tags prennent le temps affiché.";
    $("events-hint").textContent = hint;
    $("events-hint").hidden = true;
    var cb = document.querySelector("#events .cur-box"); if (cb) cb.hidden = padEdit || !currentTag();
    $("btn-panel").hidden = !panelMode;
  }
  var padEdit = false, padSel = null;
  function renderPadProps(m) {
    var it = padEdit && padSel ? itemById(padSel) : null;
    var box = $("pad-props");
    box.hidden = !it;
    $("pad-props-empty").hidden = !!it || !padEdit;
    if (!it) return;
    var isBtn = it.type === "button";
    var lab = $("pp-label");
    if (lab.dataset.item !== it.id || document.activeElement !== lab) { lab.value = it.label; lab.dataset.item = it.id; }
    $("pp-team-row").hidden = true; $("pp-res-row").hidden = !isBtn || !!it.flag;
    $("pp-dup").hidden = !isBtn || !!it.flag;
    $("pp-pat-row").hidden = !it.color;
    var sw = $("pp-color");
    if (!sw.children.length) {
      var none = el("button", "no-fill", "Sans fond"); none.type = "button"; none.dataset.color = "none"; sw.appendChild(none);
      PRESETS.forEach(function (c) { var b = el("button"); b.type = "button"; b.dataset.color = c[0]; b.style.background = c[0]; b.setAttribute("aria-label", c[1]); sw.appendChild(b); });
      var lab2 = el("label", "custom-color");
      lab2.appendChild(el("span", "", "Autre"));
      var inp = el("input"); inp.type = "color"; inp.id = "pp-custom"; inp.setAttribute("aria-label", "Choisir une autre couleur");
      lab2.appendChild(inp); sw.appendChild(lab2);
    }
    for (var j = 0; j < sw.children.length; j++) {
      var d = sw.children[j].dataset.color; if (!d) continue;
      if (d === "none") { sw.children[j].hidden = isBtn; sw.children[j].setAttribute("aria-pressed", String(!it.color)); }
      else sw.children[j].setAttribute("aria-pressed", String(d === it.color));
    }
    var cc = $("pp-custom"); if (cc && document.activeElement !== cc && it.color) cc.value = it.color.toLowerCase();
    var pt = $("pp-pat");
    if (!pt.children.length) PATTERNS.forEach(function (p) { var b = el("button"); b.type = "button"; b.dataset.pat = p[0]; b.setAttribute("aria-label", p[1]); b.title = p[1]; pt.appendChild(b); });
    for (var k = 0; k < pt.children.length; k++) {
      if (it.color) paint(pt.children[k], it.color, pt.children[k].dataset.pat);
      pt.children[k].setAttribute("aria-pressed", String(pt.children[k].dataset.pat === (it.pat || "none")));
    }
    var bdw = $("pp-bd");
    if (!bdw.children.length) {
      var nb = el("button", "no-fill", "Par défaut"); nb.type = "button"; nb.dataset.bd = "none"; bdw.appendChild(nb);
      PRESETS.forEach(function (c) { var b = el("button"); b.type = "button"; b.dataset.bd = c[0]; b.style.background = "transparent"; b.style.border = "4px solid " + c[0]; b.setAttribute("aria-label", "Bord " + c[1]); bdw.appendChild(b); });
      var lab3 = el("label", "custom-color");
      lab3.appendChild(el("span", "", "Autre"));
      var inp3 = el("input"); inp3.type = "color"; inp3.id = "pp-bd-custom"; inp3.setAttribute("aria-label", "Choisir une autre couleur de bord");
      lab3.appendChild(inp3); bdw.appendChild(lab3);
    }
    for (var q = 0; q < bdw.children.length; q++) {
      var dv = bdw.children[q].dataset.bd; if (!dv) continue;
      bdw.children[q].setAttribute("aria-pressed", String(dv === "none" ? !it.bd : dv === it.bd));
    }
    var bc = $("pp-bd-custom"); if (bc && document.activeElement !== bc && it.bd) bc.value = it.bd.toLowerCase();
    var bwv = it.bw || (it.bd ? 2 : 1), bws = $("pp-bw").children;
    for (var z = 0; z < bws.length; z++) bws[z].setAttribute("aria-pressed", String(+bws[z].dataset.bw === bwv));
    $("pp-clip-row").hidden = !isBtn; $("pp-clip-note").hidden = !isBtn;
    if (isBtn) { $("pp-pre").textContent = (it.pre != null ? it.pre : DEF_PRE) + " s"; $("pp-post").textContent = (it.post != null ? it.post : DEF_POST) + " s"; }
    if (!isBtn) return;
    var tb = $("pp-team").children;
    for (var i = 0; i < tb.length; i++) { tb[i].textContent = teamName(m, tb[i].dataset.team); tb[i].setAttribute("aria-pressed", String(tb[i].dataset.team === it.team)); }
    var res = $("pp-res");
    if (res.dataset.item !== it.id || document.activeElement !== res) { res.value = it.res.join(", "); res.dataset.item = it.id; }
  }
  function renderCurrent(m) {
    var cbx = document.querySelector("#events .cur-box"); if (cbx) cbx.hidden = padEdit || !currentTag();
    var tag = currentTag();
    var panel = $("current");
    var line = $("cur-line");
    line.textContent = "";
    panel.dataset.team = tag ? tag.team : activeTeam;
    if (!tag) {
      line.appendChild(el("span", "cur-empty", "Touche un événement : il est enregistré tout de suite. Résultat, zone et note sont facultatifs."));
    } else {
      line.appendChild(el("span", "cur-time", fmt(matchTime(tag.p, tag.t))));
      line.appendChild(el("span", "cur-event", tagLabel(tag)));
    }
    $("attack-label").textContent = tag ? "Sens d'attaque : vers la droite" : "";

    var zones = $("zones");
    if (!zones.children.length) {
      LANES.forEach(function (lane) {
        THIRDS.forEach(function (third) {
          var b = el("button", "", lane);
          b.type = "button"; b.dataset.third = third; b.dataset.lane = lane;
          b.setAttribute("aria-label", "Tiers " + third.toLowerCase() + ", " + lane.toLowerCase());
          zones.appendChild(b);
        });
      });
    }
    for (var i = 0; i < zones.children.length; i++) {
      var z = zones.children[i];
      z.disabled = !tag;
      z.setAttribute("aria-pressed", String(!!tag && tag.third === z.dataset.third && tag.lane === z.dataset.lane));
    }

    var res = $("results");
    res.textContent = "";
    var tb0 = tag ? tagButton(tag) : null;
    var opts = tag ? (tb0 ? tb0.res : resFor(tag)) : [];
    if (!tag || !opts.length) {
      if (tag) res.appendChild(el("span", "cur-empty", "Pas de résultat pour ce type de tag."));
    } else {
      opts.forEach(function (r) {
        var b = el("button", "", r);
        b.type = "button"; b.dataset.res = r;
        b.setAttribute("aria-pressed", String(tag.res === r));
        res.appendChild(b);
      });
    }
    var clipRow = $("clip-row");
    clipRow.hidden = !tag;
    if (tag) {
      $("clip-pre").textContent = String(Math.round(pre(tag) * 10) / 10).replace(".", ",") + " s avant";
      $("clip-post").textContent = String(Math.round(post(tag) * 10) / 10).replace(".", ",") + " s après";
      var canVid = isVideo(m) && videoReady && tag.v != null;
      $("clip-endhere").hidden = !canVid; $("clip-play").hidden = !canVid; $("clip-export").hidden = !canVid;
    }
    var note = $("note");
    note.disabled = !tag;
    if (note.dataset.tag !== (tag ? tag.id : "")) {
      note.value = tag ? (tag.note || "") : "";
      note.dataset.tag = tag ? tag.id : "";
    }
    $("btn-swap").disabled = !tag;
  }
  /* v2 : on ne redessine que ce qui est à l'écran. Les parties cachées (timeline en page Codage,
     onglets non affichés) sont redessinées quand on les affiche (voir atSetLay / atSetTab). */
  function v2Vis(part) {
    if (panelMode || typeof at !== "object" || !at) return true;
    if (part === "tl") return at.lay === "ana";
    if (part === "side") return at.lay === "ana";
    if (part === "never") return false;
    return at.lay === "ana" && at.tab === part;
  }
  function renderLog(m) {
    var list = $("tag-list");
    list.textContent = "";
    $("tags-empty").hidden = m.tags.length > 0;
    $("log-hint").hidden = !(isVideo(m) && videoReady && m.tags.length > 0);
    renderTimeline(m);
    var tags = v2Vis("last") ? m.tags.slice().sort(function (a, b) { return (b.p - a.p) || (b.t - a.t); }) : [];
    tags.forEach(function (t) {
      var li = el("li", (t.id === currentTagId ? "is-current " : "") + (isFlag(t) ? "flagged" : ""));
      if (t.v != null && videoReady) {
        var tb = el("button", "t", fmt(matchTime(t.p, t.t)));
        tb.type = "button"; tb.dataset.seek = t.id;
        tb.setAttribute("aria-label", "Revoir l'action à " + fmt(matchTime(t.p, t.t)));
        li.appendChild(tb);
      } else li.appendChild(el("span", "t", fmt(matchTime(t.p, t.t))));
      var dotc = el("span", "dot"); dotc.style.background = tagColor(t); li.appendChild(dotc);
      var what = el("button", "what"); what.type = "button"; what.dataset.select = t.id;
      what.appendChild(el("b", "", tagLabel(t)));
      var bits = [];
      if (t.third) bits.push("tiers " + t.third.toLowerCase() + ", " + t.lane.toLowerCase());
      if (t.res) bits.push(t.res);
      if (t.note) bits.push("« " + t.note + " »");
      what.appendChild(el("small", "", bits.join(" / ")));
      li.appendChild(what);
      var acts = el("span", "row-actions");
      var add = el("button", "btn small quiet", "+ Liste"); add.type = "button"; add.dataset.tolist = t.id;
      add.setAttribute("aria-label", "Ajouter ce tag à la liste de lecture");
      var del = el("button", "btn small quiet danger", "Supprimer"); del.type = "button"; del.dataset.deltag = t.id;
      acts.appendChild(add); acts.appendChild(del);
      li.appendChild(acts);
      list.appendChild(li);
    });
    if (v2Vis("never")) { renderLists(m); renderCats(m); }
  }

  /* ============ Parcourir par tag : tous les boutons, puis les clips d'un bouton ============ */
  var catSel = null;
  function renderCats(m) {
    var rows = tlRows(m), list = $("cat-list"), sel = null;
    rows.forEach(function (r, i) { r.n = i + 1; if (r.key === catSel) sel = r; });
    if (catSel && !sel) catSel = null;
    list.textContent = "";
    $("cat-head").hidden = !sel;
    if (!sel) {
      rows.forEach(function (r) {
        var li = el("li"), b = el("button", r.tags.length ? "" : "zero"); b.type = "button"; b.dataset.cat = r.key;
        b.appendChild(el("span", "nn", String(r.n)));
        var sw = el("span", "sw"); sw.style.background = r.color; b.appendChild(sw);
        b.appendChild(el("span", "nm", r.label));
        b.appendChild(el("span", "ct", r.tags.length + (r.tags.length > 1 ? " clips" : " clip")));
        li.appendChild(b); list.appendChild(li);
      });
      return;
    }
    $("cat-name").textContent = sel.n + ". " + sel.label;
    var tags = sel.tags.slice().sort(function (a, b) { return (tlPos(m, a) || 0) - (tlPos(m, b) || 0); });
    if (!tags.length) { list.appendChild(el("li", "cat-none", "Aucun clip pour ce tag.")); return; }
    tags.forEach(function (t, i) {
      var li = el("li"), b = el("button", t.id === currentTagId ? "on" : ""); b.type = "button"; b.dataset.catclip = t.id;
      b.appendChild(el("span", "nn", String(i + 1)));
      var sw = el("span", "sw"); sw.style.background = sel.color; b.appendChild(sw);
      b.appendChild(el("span", "nm", fmt(matchTime(t.p, t.t)) + (t.note ? "  « " + t.note + " »" : "")));
      b.appendChild(el("span", "ct", "clip de " + String(Math.round((pre(t) + post(t)) * 10) / 10).replace(".", ",") + " s"));
      li.appendChild(b); list.appendChild(li);
    });
  }

  /* ============ Listes de lecture ============ */
  var listSel = null;
  function lists(m) { if (!Array.isArray(m.lists)) m.lists = []; return m.lists; }
  function curList(m) {
    var ls = lists(m);
    for (var i = 0; i < ls.length; i++) if (ls[i].id === listSel) return ls[i];
    return ls[0] || null;
  }
  function newList(m) {
    var ls = lists(m);
    var l = { id: uid("l"), name: "Liste " + (ls.length + 1), tags: [] };
    ls.push(l); listSel = l.id;
    return l;
  }
  function listTags(m, l) {
    return l.tags.map(function (id) { return findTag(m, id); }).filter(function (t) { return !!t; })
      .sort(function (a, b) { return (a.p - b.p) || (a.t - b.t); });
  }
  function listClips(m, l) {
    return listTags(m, l).map(function (t) { return clipOf(m, t); }).filter(function (c) { return !!c; });
  }
  function renderLists(m) {
    var ls = lists(m), l = curList(m);
    var sel = $("list-select");
    sel.textContent = "";
    ls.forEach(function (x) {
      var o = el("option", "", x.name + " (" + x.tags.length + ")"); o.value = x.id;
      if (l && x.id === l.id) o.selected = true;
      sel.appendChild(o);
    });
    sel.hidden = !ls.length;
    $("list-tools").hidden = !l;
    var items = $("list-items"); items.textContent = "";
    var empty = $("list-empty");
    if (!l) { empty.textContent = "Aucune liste. Crée-en une, ou touche « + Liste » sur un tag dans l'onglet Tags."; empty.hidden = false; return; }
    var nm = $("list-name");
    if (nm.dataset.list !== l.id || document.activeElement !== nm) { nm.value = l.name; nm.dataset.list = l.id; }
    var canVid = isVideo(m) && videoReady;
    var n = 0;
    listTags(m, l).forEach(function (t) {
      n++;
      var li = el("li", t.id === currentTagId ? "is-current" : "");
      if (t.v != null && canVid) {
        var tb = el("button", "t", fmt(matchTime(t.p, t.t))); tb.type = "button"; tb.dataset.seek = t.id;
        tb.setAttribute("aria-label", "Lire le clip de " + fmt(matchTime(t.p, t.t)));
        li.appendChild(tb);
      } else li.appendChild(el("span", "t", fmt(matchTime(t.p, t.t))));
      var dotc = el("span", "dot"); dotc.style.background = tagColor(t); li.appendChild(dotc);
      var what = el("span", "what");
      what.appendChild(el("b", "", tagLabel(t)));
      what.appendChild(el("small", "", "clip de " + Math.round((pre(t) + post(t)) * 10) / 10 + " s" + (t.res ? " / " + t.res : "")));
      li.appendChild(what);
      var acts = el("span", "row-actions");
      var rm = el("button", "btn small quiet", "Retirer"); rm.type = "button"; rm.dataset.unlist = t.id;
      acts.appendChild(rm); li.appendChild(acts);
      items.appendChild(li);
    });
    empty.textContent = "Cette liste est vide. Touche « + Liste » sur un tag dans l'onglet Tags.";
    empty.hidden = n > 0;
    $("list-play").disabled = !(canVid && n > 0);
    $("list-export").disabled = !(canVid && n > 0);
    $("list-play").hidden = !isVideo(m); $("list-export").hidden = !isVideo(m);
  }
  var tlDur = 1;
  function applyTlView() { $("tl-inner").style.setProperty("--zoom", String(prefs.tlZoom)); }
  function tlLabelW() { return 0; }
  var tlFilter = { team: "all", hideEmpty: false };
  function renderTlFilter(m) {
    var on = tlFilter.team !== "all" || tlFilter.hideEmpty;
    $("tl-filter").classList.toggle("on", on);
    $("tl-filter").setAttribute("aria-label", on ? "Filtrer la chronologie (filtre actif)" : "Filtrer la chronologie");
    var tb = $("tl-f-team").children;
    for (var i = 0; i < tb.length; i++) {
      var t = tb[i].dataset.team;
      if (t !== "all") tb[i].textContent = teamName(m, t);
      tb[i].setAttribute("aria-pressed", String(t === tlFilter.team));
    }
    $("tl-f-empty").setAttribute("aria-pressed", String(tlFilter.hideEmpty));
    $("tl-f-reset").disabled = !on;
  }
  function closeTlMenu() { $("tl-filter-menu").hidden = true; $("tl-filter").setAttribute("aria-expanded", "false"); }
  function tlReveal(frac, force) {
    var sc = $("tl-scroll"); if (prefs.tlZoom <= 1) return;
    var lw = tlLabelW(), trackW = $("tl-inner").getBoundingClientRect().width - lw, viewW = sc.clientWidth - lw;
    if (trackW <= 0 || viewW <= 0) return;
    var x = trackW * frac;
    if (force || x < sc.scrollLeft || x > sc.scrollLeft + viewW - 24) sc.scrollLeft = Math.max(0, x - viewW * (force ? 0.4 : 0.15));
  }
  /* Zoom de la chronologie : gestes sur la règle des temps (pincer, glisser, molette, double toucher). */
  var tlTimer = null;
  function zoomAt(z, clientX) {
    var m = cur(); if (!m) return;
    z = Math.max(1, Math.min(TL_MAX, z));
    var sc = $("tl-scroll"), lw = tlLabelW(), viewW = sc.clientWidth - lw;
    if (viewW <= 0) return;
    var px = Math.max(0, Math.min(viewW, clientX - sc.getBoundingClientRect().left - lw));
    var frac = (sc.scrollLeft + px) / (viewW * prefs.tlZoom);
    prefs.tlZoom = z;
    applyTlView();
    sc.scrollLeft = Math.max(0, frac * viewW * z - px);
    clearTimeout(tlTimer);
    tlTimer = setTimeout(function () { savePrefs(); var mm = cur(); if (mm) { var keep = sc.scrollLeft; renderTimeline(mm); sc.scrollLeft = keep; } }, 80);
  }
  function tlAxis(m) {
    var dur, now;
    if (isVideo(m)) {
      now = videoPos(m);
      if (videoReady && isFinite(vid.duration) && vid.duration > 0) dur = vid.duration;
      else { dur = 600; m.tags.forEach(function (t) { if (t.v != null && t.v + 60 > dur) dur = t.v + 60; }); }
    } else {
      now = m.phase === "pre" ? 0 : matchTime(m.period, periodSec(m));
      dur = Math.max(95 * 60, now + 60);
      m.tags.forEach(function (t) { var x = matchTime(t.p, t.t) + 60; if (x > dur) dur = x; });
    }
    return { dur: dur, now: now };
  }
  function tlPos(m, t) { return isVideo(m) ? t.v : matchTime(t.p, t.t); }
  function renderTimeline(m) {
    var ax = tlAxis(m);
    tlDur = ax.dur;
    var ticks = $("tl-ticks"); ticks.textContent = "";
    applyTlView();
    var vis = ax.dur / prefs.tlZoom, STEPS = [5, 10, 30, 60, 120, 300, 600, 900, 1800], step = 3600;
    for (var si = 0; si < STEPS.length; si++) if (vis / STEPS[si] <= 9) { step = STEPS[si]; break; }
    for (var s = 0; s < ax.dur - step * 0.4; s += step) {
      var tk = el("span", "tl-tick", step % 60 === 0 ? Math.round(s / 60) + " min" : (ax.dur >= 60 ? fmt(s) : s + " s"));
      tk.style.left = (s / ax.dur * 100) + "%";
      ticks.appendChild(tk);
    }
    var rows = $("tl-rows"); rows.textContent = "";
    var labels = $("tl-labels"); labels.textContent = "";
    var allTl = tlRows(m);
    allTl.forEach(function (r, i) { r.n = i + 1; });
    var shown = allTl.filter(function (r) {
      if (tlFilter.team !== "all" && r.team && r.team !== tlFilter.team) return false;
      if (tlFilter.hideEmpty && !r.tags.length) return false;
      return true;
    });
    shown.forEach(function (r) {
      var lab = el("div", "tl-label");
      lab.style.background = r.color; lab.style.color = textOn(r.color);
      lab.appendChild(el("span", "n", String(r.n)));
      lab.appendChild(el("span", "nm", r.label));
      lab.appendChild(el("i", "", String(r.tags.length)));
      lab.setAttribute("title", r.label); lab.dataset.row = r.key;
      labels.appendChild(lab);
      var row = el("div", "tl-row");
      var track = el("span", "tl-track");
      track.style.background = tint(r.color, 0.16);
      r.tags.slice().sort(function (a, b) { return (tlPos(m, a) || 0) - (tlPos(m, b) || 0); }).forEach(function (t, ti) {
        var x = tlPos(m, t); if (x == null) return;
        var x0 = Math.max(0, x - pre(t));
        var b = el("button", "tl-block" + (t.id === currentTagId ? " is-current" : "") + (t.id === tlEdit ? " editing" : ""));
        b.type = "button"; b.dataset.tl = t.id;
        b.style.background = r.color; b.style.color = textOn(r.color);
        b.textContent = String(ti + 1);
        if (t.id === tlEdit) { var hl = el("span", "tl-h l"); hl.dataset.h = "l"; var hr2 = el("span", "tl-h r"); hr2.dataset.h = "r"; b.appendChild(hl); b.appendChild(hr2); }
        b.style.left = Math.min(100, x0 / ax.dur * 100) + "%";
        b.style.width = Math.max(0, (x + post(t) - x0) / ax.dur * 100) + "%";
        b.setAttribute("aria-label", tagLabel(t) + " numéro " + (ti + 1) + ", " + fmt(matchTime(t.p, t.t)));
        track.appendChild(b);
      });
      row.appendChild(track);
      rows.appendChild(row);
    });
    if (!shown.length) rows.appendChild(el("div", "tl-none", "Aucune ligne ne correspond au filtre."));
    var et = tlEdit ? findTag(m, tlEdit) : null;
    if (tlEdit && !et) tlEdit = null;
    $("tl-edit").hidden = !et;
    if (et) $("tl-edit-name").textContent = tagLabel(et) + ", " + fmt(matchTime(et.p, et.t));
    renderTlFilter(m);
    $("tl-playhead").style.setProperty("--p", String(Math.max(0, Math.min(1, ax.now / ax.dur))));
  }
  function renderSummary(m) {
    var box = $("summary");
    box.textContent = "";
    if (!m.tags.length) { box.appendChild(el("p", "empty", "Le bilan se remplit au fil de tes tags.")); return; }
    var table = el("table", "sum");
    var thead = el("thead"), hr = el("tr");
    ["N°", "Événement", "Tags", "Résultats"].forEach(function (h) { hr.appendChild(el("th", "", h)); });
    thead.appendChild(hr); table.appendChild(thead);
    var tbody = el("tbody");
    tlRows(m).forEach(function (r, idx) {
      if (!r.tags.length) return;
      var row = el("tr");
      row.appendChild(el("td", "", String(idx + 1)));
      var name = el("td"); var sw = el("span", "sum-sw"); sw.style.background = r.color; name.appendChild(sw); name.appendChild(el("span", "", r.label));
      row.appendChild(name);
      var c = el("td"); c.appendChild(el("span", "n", String(r.tags.length))); row.appendChild(c);
      var counts = {}, order = [];
      r.tags.forEach(function (t) { if (!t.res) return; if (!counts[t.res]) { counts[t.res] = 0; order.push(t.res); } counts[t.res]++; });
      row.appendChild(el("td", "", order.map(function (k) { return k + " " + counts[k]; }).join(", ")));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    box.appendChild(table);
  }
  function renderMatch() {
    var m = cur();
    if (!m) { showHome(); return; }
    $("sc-home").textContent = m.home;
    $("sc-away").textContent = m.away;
    $("sc-goals").textContent = "–";
    renderPTabs(m);
    $("board").dataset.mode = isVideo(m) ? "video" : "live";
    $("videobox").hidden = !isVideo(m);
    var loadingStored = vsLoading === m.id;
    $("video-ask").hidden = !isVideo(m) || videoReady || snapActive();
    $("video-ask-text").textContent = loadingStored ? "Ouverture de la vidéo enregistrée sur l'appareil…" : (m.video && m.video.name ? "Rechoisis la vidéo de ce match : " + m.video.name : "Choisis la vidéo de ce match.");
    $("video-ask-btn").hidden = loadingStored;
    $("video-ask-note").textContent = vsOk ? "Une fois choisie, la vidéo est gardée sur cet appareil : tu n'auras plus à la rechoisir. Tes tags, eux, sont toujours conservés." : "Le navigateur ne garde pas la vidéo d'une fois sur l'autre. Tes tags, eux, sont conservés.";
    renderVsBadge();
    vid.hidden = !videoReady;
    renderClockBar(m);
    renderEvents(m);
    renderCurrent(m);
    renderLog(m);
    if (v2Vis("sum")) renderSummary(m);
  }
  function renderAll() {
    if (panelMode) { renderEvents(panelDummy); return; }
    if (!$("view-sort").hidden) { renderSort(); return; }
    if (currentMatchId && cur()) { renderMatch(); } else { showHome(); }
  }
  var homeScreen = "menu";
  function leavePanel() {
    if (!panelMode) return;
    panelMode = false; padEdit = false; padSel = null;
    $("board").insertBefore($("events"), $("timeline"));
    $("view-panel").hidden = true;
  }
  function fillProjSelect() {
    var sel = $("f-proj"), keep = sel.value; sel.textContent = "";
    var o0 = el("option", "", "Aucun projet"); o0.value = ""; sel.appendChild(o0);
    projects().forEach(function (a) { var o = el("option", "", a.name); o.value = a.id; sel.appendChild(o); });
    sel.value = keep && pjDoc(keep) ? keep : (pjId && pjDoc() ? pjId : "");
    $("f-proj-row").hidden = !projects().length;
  }
  function showHome(screen) {
    if (screen) homeScreen = screen;
    if (screen === "new") fillProjSelect();
    closePop();
    leaveSort();
    leavePanel();
    savePos(true);
    unloadVideo();
    currentMatchId = null; currentTagId = null;
    $("view-match").hidden = true; $("view-home").hidden = false;
    $("home-menu").hidden = homeScreen !== "menu";
    $("home-new").hidden = homeScreen !== "new";
    $("home-projects").hidden = homeScreen !== "projects";
    renderHome();
    releaseWake();
  }
  function openPanelEditor() {
    leaveSort();
    savePos(true); unloadVideo();
    currentMatchId = null; currentTagId = null;
    panelMode = true; padEdit = true; padSel = null;
    $("view-home").hidden = true; $("view-match").hidden = true; $("view-panel").hidden = false;
    $("panel-host").appendChild($("events"));
    renderEvents(panelDummy);
    window.scrollTo(0, 0);
  }
  /* Changement de match : on fige la dernière image le temps que la nouvelle vidéo soit prête (pas de flash noir) */
  var snapTimer = 0;
  function snapFrame() {
    var box = $("videobox"), c = $("vsnap");
    if (!videoReady || !vid.videoWidth || box.hidden) return false;
    var r = vid.getBoundingClientRect(), br = box.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    c.width = Math.round(r.width); c.height = Math.round(r.height);
    try { c.getContext("2d").drawImage(vid, 0, 0, c.width, c.height); } catch (e) { return false; }
    if (c.parentNode !== document.body) document.body.appendChild(c);
    c.style.left = r.left + "px"; c.style.top = r.top + "px";
    c.style.width = r.width + "px"; c.style.height = r.height + "px";
    box.style.minHeight = br.height + "px";
    c.classList.remove("out"); c.hidden = false;
    clearTimeout(snapTimer); snapTimer = setTimeout(hideSnap, 4000);
    return true;
  }
  function hideSnap() {
    var c = $("vsnap"); if (c.hidden) return;
    clearTimeout(snapTimer);
    c.classList.add("out");
    setTimeout(function () {
      c.hidden = true; c.classList.remove("out"); $("videobox").style.minHeight = "";
      var m = cur(); if (m && !$("view-match").hidden) { if (isVideo(m) && !videoReady) $("video-ask").hidden = false; renderClockBar(m); renderEvents(m); }
    }, 180);
  }
  function snapActive() { return !$("vsnap").hidden; }
  function openMatch(id) {
    if (!matches[id] || matches[id].deleted) return;
    var sameView = !$("view-match").hidden && currentMatchId && currentMatchId !== id && isVideo(matches[id]) && vsMeta[id];
    if (!(sameView && snapFrame())) hideSnap();
    leaveSort();
    leavePanel();
    unloadVideo();
    listSel = null; stopPlayback(); padEdit = false; padSel = null; tlEdit = null; catSel = null; tlFilter = { team: "all", hideEmpty: false };
    currentMatchId = id; currentTagId = null; activeTeam = "home";
    $("view-home").hidden = true; $("view-match").hidden = false;
    renderMatch();
    vsTryLoad(matches[id]);
    window.scrollTo(0, 0);
    requestWake();
  }

  /* ============ Écran toujours allumé (si l'appareil l'autorise) ============ */
  var wake = null;
  function requestWake() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock.request("screen").then(function (w) { wake = w; }, function () {});
      }
    } catch (e) {}
  }
  function releaseWake() { try { if (wake) { wake.release(); wake = null; } } catch (e) {} }

  /* ============ Export CSV ============ */
  var exportId = null;
  var downloads = null;
  function csvCell(v, sep) {
    v = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    if (v.indexOf('"') >= 0 || v.indexOf(sep) >= 0 || /[\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }
  function buildCsv(m, sep) {
    var head = ["match", "date", "competition", "periode", "temps_match", "secondes_match", "temps_periode", "temps_video", "secondes_video", "clip_debut", "clip_fin", "clip_duree_s", "ligne", "evenement", "tiers", "couloir", "resultat", "note"];
    var rows = [head];
    var lineOf = {};
    tlRows(m).forEach(function (r, i) { r.tags.forEach(function (t) { lineOf[t.id] = i + 1; }); });
    var tags = m.tags.slice().sort(function (a, b) { return (a.p - b.p) || (a.t - b.t); });
    tags.forEach(function (t) {
      var mt = matchTime(t.p, t.t);
      rows.push([
        m.home + " - " + m.away, m.date || "", m.comp || "",
        PERIODS[t.p] ? PERIODS[t.p].name : t.p,
        fmt(mt), mt, fmt(t.t),
        t.v != null ? fmtLong(t.v) : "", t.v != null ? Math.floor(t.v) : "",
        t.v != null ? fmtLong(Math.max(0, t.v - pre(t))) : fmt(Math.max(0, mt - pre(t))),
        t.v != null ? fmtLong(t.v + post(t)) : fmt(mt + post(t)),
        Math.round((pre(t) + post(t)) * 10) / 10,
        lineOf[t.id] || "",
        tagLabel(t), t.third || "", t.lane || "", t.res || "", t.note || ""
      ]);
    });
    return "\uFEFF" + rows.map(function (r) { return r.map(function (c) { return csvCell(c, sep); }).join(sep); }).join("\r\n") + "\r\n";
  }
  function fileName(m) {
    var clean = function (s) { return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); };
    return (m.date || "match") + "_" + (clean(m.home) || "domicile") + "_" + (clean(m.away) || "exterieur") + ".csv";
  }
  function openExport(id) {
    var m = matches[id]; if (!m || m.deleted) return;
    exportId = id;
    $("export-desc").textContent = m.home + " – " + m.away + ", " + m.tags.length + (m.tags.length > 1 ? " tags" : " tag") + ". Une ligne par tag, à ouvrir dans Excel ou Numbers.";
    $("export-msg").textContent = "";
    $("export-text").hidden = true;
    $("export-save").hidden = !downloads;
    $("export-project").hidden = !downloads;
    renderSep();
    $("export-overlay").hidden = false;
    if (!downloads) showCsvText();
  }
  function renderSep() {
    var btns = document.querySelectorAll("#export-overlay [data-sep]");
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute("aria-pressed", String(btns[i].dataset.sep === prefs.sep));
    if (!$("export-text").hidden) showCsvText();
  }
  function showCsvText() {
    var m = matches[exportId]; if (!m) return;
    var ta = $("export-text");
    ta.value = buildCsv(m, prefs.sep).replace(/^\uFEFF/, "");
    ta.hidden = false;
  }
  function saveCsv() {
    var m = matches[exportId]; if (!m) return;
    if (!m.tags.length) { $("export-msg").textContent = "Ce match n'a encore aucun tag à exporter."; return; }
    if (!downloads) { showCsvText(); return; }
    $("export-msg").textContent = "";
    downloads.save({ filename: fileName(m), data: buildCsv(m, prefs.sep) }).then(function () {
      $("export-msg").textContent = "Fichier enregistré : " + fileName(m);
    }, function (err) {
      var code = err && err.code;
      if (code === "declined") $("export-msg").textContent = "Enregistrement annulé.";
      else if (code === "rate_limited") $("export-msg").textContent = "Une demande est déjà ouverte. Réessaie dans un instant.";
      else { $("export-msg").textContent = "L'enregistrement de fichier n'est pas disponible ici. Copie le CSV ci-dessous et colle-le dans un fichier."; showCsvText(); }
    });
  }
  function copyCsv() {
    showCsvText();
    var ta = $("export-text");
    var done = function () { $("export-msg").textContent = "CSV copié. Colle-le dans Notes, un mail ou un fichier .csv."; };
    var manual = function () {
      ta.focus(); ta.select();
      try { if (document.execCommand("copy")) { done(); return; } } catch (e) {}
      $("export-msg").textContent = "Le texte est sélectionné : fais Copier depuis le menu.";
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, manual);
      else manual();
    } catch (e) { manual(); }
  }

  /* ============ Événements d'interface ============ */
  var pendingVideo = null;
  function renderPendingVideo() {
    $("f-video-name").textContent = pendingVideo ? pendingVideo.name : "Aucune vidéo choisie. Sans vidéo, le match se tague en direct avec le chrono.";
    $("f-video-cta").textContent = pendingVideo ? "Changer de vidéo" : "Choisir la vidéo";
    $("f-video-clear").hidden = !pendingVideo;
  }
  $("f-video-btn").addEventListener("click", function () { $("f-video").value = ""; $("f-video").click(); });
  $("f-video").addEventListener("change", function () {
    var f = $("f-video").files && $("f-video").files[0];
    if (f) { pendingVideo = f; renderPendingVideo(); }
  });
  $("f-video-clear").addEventListener("click", function () { pendingVideo = null; renderPendingVideo(); });
  $("video-ask-btn").addEventListener("click", function () { videoAction("pick"); });
  $("new-match").addEventListener("submit", function (e) {
    e.preventDefault();
    var home = $("f-home").value.trim(), away = $("f-away").value.trim();
    if (!home || !away) { $("form-error").textContent = "Indique le nom des deux équipes."; return; }
    $("form-error").textContent = "";
    var m = {
      id: uid("m"), home: home, away: away, date: $("f-date").value || "", comp: $("f-comp").value.trim(),
      createdAt: Date.now(), updatedAt: Date.now(),
      period: 1, phase: "pre", clock: { running: false, startedAt: 0, acc: 0 }, tags: []
    };
    matches[m.id] = m;
    touch(m);
    $("f-home").value = ""; $("f-away").value = ""; $("f-comp").value = "";
    var pjSel = $("f-proj").value, pjD = pjSel && pjDoc(pjSel);
    if (pjD) { pjD.matchIds = (pjD.matchIds || []).concat([m.id]); touch(pjD); pjId = pjD.id; }
    var vf = pendingVideo; pendingVideo = null; renderPendingVideo();
    openMatch(m.id);
    if (vf) loadVideoFile(vf);
  });

  function delMatch(id) {
    var m = matches[id]; if (!m) return;
    snapshot(m);
    matches[m.id] = { id: m.id, deleted: true, updatedAt: Date.now() };
    saveLocal(); markDirty(m.id); vsRemove(m.id);
    renderHome();
    showToast("Match supprimé.", true);
  }
  $("match-list").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-mmenu]");
    if (b) {
      var id = b.dataset.mmenu, items = [["Exporter (CSV)", function () { openExport(id); }]];
      if (vsMeta[id]) items.push(["Libérer la vidéo", function () { vsRemove(id).then(function () { renderHome(); showToast("Vidéo retirée de l'appareil. Les tags sont conservés.", false); }); }]);
      items.push(["Supprimer le match", function () { delMatch(id); }, true]);
      openPop(b, items); return;
    }
    var row = e.target.closest("[data-open]"); if (row) openMatch(row.dataset.open);
  });
  $("match-list").addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.dataset && e.target.dataset.open) { e.preventDefault(); openMatch(e.target.dataset.open); } });
  /* Petit menu « ⋯ » */
  function openPop(anchor, items) {
    var pop = $("pop"); pop.textContent = "";
    items.forEach(function (it) { var b = el("button", it[2] ? "dg" : "", it[0]); b.type = "button"; b.addEventListener("click", function () { closePop(); it[1](); }); pop.appendChild(b); });
    pop.hidden = false;
    var r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + "px";
    pop.style.top = (r.bottom + 6 + h > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + "px";
  }
  function closePop() { $("pop").hidden = true; $("pr-menu").hidden = true; $("pr-more").setAttribute("aria-expanded", "false"); }
  document.addEventListener("click", function (e) { if (!e.target.closest("#pop, [data-mmenu], [data-pmenu], #pr-more, #pr-menu")) closePop(); });
  window.addEventListener("scroll", function () { if (!$("pop").hidden) closePop(); }, { passive: true });
  $("pr-more").addEventListener("click", function () { var m = $("pr-menu"); $("pop").hidden = true; m.hidden = !m.hidden; $("pr-more").setAttribute("aria-expanded", String(!m.hidden)); $("pr-conn").hidden = !$("btn-sync"); });
  $("pr-menu").addEventListener("click", function (e) { if (e.target.closest("button")) setTimeout(closePop, 0); });
  $("pr-conn").addEventListener("click", function () { var b = $("btn-sync"); if (b) b.click(); });
  var prTab = null;
  function renderPrTabs() {
    var np = projects().length, nm = liveMatches().length;
    if (!prTab) prTab = np ? "projects" : "matches";
    $("pr-tab-p").textContent = "Projets · " + np; $("pr-tab-m").textContent = "Matchs · " + nm;
    $("pr-tab-p").setAttribute("aria-selected", String(prTab === "projects")); $("pr-tab-m").setAttribute("aria-selected", String(prTab === "matches"));
    $("pr-projects").hidden = prTab !== "projects"; $("pr-matches").hidden = prTab !== "matches";
    $("pr-new").textContent = prTab === "projects" ? "+ Nouveau projet" : "+ Nouveau match";
  }
  document.querySelector(".pr-seg").addEventListener("click", function (e) { var b = e.target.closest("[data-prtab]"); if (!b) return; prTab = b.dataset.prtab; $("pj-form").hidden = true; renderPrTabs(); });
  $("pr-new").addEventListener("click", function () { if (prTab === "projects") openPjForm(null); else showHome("new"); });

  $("btn-back").addEventListener("click", function () { showHome("projects"); });

  /* ============ Projets : plusieurs matchs, onglets, page Trier ============ */
  var pjId = null, pjEditing = null;
  function projects() {
    return Object.keys(matches).map(function (k) { return matches[k]; })
      .filter(function (a) { return a && !a.deleted && a.kind === "project"; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }
  function pjDoc(id) { var a = matches[id || pjId]; return a && !a.deleted && a.kind === "project" ? a : null; }
  function pjMatches(a) { return (a.matchIds || []).map(function (id) { return matches[id]; }).filter(function (m) { return m && !m.deleted && Array.isArray(m.tags); }); }
  function pjOf(matchId) { var l = projects(); for (var i = 0; i < l.length; i++) if ((l[i].matchIds || []).indexOf(matchId) >= 0) return l[i]; return null; }
  /* Nom court d'un match dans un projet : l'adversaire (l'équipe qui n'est pas commune à tous les matchs). */
  function pjLabel(a, m) {
    var ms = pjMatches(a), common = null;
    if (ms.length >= 2) [m.home, m.away].forEach(function (t) { if (!common && ms.every(function (x) { return x.home === t || x.away === t; })) common = t; });
    var lab = common ? (m.home === common ? m.away : m.home) : m.home + " – " + m.away;
    return lab.length > 22 ? lab.slice(0, 21) + "…" : lab;
  }
  function renderPjHome() {
    var list = $("pj-list"); list.textContent = "";
    projects().forEach(function (a) {
      var c = el("div", "pj-card");
      var head = el("div"); head.appendChild(el("div", "n", a.name));
      var ms = pjMatches(a), n = 0; ms.forEach(function (m) { n += m.tags.length; });
      head.appendChild(el("div", "m", ms.length + (ms.length > 1 ? " matchs · " : " match · ") + n + (n > 1 ? " tags" : " tag")));
      c.appendChild(head);
      var chips = el("div", "pj-chips"); ms.forEach(function (m) { chips.appendChild(el("span", "pj-chip", pjLabel(a, m))); }); c.appendChild(chips);
      var o = el("button", "btn primary open", "Ouvrir"); o.type = "button"; o.dataset.popen = a.id; c.appendChild(o);
      var d = el("button", "dots-btn", "⋯"); d.type = "button"; d.dataset.pmenu = a.id; d.setAttribute("aria-label", "Options du projet"); c.appendChild(d);
      list.appendChild(c);
    });
    var nw = el("button", "pj-new", "+ Nouveau projet"); nw.type = "button"; nw.dataset.pnew = "1"; list.appendChild(nw);
  }
  function openPjForm(a) {
    pjEditing = a ? a.id : null;
    var box = $("pj-checks"); box.textContent = "";
    var ms = liveMatches();
    ms.forEach(function (m) {
      var lab = el("label"), cb = el("input"); cb.type = "checkbox"; cb.value = m.id;
      cb.checked = !!(a && (a.matchIds || []).indexOf(m.id) >= 0);
      lab.appendChild(cb);
      var meta = [m.home + " – " + m.away]; if (m.date) meta.push(m.date.split("-").reverse().join("/")); meta.push(m.tags.length + " tags");
      if (vsMeta[m.id]) meta.push("vidéo gardée");
      lab.appendChild(el("span", "", meta.join(" · ")));
      box.appendChild(lab);
    });
    if (!ms.length) box.appendChild(el("p", "pj-none", "Aucun match pour l'instant. Tu peux créer le projet maintenant, puis lui ajouter des matchs avec « Nouveau match »."));
    $("pj-name").value = a ? a.name : "";
    $("pj-err").textContent = "";
    $("pj-submit").textContent = a ? "Enregistrer" : "Créer le projet";
    prTab = "projects"; renderPrTabs();
    $("pj-form").hidden = false;
    $("pj-form").scrollIntoView({ block: "nearest" });
    $("pj-name").focus();
  }
  $("pj-cancel").addEventListener("click", function () { $("pj-form").hidden = true; pjEditing = null; });
  $("pj-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var ids = [].slice.call($("pj-checks").querySelectorAll("input:checked")).map(function (c) { return c.value; });
    var name = $("pj-name").value.trim();
    var a = pjEditing && pjDoc(pjEditing);
    if (a) {
      var keep = (a.matchIds || []).filter(function (id) { return ids.indexOf(id) >= 0; });
      ids.forEach(function (id) { if (keep.indexOf(id) < 0) keep.push(id); });
      a.matchIds = keep; a.name = name || a.name;
    } else {
      /* Ordre : du plus ancien au plus récent */
      ids.sort(function (x, y) { var mx = matches[x], my = matches[y]; return ((mx.date || "") + (mx.createdAt || 0)).localeCompare((my.date || "") + (my.createdAt || 0)); });
      a = { id: uid("p"), kind: "project", name: name || "Projet", matchIds: ids, stars: {}, createdAt: Date.now() };
      matches[a.id] = a;
    }
    touch(a);
    $("pj-form").hidden = true; pjEditing = null;
    pjId = a.id;
    var first = pjMatches(a)[0];
    if (first) openMatch(first.id);
    else { renderHome(); showToast("Projet créé. Ajoute-lui des matchs avec « Nouveau match », en choisissant ce projet.", false); }
  });
  function delProject(id) {
    var p = matches[id]; if (!p) return;
    snapshot(p);
    matches[p.id] = { id: p.id, deleted: true, updatedAt: Date.now() };
    saveLocal(); markDirty(p.id); renderHome();
    showToast("Projet supprimé. Ses matchs, eux, sont conservés.", true);
  }
  $("pj-list").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.pnew) { openPjForm(null); return; }
    if (b.dataset.pmenu) { var id = b.dataset.pmenu; openPop(b, [["Modifier", function () { openPjForm(pjDoc(id)); }], ["Supprimer le projet", function () { delProject(id); }, true]]); return; }
    if (b.dataset.popen) { var a = pjDoc(b.dataset.popen); if (!a) return; pjId = a.id; var ms = pjMatches(a); var last = ms.filter(function (m) { return m.id === a.last; })[0] || ms[0]; if (last) openMatch(last.id); else openPjForm(a); }
    else if (b.dataset.pedit) openPjForm(pjDoc(b.dataset.pedit));
    else if (b.dataset.pdel) {
      var p = matches[b.dataset.pdel]; if (!p) return;
      snapshot(p);
      matches[p.id] = { id: p.id, deleted: true, updatedAt: Date.now() };
      saveLocal(); markDirty(p.id); renderHome();
      showToast("Projet supprimé. Ses matchs, eux, sont conservés.", true);
    }
  });
  function renderPTabs(m) {
    var box = $("ptabs");
    var a = pjId && pjDoc() && (pjDoc().matchIds || []).indexOf(m.id) >= 0 ? pjDoc() : pjOf(m.id);
    pjId = a ? a.id : null;
    box.hidden = !a; box.textContent = "";
    if (!a) return;
    if (a.last !== m.id) { a.last = m.id; saveLocal(); }
    pjMatches(a).forEach(function (x) {
      var b = el("button", "ptab" + (x.id === m.id ? " on" : "")); b.type = "button"; b.dataset.ptab = x.id;
      if (vsMeta[x.id]) { var d = el("span", "dot"); d.title = "Vidéo gardée sur l'appareil"; b.appendChild(d); }
      b.appendChild(document.createTextNode(pjLabel(a, x)));
      b.title = x.home + " – " + x.away;
      box.appendChild(b);
    });
    var add = el("button", "ptab add", "+"); add.type = "button"; add.dataset.padd = "1"; add.setAttribute("aria-label", "Ajouter un match au projet"); box.appendChild(add);
    box.appendChild(el("span", "sep"));
    var so = el("button", "ptab sort", "⇅ Trier"); so.type = "button"; so.dataset.psort = "1"; box.appendChild(so);
  }
  $("ptabs").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.ptab) { if (!cur() || cur().id !== b.dataset.ptab) openMatch(b.dataset.ptab); }
    else if (b.dataset.padd) { var a = pjDoc(); if (!a) return; showHome("projects"); openPjForm(a); }
    else if (b.dataset.psort) openSort();
  });

  /* ---- Page Trier ---- */
  var sv = { cat: null, match: "all", cur: null, end: null, star: false, mid: null, pending: null, back: null };
  var svUrls = {};   // vidéos ouvertes pendant la séance, par match
  function svGroups(a) {
    var g = {}, order = [];
    /* Tous les boutons du panel apparaissent, même sans clip, comme sur l'écran du match */
    padButtons().forEach(function (b) { if (!g[b.label]) { g[b.label] = { label: b.label, color: b.color, clips: [] }; order.push(b.label); } });
    pjMatches(a).forEach(function (m) {
      m.tags.forEach(function (t) {
        var k = tagLabel(t);
        if (!g[k]) { g[k] = { label: k, color: tagColor(t), clips: [] }; order.push(k); }
        g[k].clips.push({ m: m, t: t, key: m.id + ":" + t.id });
      });
    });
    var pos = {}; padButtons().forEach(function (b, i) { if (!(b.label in pos)) pos[b.label] = i; });
    order.sort(function (x, y) { return (x in pos ? pos[x] : 999) - (y in pos ? pos[y] : 999) || x.localeCompare(y); });
    return order.map(function (k) {
      g[k].clips.sort(function (p, q) { return (a.matchIds.indexOf(p.m.id) - a.matchIds.indexOf(q.m.id)) || ((tlPos(p.m, p.t) || 0) - (tlPos(q.m, q.t) || 0)); });
      return g[k];
    });
  }
  function svFilter(a, clips) {
    return clips.filter(function (c) { return (sv.match === "all" || c.m.id === sv.match) && (!sv.star || (a.stars && a.stars[c.key])); });
  }
  function svVisible(a) { var g = svGroups(a).filter(function (x) { return x.label === sv.cat; })[0]; return g ? svFilter(a, g.clips) : []; }
  function openSort() {
    var a = pjDoc(); if (!a) return;
    sv.back = currentMatchId;
    savePos(true); unloadVideo(); currentMatchId = null; currentTagId = null;
    sv.cur = null; sv.end = null; sv.mid = null; sv.pending = null;
    if (sv.match !== "all" && (a.matchIds || []).indexOf(sv.match) < 0) sv.match = "all";
    $("view-home").hidden = true; $("view-match").hidden = true; $("view-sort").hidden = false;
    var v = $("sv-video"); v.pause(); v.removeAttribute("src"); delete v.dataset.match; v.load();
    svEmpty("Choisis un tag à gauche, puis un clip.", false);
    renderSort(); window.scrollTo(0, 0); requestWake();
  }
  function leaveSort() {
    if ($("view-sort").hidden) return;
    if (svRec) svRecCancel("");
    var v = $("sv-video"); v.pause(); v.removeAttribute("src"); delete v.dataset.match; v.load();
    Object.keys(svUrls).forEach(function (k) { try { URL.revokeObjectURL(svUrls[k]); } catch (e) {} }); svUrls = {};
    $("view-sort").hidden = true;
  }
  $("sv-back").addEventListener("click", function () {
    var a = pjDoc(), back = sv.back && matches[sv.back] ? sv.back : (a && pjMatches(a)[0] ? pjMatches(a)[0].id : null);
    if (back) openMatch(back); else showHome("projects");
  });
  function renderSort() {
    var a = pjDoc(); if (!a) { leaveSort(); showHome("projects"); return; }
    var ms = pjMatches(a);
    $("sv-head").textContent = "Trier · " + a.name;
    var seg = $("sv-seg"); seg.textContent = "";
    var all = el("button", sv.match === "all" ? "on" : "", "Tous les matchs"); all.type = "button"; all.dataset.smatch = "all"; seg.appendChild(all);
    ms.forEach(function (m) {
      var b = el("button", sv.match === m.id ? "on" : ""); b.type = "button"; b.dataset.smatch = m.id; b.title = m.home + " – " + m.away;
      if (vsMeta[m.id]) b.appendChild(el("span", "dot"));
      b.appendChild(document.createTextNode(pjLabel(a, m)));
      seg.appendChild(b);
    });
    $("sv-star-only").setAttribute("aria-pressed", String(sv.star));
    var list = $("sv-cats"); list.textContent = "";
    var groups = svGroups(a);
    if (sv.cat && !groups.some(function (x) { return x.label === sv.cat; })) sv.cat = null;
    $("sv-cat-back").hidden = !sv.cat;
    if (!sv.cat) {
      $("sv-side-title").textContent = sv.match === "all" ? "Par tag · tous les matchs" : "Par tag · " + pjLabel(a, matches[sv.match]);
      var shown = 0;
      groups.forEach(function (g, i) {
        var n = svFilter(a, g.clips).length;
        var li = el("li"), b = el("button"); b.type = "button"; b.dataset.scat = g.label;
        if (!n) b.className = "zero";
        b.appendChild(el("span", "nn", String(i + 1)));
        var sw = el("span", "sw"); sw.style.background = g.color; b.appendChild(sw);
        b.appendChild(el("span", "nm", g.label));
        b.appendChild(el("span", "ct", n + (n > 1 ? " clips" : " clip")));
        li.appendChild(b); list.appendChild(li); shown++;
      });
      if (!shown) list.appendChild(el("li", "cat-none", "Aucun tag dans ton panel."));
      else if (sv.star && !groups.some(function (g) { return svFilter(a, g.clips).length; })) list.insertBefore(el("li", "cat-none", "Aucun clip gardé pour l'instant. Ouvre un tag et touche ☆ sur un clip pour le garder."), list.firstChild);
    } else {
      var clips = svVisible(a), total = (groups.filter(function (x) { return x.label === sv.cat; })[0] || { clips: [] }).clips.length;
      $("sv-side-title").textContent = sv.cat + " · " + clips.length + (clips.length !== total ? " / " + total : "");
      var lastM = null;
      clips.forEach(function (c) {
        if (c.m !== lastM) { lastM = c.m; list.appendChild(el("li", "sv-grp", c.m.home + " – " + c.m.away)); }
        var li = el("li", "sv-clip" + (sv.cur && sv.cur.key === c.key ? " on" : ""));
        var b = el("button"); b.type = "button"; b.dataset.sclip = c.key;
        var x = tlPos(c.m, c.t);
        b.appendChild(el("span", "tm", x != null ? fmt(x) : "--:--"));
        b.appendChild(el("span", "nm", c.t.note || c.t.res || ""));
        var on = !!(a.stars && a.stars[c.key]);
        var st = el("button", "st", on ? "★" : "☆"); st.type = "button"; st.dataset.sstar = c.key;
        st.setAttribute("aria-pressed", String(on)); st.setAttribute("aria-label", "Garder ce clip");
        li.appendChild(b); li.appendChild(st); list.appendChild(li);
      });
      if (!clips.length) list.appendChild(el("li", "cat-none", sv.star ? "Aucun clip gardé dans ce tag." : "Aucun clip de ce tag dans ce match."));
    }
    renderSvBar();
  }
  var PLAY_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>';
  var PAUSE_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
  function renderSvExport(a) {
    var b = $("sv-export"); if (!b) return;
    var clips = a && sv.cat ? svVisible(a) : [];
    var dur = 0; clips.forEach(function (c) { dur += pre(c.t) + post(c.t); });
    b.disabled = !clips.length || !!svRec;
    b.textContent = clips.length ? "Exporter le montage (" + clips.length + (clips.length > 1 ? " clips · " : " clip · ") + fmt(dur) + ")" : "Exporter le montage";
    b.title = sv.cat ? "" : "Ouvre un tag pour exporter ses clips";
  }
  function renderSvBar() {
    var a = pjDoc(), v = $("sv-video");
    renderSvExport(a);
    $("sv-play").innerHTML = v.paused ? PLAY_SVG : PAUSE_SVG;
    var now = $("sv-now"); now.textContent = "";
    if (!sv.cur || !a) {
      if (sv.mid && matches[sv.mid]) now.textContent = matches[sv.mid].home + " – " + matches[sv.mid].away;
      $("sv-star").hidden = true; return;
    }
    var x = tlPos(sv.cur.m, sv.cur.t);
    now.appendChild(document.createTextNode(tagLabel(sv.cur.t) + " · " + sv.cur.m.home + " – " + sv.cur.m.away + " · " + (x != null ? fmt(x) : "")));
    var clips = svVisible(a), i = clips.map(function (c) { return c.key; }).indexOf(sv.cur.key);
    if (i >= 0) now.appendChild(el("span", "pos", "clip " + (i + 1) + " / " + clips.length));
    var on = !!(a.stars && a.stars[sv.cur.key]);
    $("sv-star").hidden = false; $("sv-star").textContent = on ? "★ Gardé" : "☆ Garder"; $("sv-star").setAttribute("aria-pressed", String(on));
  }
  function svEmpty(text, btn) { $("sv-empty").hidden = false; $("sv-empty-text").textContent = text; $("sv-empty-btn").hidden = !btn; }
  /* Donne l'adresse de la vidéo d'un match : déjà ouverte, gardée sur l'appareil, ou rien. */
  function svUrl(m) {
    if (svUrls[m.id]) return Promise.resolve(svUrls[m.id]);
    return vsGet(m.id).then(function (f) { if (!f) return null; svUrls[m.id] = URL.createObjectURL(f); return svUrls[m.id]; });
  }
  /* Ouvre la vidéo d'un match dans le lecteur, puis lance at() une fois prête. */
  function svOpen(m, at) {
    var v = $("sv-video");
    if (!isVideo(m)) { v.pause(); svEmpty("Ce match a été tagué sans vidéo.", false); return; }
    svUrl(m).then(function (url) {
      if ($("view-sort").hidden) return;
      if (!url) {
        v.pause(); sv.pending = { m: m, at: at };
        svEmpty("La vidéo de " + m.home + " – " + m.away + " n'est pas encore sur cet appareil." + (m.video && m.video.name ? " (" + m.video.name + ")" : "") + " Choisis-la une fois, elle sera gardée.", true);
        return;
      }
      $("sv-empty").hidden = true;
      if (v.dataset.match !== m.id) { v.dataset.match = m.id; v.src = url; v.addEventListener("loadedmetadata", at, { once: true }); v.load(); }
      else at();
    });
  }
  function svPlay(c) {
    sv.cur = c; sv.end = null; sv.mid = c.m.id;
    var start = Math.max(0, tlPos(c.m, c.t) - pre(c.t)), end = tlPos(c.m, c.t) + post(c.t);
    svOpen(c.m, function () { var v = $("sv-video"); try { v.currentTime = start; } catch (err) {} sv.end = end; var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); });
    renderSort();
  }
  function svShowMatch(m) {
    sv.cur = null; sv.end = null; sv.mid = m.id;
    svOpen(m, function () { var v = $("sv-video"); v.pause(); try { v.currentTime = (m.video && m.video.pos) || 0; } catch (err) {} });
  }
  /* ---- Export du montage : les clips affichés, à la suite, dans un seul fichier ---- */
  var svRec = null;
  function svExport() {
    var a = pjDoc(); if (!a || !sv.cat || svRec) return;
    var clips = svVisible(a); if (!clips.length) return;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream || !downloads) { recUnavailable(); return; }
    var mids = []; clips.forEach(function (c) { if (mids.indexOf(c.m.id) < 0) mids.push(c.m.id); });
    Promise.all(mids.map(function (id) { return svUrl(matches[id]); })).then(function (urls) {
      var missing = mids.filter(function (id, i) { return !urls[i]; });
      if (missing.length) { showToast("Il manque la vidéo de : " + missing.map(function (id) { return matches[id].home + " – " + matches[id].away; }).join(", ") + ". Ouvre un de ses clips pour la choisir.", false); return; }
      svRecStart(a, clips);
    });
  }
  function svRecStart(a, clips) {
    var v = $("sv-video"); v.pause(); sv.end = null;
    var W = 1280, H = 720;
    var canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    var mime = pickMime(), rec;
    try { rec = new MediaRecorder(canvas.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 5000000 } : undefined); }
    catch (e) { recUnavailable(); return; }
    var chunks = [], name = (a.name + " - " + sv.cat).replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
    var st = svRec = { clips: clips, i: 0, rec: rec, ctx: ctx, cancelled: false, raf: 0, lastT: -1, lastMove: Date.now(), muted: v.muted };
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      v.pause(); v.muted = st.muted; svRec = null; renderSvExport(pjDoc());
      if (st.cancelled) { if (!st.msg) $("rec-overlay").hidden = true; return; }
      if (!chunks.length) { $("rec-msg").textContent = "L'enregistrement n'a rien produit. Réessaie."; $("rec-cancel").textContent = "Fermer"; return; }
      var type = rec.mimeType || mime || "video/webm", ext = /mp4/.test(type) ? "mp4" : "webm";
      var blob = new Blob(chunks, { type: type });
      $("rec-msg").textContent = "Montage prêt. Confirme l'enregistrement du fichier.";
      $("rec-cancel").textContent = "Fermer";
      downloads.save({ filename: name + "." + ext, data: blob }).then(function () {
        $("rec-overlay").hidden = true; showToast("Montage enregistré : " + name + "." + ext, false);
      }, function (err) {
        var code = err && err.code;
        $("rec-msg").textContent = code === "declined" ? "Enregistrement annulé." : (code === "too_large" ? "Le fichier est trop lourd. Exporte moins de clips à la fois." : "Le fichier n'a pas pu être enregistré ici.");
      });
    };
    v.muted = true;
    $("rec-cancel").textContent = "Annuler"; $("rec-overlay").hidden = false;
    try { rec.start(1000); rec.pause(); } catch (e) { svRec = null; $("rec-overlay").hidden = true; recUnavailable(); return; }
    renderSvExport(a);
    svRecNext(st);
  }
  function svDraw(st) {
    var v = $("sv-video"), vw = v.videoWidth || 16, vh = v.videoHeight || 9, k = Math.min(1280 / vw, 720 / vh), dw = vw * k, dh = vh * k;
    st.ctx.fillStyle = "#000"; st.ctx.fillRect(0, 0, 1280, 720);
    try { st.ctx.drawImage(v, (1280 - dw) / 2, (720 - dh) / 2, dw, dh); } catch (e) {}
  }
  function svRecNext(st) {
    if (svRec !== st || st.cancelled) return;
    if (st.i >= st.clips.length) { try { st.rec.stop(); } catch (e) {} return; }
    var c = st.clips[st.i], v = $("sv-video");
    sv.cur = c; sv.mid = c.m.id; renderSort();
    $("rec-msg").textContent = "Montage : clip " + (st.i + 1) + " sur " + st.clips.length + ", enregistré en temps réel. Garde cette page ouverte et l'écran allumé.";
    var start = Math.max(0, tlPos(c.m, c.t) - pre(c.t)), end = tlPos(c.m, c.t) + post(c.t);
    var started = false;
    var go = function () {
      if (started || svRec !== st || st.cancelled) return;
      started = true; v.removeEventListener("seeked", go);
      var stop = isFinite(v.duration) ? Math.min(end, v.duration - 0.05) : end;
      svDraw(st);
      try { st.rec.resume(); } catch (e) {}
      var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
      st.lastT = -1; st.lastMove = Date.now();
      var frame = function () {
        if (svRec !== st || st.cancelled) return;
        svDraw(st);
        var t = v.currentTime;
        if (t !== st.lastT) { st.lastT = t; st.lastMove = Date.now(); }
        if (t >= stop || v.ended) { v.pause(); try { st.rec.pause(); } catch (e) {} st.i++; svRecNext(st); return; }
        if (Date.now() - st.lastMove > 8000) { svRecCancel("La lecture s'est arrêtée pendant l'enregistrement. Réessaie en gardant la page au premier plan."); return; }
        st.raf = requestAnimationFrame(frame);
      };
      st.raf = requestAnimationFrame(frame);
    };
    var seek = function () { v.addEventListener("seeked", go); try { v.currentTime = start; } catch (e) {} setTimeout(go, 2500); };
    svUrl(c.m).then(function (url) {
      if (svRec !== st || st.cancelled) return;
      if (!url) { svRecCancel("La vidéo de " + c.m.home + " – " + c.m.away + " n'est plus disponible."); return; }
      $("sv-empty").hidden = true;
      if (v.dataset.match !== c.m.id) { v.dataset.match = c.m.id; v.src = url; v.addEventListener("loadedmetadata", seek, { once: true }); v.load(); }
      else seek();
    });
  }
  function svRecCancel(msg) {
    var st = svRec; if (!st) return;
    st.cancelled = true; st.msg = msg || ""; cancelAnimationFrame(st.raf);
    if (msg) { $("rec-msg").textContent = msg; $("rec-cancel").textContent = "Fermer"; try { st.rec.stop(); } catch (e) {} $("rec-overlay").hidden = false; return; }
    try { st.rec.stop(); } catch (e) { svRec = null; }
    $("rec-overlay").hidden = true;
  }
  $("sv-export").addEventListener("click", svExport);
  $("rec-cancel").addEventListener("click", function () { if (svRec) svRecCancel(""); });
  function svStep(d) {
    var a = pjDoc(); if (!a || !sv.cat) return;
    var clips = svVisible(a); if (!clips.length) return;
    var i = sv.cur ? clips.map(function (c) { return c.key; }).indexOf(sv.cur.key) : -1;
    svPlay(clips[i < 0 ? 0 : Math.min(clips.length - 1, Math.max(0, i + d))]);
  }
  function svFind(key) { var a = pjDoc(); if (!a) return null; var r = null; svGroups(a).forEach(function (g) { g.clips.forEach(function (c) { if (c.key === key) r = c; }); }); return r; }
  function svToggle() { var v = $("sv-video"); if (!v.getAttribute("src")) { svStep(0); return; } if (v.paused) { if (sv.cur && sv.end == null && v.currentTime >= tlPos(sv.cur.m, sv.cur.t) + post(sv.cur.t) - 0.3) { svPlay(sv.cur); return; } var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } else v.pause(); }
  $("sv-video").addEventListener("timeupdate", function () { var v = $("sv-video"); if (sv.end != null && v.currentTime >= sv.end) { v.pause(); sv.end = null; } });
  $("sv-video").addEventListener("play", renderSvBar);
  $("sv-video").addEventListener("pause", renderSvBar);
  $("sv-video").addEventListener("click", svToggle);
  $("sv-play").addEventListener("click", svToggle);
  $("sv-prev").addEventListener("click", function () { svStep(-1); });
  $("sv-next").addEventListener("click", function () { svStep(1); });
  function svStar(key) { var a = pjDoc(); if (!a) return; a.stars = a.stars || {}; if (a.stars[key]) delete a.stars[key]; else a.stars[key] = true; touch(a); renderSort(); }
  $("sv-star").addEventListener("click", function () { if (sv.cur) svStar(sv.cur.key); });
  $("sv-star-only").addEventListener("click", function () { sv.star = !sv.star; renderSort(); });
  $("sv-cat-back").addEventListener("click", function () { sv.cat = null; renderSort(); });
  $("sv-seg").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-smatch]"); if (!b) return;
    sv.match = b.dataset.smatch;
    if (sv.match !== "all" && matches[sv.match] && (!sv.cur || sv.cur.m.id !== sv.match)) svShowMatch(matches[sv.match]);
    renderSort();
  });
  $("sv-cats").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.scat) { sv.cat = b.dataset.scat; renderSort(); $("sv-cats").scrollTop = 0; }
    else if (b.dataset.sstar) svStar(b.dataset.sstar);
    else if (b.dataset.sclip) { var c = svFind(b.dataset.sclip); if (c) svPlay(c); }
  });
  $("sv-empty-btn").addEventListener("click", function () { $("sv-one").value = ""; $("sv-one").click(); });
  $("sv-one").addEventListener("change", function () {
    var f = $("sv-one").files && $("sv-one").files[0], p = sv.pending; if (!f || !p) return;
    sv.pending = null;
    if (svUrls[p.m.id]) { try { URL.revokeObjectURL(svUrls[p.m.id]); } catch (e) {} }
    svUrls[p.m.id] = URL.createObjectURL(f);
    if (p.m.video && !p.m.video.name) { p.m.video.name = f.name; touch(p.m); }
    vsSave(p.m, f);
    svOpen(p.m, p.at);
  });
  $("go-new").addEventListener("click", function () { showHome("new"); });
  $("go-projects").addEventListener("click", function () { showHome("projects"); });
  $("go-panel").addEventListener("click", openPanelEditor);
  $("panel-back").addEventListener("click", function () { showHome("menu"); });
  $("view-home").addEventListener("click", function (e) { var b = e.target.closest("[data-home]"); if (b) showHome(b.dataset.home); });
  $("btn-export").addEventListener("click", function () { if (currentMatchId) openExport(currentMatchId); });
  $("clockbar").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b || !b.dataset.clock) return;
    var a = b.dataset.clock;
    if (/^(pick|k1|k2|rate|v[a-z0-9]+)$/.test(a)) videoAction(a);
    else clockAction(a);
  });
  $("video-file").addEventListener("change", function () {
    var f = $("video-file").files && $("video-file").files[0];
    if (f) loadVideoFile(f);
  });
  vid = $("video");
  vid.addEventListener("loadedmetadata", function () {
    var m = cur(); if (!m || !isVideo(m)) return;
    videoReady = true;
    vid.playbackRate = rate;
    /* Le cadre prend exactement les proportions de la vidéo : plus de bandes noires. */
    var ratio = vid.videoWidth && vid.videoHeight ? vid.videoWidth / vid.videoHeight : 16 / 9;
    vid.style.aspectRatio = String(ratio);
    vid.style.width = "min(100%, calc(var(--vmax) * " + ratio.toFixed(4) + "))";
    vid.style.height = "auto"; vid.style.maxHeight = "none";
    $("video-msg").hidden = true;
    var pos = m.video.pos || 0;
    if (pos > 0 && isFinite(vid.duration) && pos < vid.duration - 1) { try { vid.currentTime = pos; } catch (e) {} }
    renderMatch();
  });
  vid.addEventListener("error", function () { if (vid.getAttribute("src")) videoError(); });
  vid.addEventListener("play", function () { var m = cur(); if (m) renderClockBar(m); });
  vid.addEventListener("pause", function () { var m = cur(); if (m) { savePos(true); renderClockBar(m); } });
  function hideSnapSoon() {
    if (!snapActive()) return;
    var done = function () { setTimeout(function () { if (videoReady) { hideSnap(); var m = cur(); if (m) { renderClockBar(m); renderEvents(m); } } }, 120); };
    if (vid.requestVideoFrameCallback) { var fired = false; vid.requestVideoFrameCallback(function () { if (!fired) { fired = true; done(); } }); setTimeout(function () { if (!fired) { fired = true; done(); } }, 400); }
    else setTimeout(done, 250);
  }
  vid.addEventListener("seeked", function () { if (play) play.waiting = false; renderClock(); if (videoReady && snapActive()) hideSnapSoon(); });
  vid.addEventListener("loadeddata", function () { var m = cur(); if (videoReady && snapActive() && !(m && m.video && m.video.pos > 0)) hideSnapSoon(); });
  vid.addEventListener("timeupdate", playTick);
  $("team-toggle").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    activeTeam = b.dataset.team;
    var m = cur(); if (m) { renderEvents(m); if (!currentTag()) renderCurrent(m); }
  });
  $("event-grid").addEventListener("click", function (e) {
    if (padEdit) {
      /* En édition, un toucher sélectionne ; seul le bouton sélectionné peut ensuite être déplacé. */
      var sel = e.target.closest("[data-item]"); var mm = cur(); if (!mm) return;
      var id = sel ? sel.dataset.item : null;
      if (id !== padSel) { padSel = id; renderEvents(mm); }
      return;
    }
    var b = e.target.closest("button"); if (!b || b.disabled) return;
    var it = itemById(b.dataset.item); if (!it || it.type !== "button") return;
    activeTeam = it.team;
    if (it.dur === "toggle") toggleTag(it); else addTag(it.key, it.label, it.id, it.color);
  });
  $("zones").addEventListener("click", function (e) {
    var b = e.target.closest("button"); var m = cur(); var tag = currentTag();
    if (!b || !m || !tag) return;
    if (tag.third === b.dataset.third && tag.lane === b.dataset.lane) { tag.third = ""; tag.lane = ""; }
    else { tag.third = b.dataset.third; tag.lane = b.dataset.lane; }
    touch(m); renderCurrent(m); renderLog(m);
  });
  $("results").addEventListener("click", function (e) {
    var b = e.target.closest("button"); var m = cur(); var tag = currentTag();
    if (!b || !m || !tag) return;
    tag.res = tag.res === b.dataset.res ? "" : b.dataset.res;
    touch(m); renderMatch();
  });
  var noteTimer = null;
  $("note").addEventListener("input", function () {
    var m = cur(); var tag = currentTag(); if (!m || !tag) return;
    tag.note = $("note").value.slice(0, 120);
    saveLocal();
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { touch(m); renderLog(m); }, 600);
  });
  $("btn-swap").addEventListener("click", function () {
    var m = cur(); var tag = currentTag(); if (!m || !tag) return;
    tag.team = tag.team === "home" ? "away" : "home";
    touch(m); renderMatch();
  });
  $("tag-list").addEventListener("click", function (e) {
    var b = e.target.closest("button"); var m = cur(); if (!b || !m) return;
    if (b.dataset.seek) {
      var st = findTag(m, b.dataset.seek);
      if (st && st.v != null) {
        playClips([clipOf(m, st)]);
        $("videobox").scrollIntoView({ block: "nearest" });
      }
    } else if (b.dataset.tolist) {
      var l = curList(m) || newList(m);
      listSel = l.id;
      if (l.tags.indexOf(b.dataset.tolist) < 0) l.tags.push(b.dataset.tolist);
      touch(m); renderLists(m);
      showToast("Ajouté à « " + l.name + " ».", false);
    } else if (b.dataset.select) {
      currentTagId = b.dataset.select; renderCurrent(m); renderLog(m);
    } else if (b.dataset.deltag) {
      deleteTag(m, b.dataset.deltag);
    }
  });
  var tlEdit = null, lastTlTap = { id: null, at: 0 }, tlDrag = null;
  function r1(x) { return Math.round(x * 10) / 10; }
  function clipSpan(m, t) { var p = tlPos(m, t); return { pos: p, s: Math.max(0, p - pre(t)), e: p + post(t) }; }
  /* Place un clip entre s et e ; le moment du tag reste à l'intérieur. */
  function setClip(m, t, s, e, pos) {
    pos = Math.min(e, Math.max(s, pos));
    if (isVideo(m)) { t.v = r1(pos); var d = derive(m, t.v); t.p = d.p; t.t = d.t; pos = t.v; }
    else { var base = (PERIODS[t.p] ? PERIODS[t.p].base : 0) * 60; t.t = Math.max(0, Math.round(pos - base)); pos = base + t.t; }
    t.d0 = Math.max(0, r1(pos - s)); t.d1 = Math.max(0, r1(e - pos));
  }
  function splitTag(m, tag) {
    var c = clipSpan(m, tag); if (c.pos == null || c.e - c.s < 2) { showToast("Ce clip est trop court pour être coupé.", false); return; }
    var x = isVideo(m) && videoReady ? vid.currentTime : null;
    var atHead = x != null && x > c.s + 0.5 && x < c.e - 0.5;
    if (!atHead) x = (c.s + c.e) / 2;
    stopPlayback();
    snapshot(m);
    var copy = JSON.parse(JSON.stringify(tag)); copy.id = uid("t"); copy.note = "";
    setClip(m, tag, c.s, x, Math.min(c.pos, x));
    setClip(m, copy, x, c.e, Math.max(c.pos, x));
    m.tags.push(copy);
    touch(m); renderMatch();
    showToast(atHead ? "Clip coupé à la barre de lecture." : "Clip coupé en son milieu.", true);
  }
  $("tl-rows").addEventListener("pointerdown", function (e) {
    var m = cur(); var node = e.target.closest(".tl-block.editing"); if (!m || !node) return;
    var t = findTag(m, node.dataset.tl); var track = node.parentElement; if (!t || !track) return;
    var c = clipSpan(m, t), w = track.getBoundingClientRect().width; if (c.pos == null || w <= 0) return;
    tlDrag = { t: t, node: node, mode: e.target.dataset.h || "move", sx: e.clientX, spp: tlDur / w, os: c.s, oe: c.e, opos: c.pos, ns: c.s, ne: c.e, moved: false };
    try { node.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  $("tl-rows").addEventListener("pointermove", function (e) {
    var d = tlDrag; if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.sx) < 4) return;
    d.moved = true;
    var ds = (e.clientX - d.sx) * d.spp, len = d.oe - d.os;
    if (d.mode === "move") { d.ns = Math.min(Math.max(0, tlDur - len), Math.max(0, d.os + ds)); d.ne = d.ns + len; }
    else if (d.mode === "l") { d.ns = Math.min(d.oe - 1, Math.max(0, d.os + ds)); d.ne = d.oe; }
    else { d.ne = Math.max(d.os + 1, Math.min(tlDur, d.oe + ds)); d.ns = d.os; }
    d.node.style.left = (d.ns / tlDur * 100) + "%";
    d.node.style.width = ((d.ne - d.ns) / tlDur * 100) + "%";
  });
  function endTlDrag() {
    var d = tlDrag; if (!d) return;
    tlDrag = null;
    var m = cur(); if (!m || !d.moved) return;
    setClip(m, d.t, d.ns, d.ne, d.mode === "move" ? d.opos + (d.ns - d.os) : d.opos);
    touch(m); renderCurrent(m); renderLog(m);
  }
  $("tl-edit").addEventListener("click", function (e) {
    e.stopPropagation();
    var b = e.target.closest("button"); var m = cur(); if (!b || !m) return;
    var t = tlEdit ? findTag(m, tlEdit) : null;
    if (b.id === "tl-edit-done" || !t) { tlEdit = null; renderTimeline(m); return; }
    if (b.id === "tl-edit-del") deleteTag(m, t.id);
    else if (b.id === "tl-edit-split") splitTag(m, t);
  });
  $("tl-rows").addEventListener("pointerup", endTlDrag);
  $("tl-rows").addEventListener("pointercancel", endTlDrag);
  function deleteTag(m, id) {
    if (tlEdit === id) tlEdit = null;
    stopPlayback();
    snapshot(m);
    m.tags = m.tags.filter(function (t) { return t.id !== id; });
    lists(m).forEach(function (l) { l.tags = l.tags.filter(function (x) { return x !== id; }); });
    if (currentTagId === id) currentTagId = null;
    touch(m); renderMatch();
    showToast("Tag supprimé.", true);
  }
  $("tl-body").addEventListener("click", function (e) {
    var m = cur(); if (!m) return;
    var b = e.target.closest("button");
    if (b && b.dataset.tl) {
      var t = findTag(m, b.dataset.tl); if (!t) return;
      if (tlEdit === t.id) return;
      var nowTap = Date.now();
      if (lastTlTap.id === t.id && nowTap - lastTlTap.at < 450) {
        /* Deuxième toucher sur la même barre : elle devient déplaçable et recoupable. */
        lastTlTap = { id: null, at: 0 };
        stopPlayback(); if (isVideo(m) && videoReady) vid.pause();
        tlEdit = t.id; currentTagId = t.id; renderCurrent(m); renderLog(m);
                return;
      }
      lastTlTap = { id: t.id, at: nowTap };
      tlEdit = null;
      currentTagId = t.id; renderCurrent(m); renderLog(m);
      if (isVideo(m) && videoReady && t.v != null) playClips([clipOf(m, t)]);
      return;
    }
    if (tlEdit) { tlEdit = null; renderTimeline(m); return; }
    if (isVideo(m) && videoReady) {
      stopPlayback();
      var first = $("tl-rows").querySelector(".tl-track"); if (!first) return;
      var r = first.getBoundingClientRect();
      if (e.target.closest(".tl-label")) return;
      var lr = $("tl-scroll").getBoundingClientRect();
      if (e.clientX < lr.left + tlLabelW() || r.width <= 0) return;
      seekTo(Math.min(1, (e.clientX - r.left) / r.width) * tlDur);
    }
  });
  (function () {
    var zone = $("tl-ticks"), pts = {}, base = null, lastTap = 0;
    var ids = function () { return Object.keys(pts); };
    var rebase = function () {
      var k = ids();
      if (k.length >= 2) base = { mode: "pinch", d: Math.max(20, Math.abs(pts[k[0]].x - pts[k[1]].x)), z: prefs.tlZoom };
      else if (k.length === 1) base = { mode: "drag", x: pts[k[0]].x, z: prefs.tlZoom, moved: false };
      else base = null;
    };
    zone.addEventListener("pointerdown", function (e) {
      pts[e.pointerId] = { x: e.clientX };
      try { zone.setPointerCapture(e.pointerId); } catch (err) {}
      rebase(); e.preventDefault();
    });
    zone.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId] || !base) return;
      pts[e.pointerId].x = e.clientX;
      var k = ids();
      if (base.mode === "pinch" && k.length >= 2) {
        var d = Math.max(20, Math.abs(pts[k[0]].x - pts[k[1]].x));
        zoomAt(base.z * d / base.d, (pts[k[0]].x + pts[k[1]].x) / 2);
      } else if (base.mode === "drag") {
        var dx = e.clientX - base.x;
        if (!base.moved && Math.abs(dx) < 6) return;
        base.moved = true;
        zoomAt(base.z * Math.exp(dx / 140), base.x);
      }
    });
    var up = function (e) {
      if (!pts[e.pointerId]) return;
      var wasTap = base && base.mode === "drag" && !base.moved && ids().length === 1;
      delete pts[e.pointerId];
      rebase();
      if (wasTap && e.type === "pointerup") {
        var now = Date.now();
        if (now - lastTap < 350) { zoomAt(1, e.clientX); $("tl-scroll").scrollLeft = 0; lastTap = 0; }
        else lastTap = now;
      }
    };
    zone.addEventListener("pointerup", up);
    zone.addEventListener("pointercancel", up);
    zone.addEventListener("wheel", function (e) {
      e.preventDefault();
      var dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      zoomAt(prefs.tlZoom * Math.exp(-dy / 300), e.clientX);
    }, { passive: false });
  })();
  $("tl-filter").addEventListener("click", function (e) {
    e.stopPropagation();
    var menu = $("tl-filter-menu"); menu.hidden = !menu.hidden;
    $("tl-filter").setAttribute("aria-expanded", String(!menu.hidden));
  });
  $("tl-filter-menu").addEventListener("click", function (e) {
    e.stopPropagation();
    var b = e.target.closest("button"); var m = cur(); if (!b || !m) return;
    if (b.dataset.team) tlFilter.team = b.dataset.team;
    else if (b.id === "tl-f-empty") tlFilter.hideEmpty = !tlFilter.hideEmpty;
    else if (b.id === "tl-f-reset") { tlFilter = { team: "all", hideEmpty: false }; }
    renderTimeline(m);
  });
  document.addEventListener("click", function () { if (!$("tl-filter-menu").hidden) closeTlMenu(); });
  $("pane-tags").addEventListener("click", function (e) {
    var b = e.target.closest("button"); var m = cur(); if (!b || !m) return;
    if (b.id === "cat-back") { catSel = null; renderCats(m); return; }
    if (b.dataset.cat) { catSel = b.dataset.cat; renderCats(m); return; }
    if (b.dataset.catclip) {
      var t = findTag(m, b.dataset.catclip); if (!t) return;
      tlEdit = null; currentTagId = t.id; renderCurrent(m); renderLog(m);
      if (isVideo(m) && videoReady && t.v != null) { playClips([clipOf(m, t)]); $("videobox").scrollIntoView({ block: "nearest" }); }
    }
  });
  $("tab-tags").addEventListener("click", function () { setTab("tags"); });
  $("tab-lists").addEventListener("click", function () { setTab("lists"); });
  $("tab-sum").addEventListener("click", function () { setTab("sum"); });
  function setTab(which) {
    ["tags", "lists", "sum"].forEach(function (k) {
      $("tab-" + k).setAttribute("aria-selected", String(which === k));
      $("pane-" + k).hidden = which !== k;
    });
  }

  /* ---- Clip du tag en cours ---- */
  $("clip-row").addEventListener("click", function (e) {
    var b = e.target.closest("button"); var m = cur(); var tag = currentTag();
    if (!b || !m || !tag) return;
    var a = b.dataset.clip;
    if (a === "play") { playClips([clipOf(m, tag)]); return; }
    if (a === "delete") { deleteTag(m, tag.id); return; }
    if (a === "split") { splitTag(m, tag); return; }
    if (a === "export") { exportClips([clipOf(m, tag)], clipName(m, tagLabel(tag) + "-" + fmt(matchTime(tag.p, tag.t)).replace(":", "m"))); return; }
    if (a === "endhere") {
      if (!videoReady || tag.v == null) return;
      var d = Math.round(vid.currentTime - tag.v);
      if (d < 0) { showToast("La fin du clip doit être après le moment du tag.", false); return; }
      tag.d1 = Math.min(600, d);
    } else if (a === "pre-") tag.d0 = Math.max(0, pre(tag) - 1);
    else if (a === "pre+") tag.d0 = Math.min(120, pre(tag) + 1);
    else if (a === "post-") tag.d1 = Math.max(0, post(tag) - 1);
    else if (a === "post+") tag.d1 = Math.min(600, post(tag) + 1);
    else return;
    touch(m); renderCurrent(m); renderLog(m);
  });
  function clipName(m, suffix) {
    var clean = function (s) { return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); };
    return fileName(m).replace(/\.csv$/, "") + "_" + (clean(suffix) || "clip");
  }

  /* ---- Listes ---- */
  $("list-select").addEventListener("change", function () { var m = cur(); if (!m) return; listSel = $("list-select").value; renderLists(m); });
  $("list-new").addEventListener("click", function () { var m = cur(); if (!m) return; newList(m); touch(m); renderLists(m); });
  var listNameTimer = null;
  $("list-name").addEventListener("input", function () {
    var m = cur(); if (!m) return; var l = curList(m); if (!l) return;
    l.name = $("list-name").value.slice(0, 40) || "Liste";
    saveLocal(); clearTimeout(listNameTimer);
    listNameTimer = setTimeout(function () { touch(m); renderLists(m); }, 700);
  });
  $("list-del").addEventListener("click", function () {
    var m = cur(); if (!m) return; var l = curList(m); if (!l) return;
    snapshot(m);
    m.lists = lists(m).filter(function (x) { return x.id !== l.id; }); listSel = null;
    touch(m); renderLists(m);
    showToast("Liste supprimée.", true);
  });
  $("list-play").addEventListener("click", function () { var m = cur(); if (!m) return; var l = curList(m); if (l) { playClips(listClips(m, l)); $("videobox").scrollIntoView({ block: "nearest" }); } });
  $("list-export").addEventListener("click", function () { var m = cur(); if (!m) return; var l = curList(m); if (l) exportClips(listClips(m, l), clipName(m, l.name)); });
  $("list-items").addEventListener("click", function (e) {
    var b = e.target.closest("button"); var m = cur(); if (!b || !m) return;
    var l = curList(m); if (!l) return;
    if (b.dataset.seek) { var t = findTag(m, b.dataset.seek); if (t) { playClips([clipOf(m, t)]); $("videobox").scrollIntoView({ block: "nearest" }); } }
    else if (b.dataset.unlist) { l.tags = l.tags.filter(function (id) { return id !== b.dataset.unlist; }); touch(m); renderLists(m); }
  });
  $("rec-cancel").addEventListener("click", function () { cancelRec(""); });

  /* ---- Sauvegarde ---- */
  $("btn-save").addEventListener("click", function () {
    var m = cur(); if (!m) return;
    savePos(true); saveLocal();
    if (!cloud) { window.RL2.flush().then(function () { showToast("Sauvegardé sur cet appareil.", false); }, function () { showToast("Échec de l'enregistrement sur cet appareil. Fais « Tout sauvegarder » dans Mes projets.", false); }); return; }
    dirty[m.id] = true; clearTimeout(flushTimer); flush();
    showToast("Sauvegarde en cours.", false);
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (cloudState === "synced") { clearInterval(iv); showToast("Sauvegardé sur cet appareil et en ligne.", false); }
      else if (cloudState === "error" || cloudState === "local" || tries > 30) { clearInterval(iv); showToast("Sauvegardé sur cet appareil. L'envoi en ligne reprendra au retour du réseau.", false); }
    }, 300);
  });
  $("export-project").addEventListener("click", function () {
    var m = matches[exportId]; if (!m || !downloads) return;
    var data = JSON.stringify({ app: "carnet-de-tags", v: 1, match: m, panel: matches.panel || null }, null, 1);
    downloads.save({ filename: fileName(m).replace(/\.csv$/, "") + "_projet.json", data: data }).then(function () {
      $("export-msg").textContent = "Projet enregistré. Tu peux le réimporter depuis la liste des matchs.";
    }, function (err) {
      $("export-msg").textContent = err && err.code === "declined" ? "Enregistrement annulé." : "Le projet n'a pas pu être enregistré ici.";
    });
  });
  $("btn-import").addEventListener("click", function () { $("import-file").value = ""; $("import-file").click(); });
  $("import-file").addEventListener("change", function () {
    var f = $("import-file").files && $("import-file").files[0]; if (!f) return;
    var fr = new FileReader();
    fr.onerror = function () { showToast("Ce fichier n'a pas pu être lu.", false); };
    fr.onload = function () {
      var m = null;
      var o = null;
      try { o = JSON.parse(String(fr.result)); } catch (e) { o = null; }
      if (o && o.all && typeof o.all === "object") {
        var n = 0;
        Object.keys(o.all).forEach(function (k) {
          var v = o.all[k];
          /* v2 : le panel garde son format d'origine (la v1 le marquait v2 et l'agrandissait une 2e fois),
             la bibliothèque de panels et les projets sont aussi importés. */
          if (k === "panel") { if (v && Array.isArray(v.buttons)) { matches.panel = { id: "panel", kind: "panel", v: typeof v.v === "number" ? v.v : 2, h: v.h >= 1 ? 1 : 0, buttons: normLayout(v.buttons), updatedAt: Date.now() }; layoutCache = { stamp: null, list: null }; markDirty("panel"); } return; }
          if (k === "panelLib") { if (v && !v.deleted && Array.isArray(v.items)) { matches.panelLib = JSON.parse(JSON.stringify(v)); matches.panelLib.updatedAt = Date.now(); markDirty("panelLib"); } return; }
          if (v && v.kind === "project") { if (!v.deleted) { matches[k] = JSON.parse(JSON.stringify(v)); matches[k].id = k; markDirty(k); } return; }
          var im = importMatch(v); if (!im) return;
          if (/^m[a-z0-9]{6,24}$/.test(k)) im.id = k;
          matches[im.id] = im; markDirty(im.id); n++;
        });
        if (typeof atBestPanel === "function") atBestPanel();
        saveLocal(); renderHome();
        showToast(n + (n > 1 ? " matchs restaurés." : " match restauré."), false);
        return;
      }
      try { m = importMatch(o && o.match ? o.match : o); } catch (e) { m = null; }
      if (!m) { showToast("Ce fichier n'est pas un projet RL Analysis.", false); return; }
      matches[m.id] = m; touch(m); renderHome();
      showToast("Projet importé : " + m.home + " – " + m.away, false);
    };
    fr.readAsText(f);
  });
  function importMatch(o) {
    if (!o || typeof o !== "object" || !Array.isArray(o.tags) || typeof o.home !== "string" || typeof o.away !== "string") return null;
    var str = function (v, n) { return typeof v === "string" ? v.slice(0, n) : ""; };
    var num = function (v, d) { v = Number(v); return isFinite(v) ? v : d; };
    var m = {
      id: uid("m"), home: str(o.home, 30) || "Domicile", away: str(o.away, 30) || "Extérieur", date: /^\d{4}-\d{2}-\d{2}$/.test(o.date || "") ? o.date : "", comp: str(o.comp, 40),
      createdAt: Date.now(), updatedAt: Date.now(),
      period: Math.min(4, Math.max(1, Math.round(num(o.period, 1)))), phase: ["pre", "live", "break", "done"].indexOf(o.phase) >= 0 ? o.phase : "done",
      clock: { running: false, startedAt: 0, acc: Math.max(0, num(o.clock && o.clock.acc, 0)) }, tags: [], lists: []
    };
    if (o.clock && o.clock.running) m.clock.acc = 0;
    if (o.mode === "video") {
      m.mode = "video";
      var v = o.video || {};
      m.video = { name: str(v.name, 200), pos: Math.max(0, num(v.pos, 0)), k1: v.k1 == null ? null : Math.max(0, num(v.k1, 0)), k2: v.k2 == null ? null : Math.max(0, num(v.k2, 0)) };
    }
    var ids = {};
    o.tags.slice(0, 5000).forEach(function (t) {
      if (!t || typeof t !== "object" || typeof t.ev !== "string") return;
      var id = str(t.id, 40) || uid("t"); if (ids[id]) return; ids[id] = true;
      var tag = { id: id, p: Math.min(4, Math.max(1, Math.round(num(t.p, 1)))), t: Math.max(0, Math.round(num(t.t, 0))), team: t.team === "away" ? "away" : "home",
        ev: str(t.ev, 40), lbl: str(t.lbl, 30), d0: Math.min(120, Math.max(0, num(t.d0, DEF_PRE))), d1: Math.min(600, Math.max(0, num(t.d1, DEF_POST))),
        third: str(t.third, 20), lane: str(t.lane, 30), res: str(t.res, 20), note: str(t.note, 120) };
      if (t.v != null && isFinite(Number(t.v))) tag.v = Math.max(0, Number(t.v));
      tag.btn = str(t.btn, 48); tag.col = isHex(t.col) ? t.col : "";
      if (!tag.lbl) { var e = evFind(tag.ev); tag.lbl = e ? e.label : tag.ev; }
      m.tags.push(tag);
    });
    (Array.isArray(o.lists) ? o.lists : []).slice(0, 50).forEach(function (l) {
      if (!l || typeof l !== "object" || !Array.isArray(l.tags)) return;
      m.lists.push({ id: uid("l"), name: str(l.name, 40) || "Liste", tags: l.tags.filter(function (id) { return typeof id === "string" && ids[id]; }) });
    });
    return m;
  }

  /* ---- Éditeur de boutons ---- */
  var panelDraft = [];
  function renderPanelRows() {
    var box = $("panel-rows"); box.textContent = "";
    panelDraft.forEach(function (e, i) {
      var row = el("div", "panel-row");
      var sw = el("button", "swatch"); sw.type = "button"; sw.dataset.pcolor = String(i); sw.setAttribute("aria-label", "Changer la couleur de " + (e.label || "la catégorie"));
      var dot = el("span"); dot.style.background = e.fam; sw.appendChild(dot);
      var lab = el("input"); lab.value = e.label; lab.maxLength = 30; lab.placeholder = "Nom de la catégorie"; lab.dataset.plabel = String(i); lab.setAttribute("aria-label", "Nom de la catégorie " + (i + 1));
      var grp = el("input", "grp-in"); grp.value = e.grp || ""; grp.maxLength = 24; grp.placeholder = "Groupe"; grp.dataset.pgrp = String(i); grp.setAttribute("aria-label", "Groupe de la catégorie " + (i + 1));
      var res = el("input", "res-in"); res.value = e.res.join(", "); res.maxLength = 90; res.placeholder = "ex. Réussie, Perdue"; res.dataset.pres = String(i); res.setAttribute("aria-label", "Résultats de la catégorie " + (i + 1));
      var rm = el("button", "btn small quiet danger", "Retirer"); rm.type = "button"; rm.dataset.prm = String(i);
      row.appendChild(sw); row.appendChild(lab); row.appendChild(grp); row.appendChild(res); row.appendChild(rm);
      box.appendChild(row);
    });
    $("panel-add").disabled = panelDraft.length >= 16;
  }
  function openPanel() {
    panelDraft = panelEvents().map(function (e) { return { id: e.id, label: e.label, grp: e.grp || "", fam: e.fam, res: e.res.slice() }; });
    $("panel-msg").textContent = "";
    renderPanelRows();
    $("panel-overlay").hidden = false;
  }
  $("btn-panel").addEventListener("click", function () {
    var m = cur(); if (!m) return;
    if (panelMode) { showHome("menu"); return; }
    padEdit = !padEdit; padSel = null;
    renderEvents(m); renderLog(m); renderSummary(m);
  });
  var drag = null;
  function cellAt(e) {
    var grid = $("event-grid"), rect = grid.getBoundingClientRect();
    var cw = (rect.width - PAD_GAP * (COLS - 1)) / COLS;
    return { c: Math.floor((e.clientX - rect.left) / (cw + PAD_GAP)), r: Math.floor((e.clientY - rect.top) / (ROW_H + PAD_GAP)) };
  }
  $("event-grid").addEventListener("pointerdown", function (e) {
    if (!padEdit) return;
    var node = e.target.closest("[data-item]");
    var m = cur(); if (!m || !node) return;
    var it = itemById(node.dataset.item); if (!it) return;
    if (e.pointerType !== "mouse" && it.id !== padSel) return;
    var cell = cellAt(e);
    drag = { it: it, node: node, mode: e.target.classList.contains("rs") ? "resize" : "move", dc: cell.c - it.c, dr: cell.r - it.r, sx: e.clientX, sy: e.clientY, moved: false, origin: { r: it.r, h: it.h }, slop: e.pointerType === "mouse" ? 8 : 14 };
    try { node.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  $("event-grid").addEventListener("pointermove", function (e) {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < drag.slop) return;
    drag.moved = true;
    var it = drag.it, cell = cellAt(e);
    drag.cell = cell;
    if (drag.mode === "move") {
      it.c = Math.min(COLS - it.w, Math.max(0, cell.c - drag.dc));
      it.r = Math.min(MAX_ROW, Math.max(0, cell.r - drag.dr));
    } else {
      it.w = Math.min(COLS - it.c, Math.max(it.type === "label" ? 8 : 4, cell.c - it.c + 1));
      it.h = Math.min(200, Math.max(3, cell.r - it.r + 1));
    }
    drag.node.style.gridColumn = (it.c + 1) + " / span " + it.w;
    drag.node.style.gridRow = (it.r + 1) + " / span " + it.h;
    var grid = $("event-grid"), need = it.r + it.h + 12, have = grid.style.gridTemplateRows.match(/repeat\((\d+)/);
    if (!have || +have[1] < need) grid.style.gridTemplateRows = "repeat(" + need + ", " + ROW_H + "px)";
  });
  /* Posé dans un vide trop étroit entre deux éléments : le bouton prend la largeur du vide au lieu de chevaucher. */
  function overlaps(a, b) { return a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.h && b.r < a.r + a.h; }
  function fitToGap(it, col) {
    var others = layout().filter(function (x) { return x !== it; });
    if (!others.some(function (o) { return overlaps(it, o); })) return;
    var occ = function (c) { return others.some(function (o) { return o.c <= c && c < o.c + o.w && it.r < o.r + o.h && o.r < it.r + it.h; }); };
    col = Math.min(COLS - 1, Math.max(0, col));
    if (occ(col)) return;
    var L = col, R = col;
    while (L > 0 && !occ(L - 1)) L--;
    while (R < COLS - 1 && !occ(R + 1)) R++;
    var free = R - L + 1;
    if (free >= it.w) it.c = Math.min(R - it.w + 1, Math.max(L, it.c));
    else { it.c = L; it.w = free; }
  }
  function endDrag() {
    if (!drag) return;
    var m = cur();
    padSel = drag.it.id;
    var moved = drag.moved;
    if (moved) { if (drag.mode === "move" && drag.cell) fitToGap(drag.it, drag.cell.c); commitLayout(); }
    drag = null;
    if (m) { renderEvents(m); if (moved) renderLog(m); }
  }
  $("event-grid").addEventListener("pointerup", endDrag);
  $("event-grid").addEventListener("pointercancel", endDrag);
  /* Double tap : renommer un bouton du pupitre (en mode modification) ou une ligne de la timeline */
  function onDoubleTap(box, sel, ok, cb) {
    var start = null, last = null;
    box.addEventListener("pointerdown", function (e) { var n = e.target.closest(sel); start = n && ok() ? { x: e.clientX, y: e.clientY, n: n } : null; });
    box.addEventListener("pointerup", function (e) {
      if (!start) return;
      var n = e.target.closest(sel) || start.n, key = n.dataset.item || n.dataset.row, moved = Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 12;
      start = null;
      if (moved || !key) { last = null; return; }
      var now = Date.now();
      if (last && last.key === key && now - last.t < 450) { last = null; e.preventDefault(); cb(key); }
      else last = { key: key, t: now };
    });
  }
  function inlineRename(anchor, value, done) {
    if (!anchor) return;
    var old = document.querySelector(".inline-rename"); if (old) old.remove();
    var r = anchor.getBoundingClientRect();
    var inp = el("input", "inline-rename"); inp.maxLength = 30; inp.value = value; inp.setAttribute("aria-label", "Nouveau nom");
    inp.style.left = r.left + "px"; inp.style.top = r.top + "px"; inp.style.width = Math.max(160, r.width) + "px"; inp.style.height = Math.max(36, r.height) + "px";
    document.body.appendChild(inp);
    var closed = false;
    function close(save) {
      if (closed) return; closed = true;
      var v = inp.value.trim(); inp.remove();
      if (save && v && v !== value) done(v);
    }
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); close(true); } else if (e.key === "Escape") close(false); });
    inp.addEventListener("blur", function () { close(true); });
    setTimeout(function () { inp.focus(); inp.select(); }, 0);
  }
  onDoubleTap($("event-grid"), "[data-item]", function () { return padEdit; }, function (id) {
    var it = itemById(id); if (!it) return;
    inlineRename($("event-grid").querySelector('[data-item="' + id + '"]'), it.label, function (v) { it.label = v; padSel = it.id; padChanged(true); });
  });
  onDoubleTap($("tl-labels"), ".tl-label", function () { return true; }, function (key) {
    var m = cur(); if (!m) return;
    var anchor = $("tl-labels").querySelector('[data-row="' + key.replace(/"/g, '\\"') + '"]');
    if (key.indexOf("b:") === 0) {
      var it = itemById(key.slice(2)); if (!it) return;
      inlineRename(anchor, it.label, function (v) { it.label = v; padChanged(true); renderTimeline(m); });
    } else {
      var row = tlRows(m).filter(function (r) { return r.key === key; })[0]; if (!row) return;
      inlineRename(anchor, row.label, function (v) {
        row.tags.forEach(function (t) { t.lbl = v; });
        touch(m); renderAll(m);
      });
    }
  });

  var padTimer = null;
  function padChanged(now) {
    var m = cur();
    clearTimeout(padTimer);
    var go = function () { commitLayout(); if (m) { renderEvents(m); renderLog(m); renderSummary(m); renderCurrent(m); } };
    var live = itemById(padSel), ln = live ? $("event-grid").querySelector('[data-item="' + live.id + '"]') : null;
    if (live && ln && live.color) paint(ln, live.color, live.pat, live.bd, live.bw);
    if (now) go(); else padTimer = setTimeout(go, 500);
  }
  function nextFreeRow() { var r = 0; layout().forEach(function (it) { r = Math.max(r, it.r + it.h); }); return Math.min(MAX_ROW, r); }
  $("pp-label").addEventListener("input", function () {
    var it = itemById(padSel); if (!it) return;
    it.label = $("pp-label").value.slice(0, 30) || (it.type === "label" ? "Titre" : "Bouton");
    var node = $("event-grid").querySelector('[data-item="' + it.id + '"] span'); if (node) node.textContent = it.label;
    padChanged(false);
  });
  $("pp-res").addEventListener("input", function () {
    var it = itemById(padSel); if (!it || it.type !== "button") return;
    it.res = $("pp-res").value.split(",").map(function (x) { return x.trim().slice(0, 20); }).filter(function (x) { return !!x; }).slice(0, 4);
    padChanged(false);
  });
  $("pp-team").addEventListener("click", function (e) {
    var b = e.target.closest("button"); var it = itemById(padSel); if (!b || !it || it.type !== "button") return;
    var wasDefault = it.color === teamColor(it.team);
    it.team = b.dataset.team === "away" ? "away" : "home";
    if (wasDefault) it.color = teamColor(it.team);
    padChanged(true);
  });
  $("pp-color").addEventListener("click", function (e) {
    var b = e.target.closest("button"); var it = itemById(padSel); if (!b || !it) return;
    if (b.dataset.color === "none" && it.type === "label") { it.color = ""; padChanged(true); }
    else if (isHex(b.dataset.color)) { it.color = b.dataset.color; padChanged(true); }
  });
  $("pp-bd").addEventListener("click", function (e) {
    var b = e.target.closest("button"); var it = itemById(padSel); if (!b || !it) return;
    if (b.dataset.bd === "none") { it.bd = ""; padChanged(true); }
    else if (isHex(b.dataset.bd)) { it.bd = b.dataset.bd; padChanged(true); }
  });
  $("pp-clip").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-ps]"); var it = itemById(padSel); if (!b || !it || it.type !== "button") return;
    var k = b.dataset.ps, key = k.indexOf("pre") === 0 ? "pre" : "post", d = k.slice(-1) === "+" ? 1 : -1;
    var curv = it[key] != null ? it[key] : (key === "pre" ? DEF_PRE : DEF_POST);
    it[key] = Math.max(0, Math.min(60, curv + d)); padChanged(true);
  });
  $("pp-bw").addEventListener("click", function (e) {
    var b = e.target.closest("button"); var it = itemById(padSel); if (!b || !it) return;
    it.bw = clampInt(b.dataset.bw, 1, 8, 2); padChanged(true);
  });
  $("pp-bd").addEventListener("input", function (e) {
    var it = itemById(padSel); if (!it || e.target.id !== "pp-bd-custom" || !isHex(e.target.value)) return;
    it.bd = e.target.value.toUpperCase();
    var node = $("event-grid").querySelector('[data-item="' + it.id + '"]');
    if (node) node.style.border = borderCss(it.bd, it.bw);
    padChanged(false);
  });
  $("pp-pat").addEventListener("click", function (e) {
    var b = e.target.closest("button"); var it = itemById(padSel); if (!b || !it || !isPat(b.dataset.pat)) return;
    it.pat = b.dataset.pat; padChanged(true);
  });
  $("pp-color").addEventListener("input", function (e) {
    var it = itemById(padSel); if (!it || e.target.id !== "pp-custom" || !isHex(e.target.value)) return;
    it.color = e.target.value.toUpperCase();
    var node = $("event-grid").querySelector('[data-item="' + it.id + '"]');
    if (node) paint(node, it.color, it.pat, it.bd, it.bw);
    padChanged(false);
  });
  $("pp-dup").addEventListener("click", function () {
    var it = itemById(padSel); if (!it || it.type !== "button") return;
    var cp = { id: uid("b"), type: "button", key: uid("k"), label: it.label, team: it.team, color: it.color, pat: it.pat || "none", bd: it.bd || "", bw: it.bw || 0, pre: it.pre, post: it.post, res: it.res.slice(), c: it.c, r: nextFreeRow(), w: it.w, h: it.h };
    layout().push(cp); padSel = cp.id; padChanged(true);
    showToast("Bouton dupliqué, en bas du pupitre.", false);
  });
  $("pp-del").addEventListener("click", function () {
    var l = layout(), i = l.indexOf(itemById(padSel)); if (i < 0) return;
    l.splice(i, 1); padSel = null; padChanged(true);
  });
  $("pad-add").addEventListener("click", function () {
    var it = { id: uid("b"), type: "button", key: uid("k"), label: "Nouveau", team: "home", color: C_HOME, res: [], c: 0, r: nextFreeRow(), w: 24, h: 6 };
    layout().push(it); padSel = it.id; padChanged(true);
    $("pp-label").focus(); $("pp-label").select();
  });
  $("pad-add-label").addEventListener("click", function () {
    var it = { id: uid("b"), type: "label", label: "Titre", color: "", pat: "none", c: 0, r: nextFreeRow(), w: 48, h: 6 };
    layout().push(it); padSel = it.id; padChanged(true);
    $("pp-label").focus(); $("pp-label").select();
  });
  $("pad-reset").addEventListener("click", function () {
    var prev = { id: "panel", kind: "panel", v: 4, h: 1, buttons: JSON.parse(JSON.stringify(layout())), updatedAt: Date.now() };
    snapshot(prev);
    matches.panel = { id: "panel", kind: "panel", v: 4, h: 1, buttons: defaultLayout(DEFAULT_EVENTS), updatedAt: Date.now() + 1 };
    layoutCache = { stamp: null, list: null }; padSel = null;
    saveLocal(); markDirty("panel");
    renderAll();
    showToast("Disposition d'origine rétablie.", true);
  });
  $("panel-rows").addEventListener("input", function (e) {
    var t = e.target;
    if (t.dataset.plabel) panelDraft[+t.dataset.plabel].label = t.value;
    else if (t.dataset.pgrp) panelDraft[+t.dataset.pgrp].grp = t.value;
    else if (t.dataset.pres) panelDraft[+t.dataset.pres].res = t.value.split(",").map(function (x) { return x.trim(); }).filter(function (x) { return !!x; });
  });
  $("panel-rows").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.pcolor) { var d = panelDraft[+b.dataset.pcolor]; d.fam = FAMS[(FAMS.indexOf(d.fam) + 1) % FAMS.length]; renderPanelRows(); }
    else if (b.dataset.prm) { panelDraft.splice(+b.dataset.prm, 1); renderPanelRows(); }
  });
  $("panel-add").addEventListener("click", function () {
    if (panelDraft.length >= 16) return;
    panelDraft.push({ id: uid("c"), label: "", grp: panelDraft.length ? (panelDraft[panelDraft.length - 1].grp || "") : "", fam: FAMS[panelDraft.length % FAMS.length], res: [] });
    renderPanelRows();
    var ins = $("panel-rows").querySelectorAll("input[data-plabel]"); if (ins.length) ins[ins.length - 1].focus();
  });
  $("panel-reset").addEventListener("click", function () {
    panelDraft = DEFAULT_EVENTS.map(function (e) { return { id: e.id, label: e.label, grp: e.grp || "", fam: e.fam, res: e.res.slice() }; });
    renderPanelRows();
  });
  $("panel-cancel").addEventListener("click", function () { $("panel-overlay").hidden = true; });
  $("panel-save").addEventListener("click", function () {
    var evs = normEvents(panelDraft);
    if (!evs.length) { $("panel-msg").textContent = "Garde au moins une catégorie avec un nom."; return; }
    matches.panel = { id: "panel", kind: "panel", events: evs, updatedAt: Date.now() };
    saveLocal(); markDirty("panel");
    $("panel-overlay").hidden = true;
    renderAll();
  });
  $("toast-undo").addEventListener("click", undo);

  $("export-overlay").addEventListener("click", function (e) {
    if (e.target === $("export-overlay")) { $("export-overlay").hidden = true; return; }
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.sep) { prefs.sep = b.dataset.sep; savePrefs(); renderSep(); }
  });
  $("export-close").addEventListener("click", function () { $("export-overlay").hidden = true; });
  $("export-save").addEventListener("click", saveCsv);
  $("export-copy").addEventListener("click", copyCsv);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { $("export-overlay").hidden = true; $("panel-overlay").hidden = true; closeTlMenu(); } });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      if (cur()) { renderClock(); requestWake(); }
      if (cloud && !flushing && !Object.keys(dirty).length) pull();
    }
  });

  /* ============ Démarrage ============ */
  loadLocal();
  /* Pas de commandes Apple sur la vidéo : un tap sur l'image met en lecture ou en pause. */
  $("video").addEventListener("click", function () { videoAction("vplay"); });
  /* iPad / iPhone : la vidéo se mélange à la musique d'une autre app au lieu de la couper (ou d'être coupée par elle). */
  try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (e) {}
  try { var d = new Date(); $("f-date").value = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); } catch (e) {}
  showHome("menu");
  setInterval(renderClock, 250);
  /* v2 : pas de synchronisation en ligne (version à part, tout reste sur l'appareil). */
  /* Version autonome : les fichiers sont remis directement au navigateur. */
  var MIME = { csv: "text/csv;charset=utf-8", json: "application/json", mp4: "video/mp4", webm: "video/webm" };
  downloads = { save: function (r) {
    return new Promise(function (resolve, reject) {
      try {
        var ext = String(r.filename).split(".").pop().toLowerCase();
        var blob = r.data instanceof Blob ? r.data : new Blob([r.data], { type: MIME[ext] || "application/octet-stream" });
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = r.filename; a.style.display = "none";
        document.body.appendChild(a); a.click();
        setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) {} }, 60000);
        resolve({ status: "saved" });
      } catch (e) { reject({ code: "unavailable", message: String(e) }); }
    });
  } };
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}

  /* Sauvegarde complète : tous les matchs et le pupitre dans un seul fichier. */
  $("btn-backup").addEventListener("click", function () {
    savePos(true); saveLocal();
    var d = new Date(), stamp = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    downloads.save({ filename: "carnet-de-tags_sauvegarde_" + stamp + ".json", data: JSON.stringify({ app: "carnet-de-tags", v: 1, all: matches }) })
      .then(function () { showToast("Sauvegarde complète enregistrée dans tes téléchargements.", false); },
            function () { showToast("La sauvegarde n'a pas pu être enregistrée.", false); });
  });

  /* ============ Synchronisation en ligne, facultative (base Supabase de l'utilisateur) ============ */
  var SYNC_KEY = "carnet-de-tags.sync";
  /* Base du propriétaire de ce site. La clé « publishable » est faite pour être publique : l'accès aux données dépend du compte et des règles de la base. */
  var SYNC_DEFAULT = { url: "https://ywsxfikvjaxlwtzpogck.supabase.co", key: "sb_publishable_hgZrsWt9l1R2LaE78y_vaQ_7oykggbZ" };
  var sync = null;   // { url, key, email, refresh, access, exp }
  var onlineSizes = null;   // taille de chaque document en ligne, en octets
  function byteSize(o) { try { return new Blob([JSON.stringify(o)]).size; } catch (e) { return 0; } }
  function saveSync() {
    try {
      if (sync) localStorage.setItem(SYNC_KEY, JSON.stringify({ url: sync.url, key: sync.key, email: sync.email, refresh: sync.refresh }));
      else localStorage.removeItem(SYNC_KEY);
    } catch (e) {}
  }
  function sbAuth(grant, body, cfg) {
    return fetch(cfg.url + "/auth/v1/token?grant_type=" + grant, { method: "POST", headers: { apikey: cfg.key, "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok || !j.access_token) throw { code: r.status >= 500 ? "unavailable" : "auth", message: j.error_description || j.msg || j.message || "Connexion refusée." };
          return j;
        });
      }, function () { throw { code: "unavailable", message: "Pas de réseau, ou adresse du projet incorrecte." }; });
  }
  function sbToken() {
    if (!sync) return Promise.reject({ code: "auth" });
    if (sync.access && Date.now() < sync.exp - 60000) return Promise.resolve(sync.access);
    if (!sync.refreshing) {
      var cfg = sync;
      cfg.refreshing = sbAuth("refresh_token", { refresh_token: cfg.refresh }, cfg).then(function (j) {
        cfg.access = j.access_token; cfg.refresh = j.refresh_token || cfg.refresh; cfg.exp = Date.now() + (j.expires_in || 3600) * 1000;
        cfg.refreshing = null; if (sync === cfg) saveSync();
        return cfg.access;
      }, function (e) { cfg.refreshing = null; throw e; });
    }
    return sync.refreshing;
  }
  function sbFetch(path, opts) {
    return sbToken().then(function (tok) {
      opts = opts || {};
      var h = { apikey: sync.key, Authorization: "Bearer " + tok, "Content-Type": "application/json" };
      Object.keys(opts.headers || {}).forEach(function (k) { h[k] = opts.headers[k]; });
      opts.headers = h;
      return fetch(sync.url + "/rest/v1/" + path, opts).then(function (r) {
        return r.text().then(function (t) {
          if (!r.ok) throw { code: (r.status >= 500 || r.status === 429) ? "unavailable" : (r.status === 401 ? "auth" : "invalid_argument"), message: t };
          return t ? JSON.parse(t) : null;
        });
      }, function () { throw { code: "unavailable" }; });
    });
  }
  function syncLost(e) {
    if (e && e.code === "auth") { cloud = null; setCloudState("local"); showToast("Synchronisation arrêtée : reconnecte-toi avec l'icône de connexion sur l'accueil.", false); }
    if (e && e.code === "invalid_argument") showToast("La base en ligne a refusé l'enregistrement. Vérifie que la table a bien été créée.", false);
    throw e;
  }
  function makeCloud() {
    return {
      doc: function (id) {
        return { set: function (body) {
          return sbFetch("carnet_docs?on_conflict=user_id,id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([{ id: id, body: body, updated_at: Number(body.updatedAt) || Date.now() }]) })
            .then(function (r) { if (!onlineSizes) onlineSizes = {}; onlineSizes[id] = byteSize(body); renderStore(); return r; }).catch(syncLost);
        } };
      },
      limit: function () { return this; },
      get: function () {
        return sbFetch("carnet_docs?select=id,body").then(function (rows) {
          onlineSizes = {}; (rows || []).forEach(function (r) { onlineSizes[r.id] = byteSize(r.body); }); renderStore();
          return { docs: (rows || []).map(function (r) { return { id: r.id, data: function () { return r.body; } }; }) };
        }).catch(syncLost);
      }
    };
  }
  function renderSyncDialog(msg) {
    var on = !!(sync && cloud);
    $("sync-form").hidden = on; $("sync-on").hidden = !on;
    if (on) $("sync-who").textContent = "Connecté en tant que " + sync.email + ".";
    $("sync-msg").textContent = msg || "";
  }
  $("btn-sync").addEventListener("click", function () {
    $("sy-url").value = sync ? sync.url : SYNC_DEFAULT.url; $("sy-key").value = sync ? sync.key : SYNC_DEFAULT.key;
    if (sync) $("sy-mail").value = sync.email || "";
    renderSyncDialog(""); $("sync-overlay").hidden = false;
  });
  $("sync-close").addEventListener("click", function () { $("sync-overlay").hidden = true; });
  $("sync-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var url = $("sy-url").value.trim() || SYNC_DEFAULT.url;
    /* On ne garde que l'adresse du projet, même si elle a été collée avec /rest/v1/ ou sans https:// */
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    try { url = new URL(url).origin; } catch (err) { url = ""; }
    $("sy-url").value = url || $("sy-url").value;
    var key = $("sy-key").value.trim() || SYNC_DEFAULT.key, mail = $("sy-mail").value.trim(), pw = $("sy-pw").value;
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(url)) { renderSyncDialog("L'adresse du projet, dans les réglages avancés, doit ressembler à https://xxxx.supabase.co"); $("sync-adv").open = true; return; }
    if (!mail || !pw) { renderSyncDialog("Saisis ton e-mail et ton mot de passe."); return; }
    if (!key) { renderSyncDialog("Il manque la clé publique, dans les réglages avancés."); $("sync-adv").open = true; return; }
    renderSyncDialog("Connexion en cours.");
    var cfg = { url: url, key: key, email: mail };
    sbAuth("password", { email: mail, password: pw }, cfg).then(function (j) {
      cfg.access = j.access_token; cfg.refresh = j.refresh_token; cfg.exp = Date.now() + (j.expires_in || 3600) * 1000;
      sync = cfg; saveSync(); $("sy-pw").value = "";
      cloud = makeCloud();
      return pull().then(function () {
        renderSyncDialog(cloud && cloudState !== "error" ? "Synchronisation active. Tes matchs sont envoyés en ligne." : "Connecté, mais la base a refusé l'accès. Vérifie que la table a bien été créée.");
        renderHome();
      });
    }, function (err) {
      renderSyncDialog(err.code === "unavailable" ? err.message : "Connexion refusée : vérifie ton e-mail et ton mot de passe.");
    });
  });
  $("sync-off").addEventListener("click", function () {
    sync = null; saveSync(); cloud = null; dirty = {}; onlineSizes = null; setCloudState("local");
    renderSyncDialog("Synchronisation désactivée. Tes matchs restent sur cet appareil."); renderHome();
  });
  function pullIfIdle() { if (cloud && !flushing && !Object.keys(dirty).length) pull(); }
  $("go-projects").addEventListener("click", pullIfIdle);
  $("btn-back").addEventListener("click", pullIfIdle);
  setInterval(function () { if (!currentMatchId && !panelMode && document.visibilityState === "visible") pullIfIdle(); }, 30000);
  try {
    var so = JSON.parse(localStorage.getItem(SYNC_KEY) || "null");
    void so;
  } catch (e) {}
  renderSync();


  /* =====================================================================
     Atelier (beta) : écran de tag reconstruit comme la maquette validée.
     Menus, barre d'outils, panel en grille, liste des codes, barre de
     timeline, barre d'icônes. Tout est branché sur les fonctions du logiciel.
     ===================================================================== */
  var AT_I = {"cam": "<rect x=\"3\" y=\"7\" width=\"12\" height=\"10\" rx=\"1.5\"/><path d=\"m15 10.5 6-3v9l-6-3z\"/>", "chart": "<path d=\"M4 19V5M4 19h16M7 15l4-5 3 3 5-7\"/>", "check": "<path d=\"m5 12.5 4.5 4.5L19 7.5\"/>", "chevd": "<path d=\"m6 9 6 6 6-6\"/>", "chevr": "<path d=\"m9 6 6 6-6 6\"/>", "clipboard": "<rect x=\"6\" y=\"5\" width=\"12\" height=\"15\" rx=\"1\"/><path d=\"M9 5V3.5h6V5M9 10h6M9 14h6\"/>", "clock": "<circle cx=\"12\" cy=\"12\" r=\"8\"/><path d=\"M12 7.5V12l3 2\"/>", "cloud": "<path d=\"M7 18a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 9.2 4.4 4.4 0 0 1 16.8 18z\"/>", "export": "<path d=\"M12 14V4M8 8l4-4 4 4M5 17v3h14v-3\"/>", "film": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"1\"/><path d=\"M7.5 5v14M16.5 5v14M3 9.5h4.5M3 14.5h4.5M16.5 9.5H21M16.5 14.5H21\"/>", "full": "<path d=\"M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5\"/>", "funnel": "<path d=\"M4 5h16l-6 7.5V19l-4-2v-4.5z\"/>", "gear": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8\"/>", "home": "<path d=\"M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10\"/>", "import": "<path d=\"M12 4v10M8 10l4 4 4-4M5 17v3h14v-3\"/>", "layers": "<path d=\"M12 4 3 9l9 5 9-5zM3 13.5l9 5 9-5\"/>", "mnext": "<path d=\"M18 5v14\"/><path d=\"M6 5v14l10-7z\" fill=\"currentColor\" stroke=\"none\"/>", "mprev": "<path d=\"M6 5v14\"/><path d=\"M18 5v14L8 12z\" fill=\"currentColor\" stroke=\"none\"/>", "pencil": "<path d=\"m5 19 1.2-4.5L16.5 4.2l3.3 3.3L9.5 17.8zM14.5 6.2l3.3 3.3\"/>", "photo": "<rect x=\"3\" y=\"7\" width=\"18\" height=\"12\" rx=\"2\"/><circle cx=\"12\" cy=\"13\" r=\"3.4\"/><path d=\"M8.5 7 10 4.5h4L15.5 7\"/>", "play": "<path d=\"M7 4.5v15l12-7.5z\" fill=\"currentColor\" stroke=\"none\"/>", "save": "<path d=\"M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6\"/>", "selbox": "<path d=\"M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4\"/><rect x=\"8.5\" y=\"8.5\" width=\"7\" height=\"7\"/>", "share": "<circle cx=\"6\" cy=\"12\" r=\"2.2\"/><circle cx=\"18\" cy=\"6\" r=\"2.2\"/><circle cx=\"18\" cy=\"18\" r=\"2.2\"/><path d=\"m8 11 8-4M8 13l8 4\"/>", "sliders": "<path d=\"M4 7h9M19 7h1M4 17h3M13 17h7\"/><circle cx=\"16\" cy=\"7\" r=\"2.2\"/><circle cx=\"10\" cy=\"17\" r=\"2.2\"/>", "sort": "<path d=\"M7 5v14M4 16l3 3 3-3M17 19V5M14 8l3-3 3 3\"/>", "split": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"1\"/><path d=\"M12 5v14\"/>", "star": "<path d=\"M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z\" fill=\"currentColor\" stroke=\"none\"/>", "staro": "<path d=\"M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z\"/>", "tag": "<path d=\"M4 4h8l8 8-8 8-8-8z\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1.3\"/>", "trophy": "<path d=\"M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4\"/>", "undo": "<path d=\"M8 6 4 10l4 4M4 10h10a5 5 0 0 1 0 10h-3\"/>", "user": "<circle cx=\"12\" cy=\"8\" r=\"3.6\"/><path d=\"M5 20c0-4 3.2-6 7-6s7 2 7 6\"/>", "zin": "<circle cx=\"11\" cy=\"11\" r=\"6\"/><path d=\"m15.5 15.5 4.5 4.5M8.5 11h5M11 8.5v5\"/>", "zout": "<circle cx=\"11\" cy=\"11\" r=\"6\"/><path d=\"m15.5 15.5 4.5 4.5M8.5 11h5\"/>"};
  function atIc(n, s, col, sw) { return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (col ? ' style="color:' + col + '"' : '') + '>' + AT_I[n] + '</svg>'; }
  function atBtn(cls, html, title, fn) { var b = el("button", cls); b.type = "button"; b.innerHTML = html; if (title) { b.title = title; b.setAttribute("aria-label", title); } if (fn) b.addEventListener("click", fn); return b; }
  function atSpan(cls, html) { var s = el("span", cls); if (html) s.innerHTML = html; return s; }
  var AT_KEY = "rl2.atelier", at = { hidden: {}, tab: "codes", open: null, star: false, lay: "code", zoomSet: false };
  try { var atS = JSON.parse(localStorage.getItem(AT_KEY) || "null"); if (atS) { at.hidden = atS.hidden || {}; at.lay = atS.lay === "ana" ? "ana" : "code"; at.zoomSet = !!atS.zoomSet; } } catch (e) {}
  function atSave() { try { localStorage.setItem(AT_KEY, JSON.stringify({ hidden: at.hidden, lay: at.lay, zoomSet: at.zoomSet })); } catch (e) {} }
  /* v2 : historique de 100 actions (la v1 n'en gardait qu'une), et Rétablir. */
  var atUndoStack = [], atRedoStack = [];
  function atPush(step) { if (!step) return; atUndoStack.push(step); if (atUndoStack.length > 100) atUndoStack.shift(); atRedoStack.length = 0; }
  var atVM = $("view-match"); atVM.classList.add("at");
  document.body.appendChild($("pop"));

  function atPop(anchor, items) {
    if (!items.length) return;
    openPop(anchor, items);
    var r = anchor.getBoundingClientRect(), pop = $("pop");
    pop.style.left = Math.max(4, Math.min(window.innerWidth - pop.offsetWidth - 4, r.left)) + "px";
  }
  function atProject() { var m = cur(); return m ? (pjId && pjDoc() ? pjDoc() : pjOf(m.id)) : null; }
  function atStarKey(m, t) { return m.id + ":" + t.id; }
  function atIsStar(m, t) { var a = atProject(); return !!(a && a.stars && a.stars[atStarKey(m, t)]); }
  function atSort() { if (atProject()) openSort(); else showToast("Ajoute d'abord ce match à un projet pour trier ses clips.", false); }
  function atSwap(from, to, msgNone, msgDone) {
    var step = from.pop();
    if (!step) { showToast(msgNone, false); return; }
    var now = matches[step.id];
    to.push({ id: step.id, json: now ? JSON.stringify(now) : null });
    var restored = JSON.parse(step.json);
    matches[restored.id] = restored; if (!restored.tags || !findTag(restored, currentTagId)) currentTagId = null;
    if (restored.id === "panel") layoutCache = { stamp: null, list: null };
    var keep = undoState; touch(restored); undoState = keep; renderAll(); showToast(msgDone, false);
  }
  function atDoUndo() { atSwap(atUndoStack, atRedoStack, "Rien à annuler.", "Dernière action annulée."); }
  function atDoRedo() { atSwap(atRedoStack, atUndoStack, "Rien à rétablir.", "Action rétablie."); }
  function atCapture() {
    if (!videoReady) { showToast("Ouvre d'abord la vidéo.", false); return; }
    var c = document.createElement("canvas"); c.width = vid.videoWidth; c.height = vid.videoHeight;
    try { c.getContext("2d").drawImage(vid, 0, 0); c.toBlob(function (b) { if (!b) return; var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = clipName(cur(), "image-" + fmt(vid.currentTime).replace(":", "m")) + ".png"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }, "image/png"); } catch (e) { showToast("Capture impossible sur cette vidéo.", false); }
  }
  function atFull() {
    var box = $("videobox");
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (box.requestFullscreen) box.requestFullscreen().catch(function () {}); else if (vid.webkitEnterFullscreen) vid.webkitEnterFullscreen();
  }
  function atClip(a) { var b = document.querySelector('#clip-row [data-clip="' + a + '"]'); if (!currentTag()) { showToast("Sélectionne d'abord un clip.", false); return; } if (b) b.click(); }
  function atToggleStar() {
    var m = cur(), t = currentTag(), a = atProject();
    if (!m || !t) { showToast("Sélectionne d'abord un clip.", false); return; }
    if (!a) { showToast("Ajoute ce match à un projet pour garder des clips.", false); return; }
    a.stars = a.stars || {}; var k = atStarKey(m, t);
    if (a.stars[k]) delete a.stars[k]; else a.stars[k] = true;
    touch(a); renderLog(m);
  }
  function atJump(dir) {
    var m = cur(); if (!m) return;
    var now = tlAxis(m).now, list = m.tags.filter(function (t) { return tlPos(m, t) != null; }).sort(function (a, b) { return tlPos(m, a) - tlPos(m, b); }), pick = null;
    if (dir > 0) { for (var i = 0; i < list.length; i++) if (tlPos(m, list[i]) - pre(list[i]) > now + 0.4) { pick = list[i]; break; } }
    else { for (var j = list.length - 1; j >= 0; j--) if (tlPos(m, list[j]) - pre(list[j]) < now - 1.5) { pick = list[j]; break; } }
    if (!pick) return;
    stopPlayback(); tlEdit = null; currentTagId = pick.id;
    if (isVideo(m) && videoReady) seekTo(Math.max(0, pick.v - pre(pick)));
    renderCurrent(m); renderLog(m);
  }
  function atZoom(z) { var sc = $("tl-scroll").getBoundingClientRect(); zoomAt(z, sc.left + sc.width / 2); }
  function atSetLay(n) { at.lay = n; atSave(); atApplyLay(); var m = cur(); if (m && !panelMode) renderLog(m); }
  function atFit() {
    var b = $("board"); if (!b || at.lay !== "code" || $("view-match").hidden || $("videobox").hidden) { if (b) { b.style.removeProperty("--panw"); b.style.removeProperty("--vidh"); } return; }
    var W = b.clientWidth - 8 - 4, H = b.clientHeight - 8;
    var ar = videoReady && vid.videoWidth && vid.videoHeight ? vid.videoWidth / vid.videoHeight : 16 / 9;
    var maxvh = H - $("clockbar").offsetHeight - 26 - 2;
    var pw = Math.max(300, Math.round(W * 0.325));
    var vh = (W - pw - 2) / ar;
    if (vh > maxvh) { vh = maxvh; pw = Math.round(W - (vh * ar + 2)); }
    b.style.setProperty("--panw", pw + "px");
    document.documentElement.style.setProperty("--at-panw", pw + "px");
    b.style.setProperty("--vidh", Math.floor(vh + 28) + "px");
  }
  function atApplyLay() { $("board").dataset.lay = String(at.lay); for (var i = 0; i < atLayBtns.length; i++) atLayBtns[i].classList.toggle("on", atLayBtns[i].dataset.lay === at.lay); for (var j = 0; j < atDockMode.length; j++) atDockMode[j].classList.toggle("on", atDockMode[j].dataset.lay === at.lay); if (at.lay === "ana" && currentTagId) { var rr = $("tl-rows").querySelector(".sel"); if (rr) setTimeout(function () { rr.scrollIntoView({ block: "nearest" }); }, 60); } var m = cur(); if (m) renderTimeline(m); atFit(); }
  function atSetTab(t) { at.tab = t; $("bottom").dataset.tab = t; var bs = atTabs.children; for (var i = 0; i < bs.length; i++) bs[i].classList.toggle("on", bs[i].dataset.t === t); var m = cur(); if (m && t === "sum") renderSummary(m); if (m && !panelMode) renderLog(m); }

  /* ---- Bandeau des menus ---- */
  var atMenu = el("div", "at-menu");
  var AT_MENUS = [
    ["Fichier", function () { return [["Accueil", function () { showHome(); }], ["Mes projets", function () { showHome("projects"); }], ["Nouveau match", function () { showHome("new"); }], ["Sauvegarder", function () { $("btn-save").click(); }], ["Exporter…", function () { $("btn-export").click(); }]]; }],
    ["Édition", function () { return [["Annuler", atDoUndo], ["Rétablir", atDoRedo], ["Supprimer le clip sélectionné", function () { atClip("delete"); }, true]]; }],
    ["Affichage", function () { return [["Page Codage", function () { atSetLay("code"); }], ["Page Analyse", function () { atSetLay("ana"); }], [tlFilter.hideEmpty ? "Afficher les lignes sans tag" : "Masquer les lignes sans tag", function () { tlFilter.hideEmpty = !tlFilter.hideEmpty; renderTimeline(cur()); }], ["Plein écran vidéo", atFull]]; }],
    ["Match", function () { return atMatchItems(); }],
    ["Codes", function () { return [["Modifier le panel", function () { openPanelEditor(); }], ["Afficher tous les codes", function () { at.hidden = {}; atSave(); renderLog(cur()); }]]; }],
    ["Clips", function () { return [["Lire le clip", function () { atClip("play"); }], ["Finir le clip ici", function () { atClip("endhere"); }], [currentTag() && atIsStar(cur(), currentTag()) ? "Ne plus garder le clip" : "Garder le clip", atToggleStar], ["Couper le clip", function () { atClip("split"); }], ["Exporter le clip", function () { atClip("export"); }], ["Trier les clips du projet", atSort]]; }],
    ["Outils", function () { var m = cur(), l = [["Changer la vidéo", function () { videoAction("pick"); }], ["Capture d'image", atCapture]]; if (m && isVideo(m) && videoReady) { l.push(["Coup d'envoi ici", function () { videoAction("k1"); }]); l.push(["2e mi-temps ici", function () { videoAction("k2"); }]); } return l; }],
    ["Aide", function () { return [["Toucher un clip : le lire", function () {}], ["Toucher deux fois : le déplacer", function () {}], ["Pincer la règle : zoomer", function () {}]]; }]
  ];
  function atMatchItems() {
    var m = cur(), a = atProject(), l = [];
    if (a) pjMatches(a).forEach(function (x) { l.push([(x.id === m.id ? "• " : "") + x.home + " – " + x.away, function () { if (x.id !== m.id) openMatch(x.id); }]); });
    if (a) l.push(["Ajouter un match au projet", function () { showHome("projects"); openPjForm(a); }]);
    l.push(["Mes projets", function () { showHome("projects"); }]);
    return l;
  }
  AT_MENUS.forEach(function (mn) { var b = atBtn("", mn[0], null, function () { atPop(b, mn[1]()); }); b.dataset.mmenu = "1"; atMenu.appendChild(b); });
  atMenu.appendChild(atSpan("r", "Version beta"));
  atVM.insertBefore(atMenu, atVM.firstChild);

  /* ---- Barre d'outils ---- */
  var atTop = atVM.querySelector(".topbar"), atLayBtns = [];
  var atCombo = atBtn("at-combo", "", "Changer de match", function () { atPop(atCombo, atMatchItems()); }); atCombo.dataset.mmenu = "1";
  var atImp = atBtn("at-b3", atIc("import", 15) + "Importer" + atIc("chevd", 11, "#CFCFCF", 2.2), null, function () { atPop(atImp, [["Changer la vidéo du match", function () { videoAction("pick"); }], ["Importer un match (fichier)", function () { showHome("projects"); var bi = $("btn-import"); if (bi) bi.click(); }]]); }); atImp.dataset.mmenu = "1";
  [atBtn("at-tbtn", atIc("undo", 16) + "Annuler", "Annuler la dernière action", atDoUndo), atSpan("at-sep"),
   atSpan("at-lab", "Match"), atCombo, atSpan("at-sep")].forEach(function (n) { atTop.appendChild(n); });
  var atMode = atSpan("at-mode");
  [["code", "tag", "Codage"], ["ana", "film", "Analyse"]].forEach(function (l) { var b = atBtn("", atIc(l[1], 15) + l[2], "Page " + l[2], function () { atSetLay(l[0]); }); b.dataset.lay = l[0]; atLayBtns.push(b); atMode.appendChild(b); });
  atTop.appendChild(atMode);
  [atSpan("at-sep"), atBtn("at-tbtn ic", atIc("photo", 17), "Capture d'image", atCapture), atBtn("at-tbtn", atIc("sort", 16) + "Trier", "Trier les clips du projet", atSort),
   atSpan("at-flex"), atImp, atBtn("at-b3 br", atIc("export", 15, null, 2.2) + "Exporter", null, function () { $("btn-export").click(); }),
   atBtn("at-b3", atIc("clipboard", 15) + "Rapport", "Bilan du match", function () { atSetLay("ana"); atSetTab("sum"); }),
   atBtn("at-b3", atIc("save", 15) + "Sauvegarder", null, function () { $("btn-save").click(); })].forEach(function (n) { atTop.appendChild(n); });

  /* ---- En-têtes de panneaux ---- */
  var atPH = el("div", "at-dh"); atPH.innerHTML = 'Panel<small id="at-pn"></small><span class="sp"></span>';
  var atSeg = atSpan("at-seg"); atSeg.appendChild(atBtn("on", "Coder")); atSeg.appendChild(atBtn("", "Modifier", "Modifier le panel", function () { openPanelEditor(); })); atPH.appendChild(atSeg);
  var atDelLast = atBtn("at-del", atIc("undo", 15) + "Supprimer", "Supprimer le dernier tag", function () {
    var m = cur(); if (!m || !m.tags.length) return;
    var t = m.tags[m.tags.length - 1]; stopPlayback(); deleteTag(m, t.id);
  });
  var atLast = el("div", "at-last"); atLast.innerHTML = '<span class="l">Dernier tag</span><i class="sw"></i><b id="at-last-nm">Aucun</b><span class="tm" id="at-last-tm"></span><span class="sp"></span>';
  atLast.appendChild(atDelLast); $("clockbar").appendChild(atLast);
  $("events").insertBefore(atPH, $("events").firstChild);

  /* ---- Plusieurs panels : bibliothèque enregistrée avec les matchs, le panel actif reste dans matches.panel ---- */
  function atLib() {
    var L = matches.panelLib;
    if (!L || L.deleted || !Array.isArray(L.items) || !L.items.length) {
      L = { id: "panelLib", kind: "panelLib", items: [{ id: uid("pl"), name: "Mon panel", buttons: [] }], updatedAt: 0 };
      L.active = L.items[0].id;
    }
    if (!L.items.some(function (i) { return i.id === L.active; })) L.active = L.items[0].id;
    return L;
  }
  function atActive(L) { for (var i = 0; i < L.items.length; i++) if (L.items[i].id === L.active) return L.items[i]; return L.items[0]; }
  function atSnap() { return JSON.parse(JSON.stringify(layout())); }
  function atLibSave(L) { L.updatedAt = Date.now(); matches.panelLib = L; saveLocal(); markDirty("panelLib"); }
  /* v2 : après l'import d'une sauvegarde, le panel actif est celui dont les boutons correspondent au plus grand nombre de tags. */
  function atBestPanel() {
    var L = matches.panelLib; if (!L || L.deleted || !Array.isArray(L.items) || L.items.length < 2) return;
    var count = {};
    Object.keys(matches).forEach(function (k) { var m = matches[k]; if (m && !m.deleted && Array.isArray(m.tags)) m.tags.forEach(function (t) { var l = normLab(t.lbl); if (l) count[l] = (count[l] || 0) + 1; }); });
    var best = null, bestN = -1;
    L.items.forEach(function (it) {
      var bs = it.id === L.active && matches.panel && Array.isArray(matches.panel.buttons) ? matches.panel.buttons : (it.buttons || []);
      var seen = {}, n = 0;
      bs.forEach(function (b) { var l = normLab(b.label); if (b.type !== "label" && !seen[l]) { seen[l] = 1; n += count[l] || 0; } });
      if (n > bestN || (n === bestN && it.id === L.active)) { bestN = n; best = it; }
    });
    if (!best || best.id === L.active) return;
    var cur0 = atActive(L); if (matches.panel && Array.isArray(matches.panel.buttons)) cur0.buttons = JSON.parse(JSON.stringify(matches.panel.buttons));
    L.active = best.id; L.updatedAt = Date.now(); markDirty("panelLib");
    matches.panel = { id: "panel", kind: "panel", v: 4, h: 1, buttons: JSON.parse(JSON.stringify(best.buttons || [])), updatedAt: Date.now() };
    layoutCache = { stamp: null, list: null }; markDirty("panel");
  }
  function atLoadPanel(buttons) {
    matches.panel = { id: "panel", kind: "panel", v: 4, h: 1, buttons: JSON.parse(JSON.stringify(buttons)), updatedAt: Date.now() };
    layoutCache = { stamp: null, list: null };
    saveLocal(); markDirty("panel");
    padSel = null; renderAll(); atPanelName();
  }
  function atAskName(q, def) {
    var n = window.prompt(q, def || ""); if (n === null) return null;
    n = n.trim().slice(0, 30); return n || null;
  }
  function atSwitchPanel(id) {
    var L = atLib(); if (id === L.active) return;
    atActive(L).buttons = atSnap();
    L.active = id; var t = atActive(L);
    atLibSave(L); atLoadPanel(t.buttons && t.buttons.length ? t.buttons : defaultLayout(DEFAULT_EVENTS));
    showToast("Panel « " + t.name + " »", false);
  }
  function atNewPanel(copy) {
    var L = atLib(), cur0 = atActive(L);
    var n = atAskName(copy ? "Nom de la copie :" : "Nom du nouveau panel :", copy ? cur0.name + " (copie)" : "Nouveau panel"); if (!n) return;
    cur0.buttons = atSnap();
    var it = { id: uid("pl"), name: n, buttons: copy ? atSnap() : defaultLayout(DEFAULT_EVENTS) };
    L.items.push(it); L.active = it.id; atLibSave(L); atLoadPanel(it.buttons);
    showToast("Panel « " + n + " » créé", false);
  }
  function atRenamePanel() {
    var L = atLib(), a = atActive(L), n = atAskName("Nouveau nom du panel :", a.name); if (!n) return;
    a.name = n; a.buttons = atSnap(); atLibSave(L); atPanelName();
  }
  function atDeletePanel() {
    var L = atLib(); if (L.items.length < 2) { showToast("Il te faut au moins un panel.", false); return; }
    var a = atActive(L); if (!window.confirm("Supprimer le panel « " + a.name + " » ? Tes tags déjà posés restent.")) return;
    L.items = L.items.filter(function (i) { return i.id !== a.id; }); L.active = L.items[0].id;
    var t = atActive(L); atLibSave(L); atLoadPanel(t.buttons && t.buttons.length ? t.buttons : defaultLayout(DEFAULT_EVENTS));
    showToast("Panel supprimé. Panel actif : « " + t.name + " »", false);
  }
  var atPick = atBtn("at-pick", "", "Changer de panel", function () {
    var L = atLib(), items = L.items.map(function (i) { return [(i.id === L.active ? "✓  " : "     ") + i.name, function () { atSwitchPanel(i.id); }]; });
    items.push(["+  Nouveau panel", function () { atNewPanel(false); }]);
    items.push(["Dupliquer ce panel", function () { atNewPanel(true); }]);
    items.push(["Renommer ce panel", atRenamePanel]);
    if (L.items.length > 1) items.push(["Supprimer ce panel", atDeletePanel, true]);
    atPop(atPick, items);
  });
  function atPanelName() { var L = atLib(); atPick.innerHTML = "<span>" + atActive(L).name.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }) + "</span>" + atIc("chevd", 13); atPick.title = L.items.length + " panel" + (L.items.length > 1 ? "s" : "") + " · changer de panel"; }
  atPick.dataset.mmenu = "1"; atPH.insertBefore(atPick, atPH.querySelector(".sp"));
  var atREp = renderEvents; renderEvents = function (m) { atREp(m); atPanelName(); };
  atPanelName();
  var atNote = document.querySelector("#view-panel .panel-note"); if (atNote) atNote.textContent = "Choisis le panel à modifier avec le menu à côté de « Panel ». Les changements sont enregistrés au fur et à mesure, et le panel choisi est celui que tu utilises pour coder.";
  var atVH = el("div", "at-dh"); atVH.innerHTML = 'Lecteur<small id="at-vn"></small><span class="sp"></span>';
  atVH.appendChild(atBtn("ib", atIc("photo", 15), "Capture d'image", atCapture)); atVH.appendChild(atBtn("ib", atIc("film", 15), "Changer la vidéo", function () { videoAction("pick"); })); atVH.appendChild(atBtn("ib", atIc("full", 15), "Plein écran", atFull));
  $("videobox").insertBefore(atVH, $("videobox").firstChild);

  /* ---- Barre de lecture : curseur avec repères des tags ---- */
  var atSeek = el("div", "at-seek"); atSeek.innerHTML = '<span class="tr"></span><span class="pr" id="at-seek-pr"></span><span id="at-seek-mk"></span><span class="kn" id="at-seek-kn"></span>';
  $("clockbar").insertBefore(atSeek, $("clockbar").firstChild);
  function atSeekAt(e) { if (!videoReady || !isFinite(vid.duration)) return; var r = atSeek.getBoundingClientRect(); stopPlayback(); seekTo(Math.max(0, Math.min(1, (e.clientX - r.left - 8) / (r.width - 16))) * vid.duration); atSeekPos(); }
  var atSeeking = false;
  atSeek.addEventListener("pointerdown", function (e) { atSeeking = true; try { atSeek.setPointerCapture(e.pointerId); } catch (x) {} atSeekAt(e); });
  atSeek.addEventListener("pointermove", function (e) { if (atSeeking) atSeekAt(e); });
  ["pointerup", "pointercancel"].forEach(function (k) { atSeek.addEventListener(k, function () { atSeeking = false; }); });
  function atSeekPos() { var f = videoReady && isFinite(vid.duration) && vid.duration > 0 ? vid.currentTime / vid.duration : 0; $("at-seek-pr").style.width = "calc((100% - 16px) * " + f + ")"; $("at-seek-kn").style.left = "calc(8px + (100% - 16px) * " + f + " - 5px)"; }
  vid.addEventListener("timeupdate", atSeekPos); vid.addEventListener("loadedmetadata", function () { atSeekPos(); setTimeout(atFit, 30); var m = cur(); if (m) atRefresh(m); });

  /* ---- Colonne de droite ---- */
  var atSide = el("div", "at-side");
  atSide.innerHTML = '<div class="at-sh">' + atIc("funnel", 14) + 'Filtre</div>';
  var atStarBtn = atBtn("at-tg", atIc("star", 12, "#FFD23F") + "Gardés", "N'afficher que les clips gardés", function () { if (!atProject()) { showToast("Ajoute ce match à un projet pour garder des clips.", false); return; } at.star = !at.star; renderLog(cur()); });
  atSide.appendChild(atStarBtn);
  var atSh2 = el("div", "at-sh"); atSh2.innerHTML = atIc("gear", 14) + 'Paramètres<span class="sp"></span><span class="ct" id="at-count"></span>'; atSide.appendChild(atSh2);
  var atTabs = el("div", "at-tabs");
  [["cur", "selbox", "Zone et note du clip"], ["codes", "tag", "Codes"], ["last", "clock", "Derniers tags"], ["sum", "layers", "Bilan"]].forEach(function (t) { var b = atBtn("", atIc(t[1], 15), t[2], function () { atSetTab(t[0]); }); b.dataset.t = t[0]; atTabs.appendChild(b); });
  atSide.appendChild(atTabs);
  var atCodes = el("div", "at-codes"); atCodes.id = "at-codes";
  $("bottom").insertBefore(atCodes, $("bottom").firstChild); $("bottom").insertBefore(atSide, atCodes);
  atCodes.addEventListener("click", function (e) {
    var m = cur(), row = e.target.closest("[data-k]"), clip = e.target.closest("[data-c]"); if (!m) return;
    if (clip) { var t = findTag(m, clip.dataset.c); if (!t) return; tlEdit = null; currentTagId = t.id; renderCurrent(m); renderLog(m); if (isVideo(m) && videoReady && t.v != null) playClips([clipOf(m, t)]); return; }
    if (!row) return; var k = row.dataset.k;
    if (e.target.closest(".ck")) { if (at.hidden[k]) delete at.hidden[k]; else at.hidden[k] = 1; atSave(); renderLog(m); return; }
    at.open = at.open === k ? null : k; atRenderCodes(m);
  });
  function atShown(m, t) { return !at.star || atIsStar(m, t); }
  function atRenderCodes(m) {
    var rows = tlRows(m), ct = currentTag(), selKey = null, total = 0;
    atCodes.textContent = "";
    rows.forEach(function (r) {
      var tags = r.tags.filter(function (t) { return atShown(m, t); }); total += tags.length;
      if (ct && r.tags.indexOf(ct) >= 0) selKey = r.key;
      var d = el("div", "pr" + (ct && r.tags.indexOf(ct) >= 0 ? " sel" : "") + (at.open === r.key ? " open" : "")); d.dataset.k = r.key;
      d.innerHTML = atIc(at.open === r.key ? "chevd" : "chevr", 11, "#AFAFAF", 2.2) + '<span class="ck">' + (at.hidden[r.key] ? "" : atIc("check", 10, null, 3)) + '</span><span class="pill">' + tags.length + '</span>';
      var nm = el("span", "nm", r.label); d.appendChild(nm); var sw = el("i", "sw"); sw.style.background = r.color; d.appendChild(sw);
      atCodes.appendChild(d);
      if (at.open === r.key) {
        if (!tags.length) atCodes.appendChild(el("div", "pc none", "Aucun clip."));
        tags.slice().sort(function (a, b) { return (tlPos(m, a) || 0) - (tlPos(m, b) || 0); }).forEach(function (t, i) {
          var c = el("button", "pc" + (t.id === currentTagId ? " on" : "")); c.type = "button"; c.dataset.c = t.id;
          c.innerHTML = '<span class="n">' + (i + 1) + '</span><span class="tm">' + fmt(matchTime(t.p, t.t)) + '</span>' + (atIsStar(m, t) ? atIc("star", 11, "#FFD23F") : "");
          c.appendChild(el("span", "x", (t.res ? t.res : "") + (t.note ? (t.res ? " · " : "") + t.note : "")));
          atCodes.appendChild(c);
        });
      }
    });
    $("at-count").textContent = total + (total > 1 ? " tags" : " tag");
    atStarBtn.classList.toggle("on", at.star);
    return selKey;
  }

  /* ---- Barre de la timeline ---- */
  var atTlt = el("div", "at-tlt");
  var atFilterHost = atSpan("at-fh"); atTlt.appendChild(atFilterHost); atFilterHost.appendChild($("tl-filter"));
  atTlt.appendChild(atBtn("ib y", atIc("mprev", 15), "Clip précédent", function () { atJump(-1); }));
  atTlt.appendChild(atBtn("ib y", atIc("mnext", 15), "Clip suivant", function () { atJump(1); }));
  atTlt.appendChild(atSpan("at-sep"));
  var atSelBox = atSpan("at-sel"); atTlt.appendChild(atSelBox);
  var atStarOne = atBtn("ib", atIc("staro", 15), "Garder ce clip", atToggleStar); atTlt.appendChild(atStarOne);
  atTlt.appendChild($("clip-row"));
  atTlt.appendChild(atSpan("at-flex"));
  var atRange = document.createElement("input"); atRange.type = "range"; atRange.min = "1"; atRange.max = String(TL_MAX); atRange.step = "0.5"; atRange.className = "at-zs"; atRange.setAttribute("aria-label", "Zoom de la timeline");
  atRange.addEventListener("input", function () { atZoom(Number(atRange.value)); });
  atTlt.appendChild(atRange);
  var atPps = atSpan("at-pps"); atTlt.appendChild(atPps);
  atTlt.appendChild(atBtn("ib", atIc("zout", 15), "Dézoomer", function () { atZoom(prefs.tlZoom / 1.5); }));
  atTlt.appendChild(atBtn("ib", atIc("zin", 15), "Zoomer", function () { atZoom(prefs.tlZoom * 1.5); }));
  $("timeline").insertBefore(atTlt, $("timeline").firstChild);
  $("clip-split").textContent = "Couper"; $("clip-delete").textContent = "Supprimer"; $("clip-play").textContent = "Lire"; $("clip-export").textContent = "Exporter";

  /* ---- Barre d'icônes du bas ---- */
  var atDock = el("div", "at-dock"), atDockMode = [];
  atDock.innerHTML = '<span class="logo"><svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 2v14l12-7z" fill="#E9E9E9"/></svg>RL ANALYSIS<i>PRO</i></span>';
  var atDk = el("div", "dk");
  [["home", "#F2F2F2", "Accueil", function () { showHome(); }], ["sliders", "#35B6FF", "Modifier le panel", function () { openPanelEditor(); }], ["sort", "#35B6FF", "Trier les clips du projet", atSort],
   ["trophy", "#FFC83D", "Mes projets", function () { showHome("projects"); }], ["clipboard", "#FFC83D", "Bilan du match", function () { atSetLay("ana"); atSetTab("sum"); }],
   ["tag", null, "Page Codage", function () { atSetLay("code"); }], ["film", null, "Page Analyse", function () { atSetLay("ana"); }], ["chart", "#7EDB5A", "Derniers tags", function () { atSetLay("ana"); atSetTab("last"); }], ["pencil", "#7EDB5A", "Zone et note du clip", function () { atSetLay("ana"); atSetTab("cur"); }],
   ["photo", "#FF7A45", "Capture d'image", atCapture], ["share", "#FF5252", "Exporter", function () { $("btn-export").click(); }], ["cam", "#FF5252", "Changer la vidéo", function () { videoAction("pick"); }],
   ["cloud", "#F26FA0", "Sauvegarder", function () { $("btn-save").click(); }]].forEach(function (d) { var b = atBtn("", atIc(d[0], 22, d[1] || "#F2F2F2", 1.9), d[2], d[3]); if (!d[1]) { b.dataset.lay = d[2] === "Page Codage" ? "code" : "ana"; b.classList.add("md"); atDockMode.push(b); } atDk.appendChild(b); });
  atDock.appendChild(atDk);
  var atWho = atBtn("who", '<span>Raphaël L.<small>Analyste vidéo</small></span>' + atIc("user", 21, "#E0E0E0"), "Compte et synchronisation", function () { var b = $("btn-sync"); if (b) b.click(); });
  atDock.appendChild(atWho);
  atVM.appendChild(atDock);

  /* ---- Rendu : on complète les fonctions du logiciel ---- */
  function atCase(s) { s = String(s); return s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s; }
  function atRefresh(m) {
    if (panelMode || !m || !m.tags) return;
    var selKey = v2Vis("codes") ? atRenderCodes(m) : null, ct = currentTag(), rows = tlRows(m), byId = {};
    rows.forEach(function (r) { byId[r.key] = r; });
    /* panel : compteur et bouton du clip sélectionné */
    var nodes = $("event-grid").querySelectorAll("button.pb");
    for (var i = 0; i < nodes.length; i++) {
      var r = byId["b:" + nodes[i].dataset.item], n = nodes[i].querySelector(".at-n");
      if (!n) { n = el("i", "at-n"); nodes[i].appendChild(n); }
      n.textContent = r && r.tags.length ? String(r.tags.length) : "";
      nodes[i].classList.toggle("at-sel", !!(ct && r && r.tags.indexOf(ct) >= 0));
    }
    /* sélection dans la barre de la timeline */
    if (ct) {
      var p = matchTime(ct.p, ct.t), d = Math.round((pre(ct) + post(ct)) * 10) / 10;
      atSelBox.innerHTML = '<span class="l">Sélection :</span><b></b><span class="m">' + fmt(Math.max(0, p - pre(ct))) + ' – ' + fmt(p + post(ct)) + ' · ' + String(d).replace(".", ",") + ' s</span>';
      atSelBox.querySelector("b").textContent = atCase(tagLabel(ct));
    } else atSelBox.innerHTML = '<span class="l">Sélection : aucun clip</span>';
    var st = !!(ct && atIsStar(m, ct)); atStarOne.innerHTML = atIc(st ? "star" : "staro", 15, st ? "#FFD23F" : null); atStarOne.hidden = !ct;
    /* repères sur le curseur de lecture */
    var mk = $("at-seek-mk"), mkKey = (isVideo(m) && videoReady ? vid.duration : 0) + "|" + at.star + "|" + layoutCache.stamp + "|" + m.tags.length + "|" + m.tags.reduce(function (n, t) { return n + (t.v || 0) + (t.team === "away" ? 0.001 : 0); }, 0);
    if (mk.dataset.key === mkKey) { atSeekPos(); } else { mk.dataset.key = mkKey; mk.textContent = "";
    if (isVideo(m) && videoReady && isFinite(vid.duration) && vid.duration > 0) { var mh = []; m.tags.forEach(function (t) { if (t.v == null || !atShown(m, t)) return; mh.push('<i style="left:calc(8px + (100% - 16px) * ' + Math.min(1, t.v / vid.duration) + ');background:' + tagColor(t) + '"></i>'); }); mk.innerHTML = mh.join(""); }
    atSeekPos(); }
    /* en-têtes */
    $("at-pn").textContent = padButtons().length + " codes";
    var lt = m.tags.length ? m.tags[m.tags.length - 1] : null; atDelLast.disabled = !lt; $("at-last-nm").textContent = lt ? atCase(tagLabel(lt)) : "Aucun"; $("at-last-tm").textContent = lt ? fmt(matchTime(lt.p, lt.t)) + (lt.res ? " · " + lt.res : "") : ""; atLast.querySelector(".sw").style.background = lt ? tagColor(lt) : "transparent"; atLast.classList.toggle("empty", !lt); atDelLast.title = lt ? "Supprimer « " + atCase(tagLabel(lt)) + " » à " + fmt(matchTime(lt.p, lt.t)) : "Aucun tag";
    $("at-vn").textContent = isVideo(m) && m.video && m.video.name ? m.video.name + (videoReady && vid.videoWidth ? " · " + vid.videoWidth + "×" + vid.videoHeight : "") : "";
    var a = atProject();
    atCombo.innerHTML = '<b></b><span class="s"></span>' + atIc("chevd", 12, "#BDBDBD", 2.2);
    atCombo.querySelector("b").textContent = m.home + " – " + m.away; atCombo.querySelector(".s").textContent = a ? a.name : "";
    return selKey;
  }
  var atRT = renderTimeline;
  renderTimeline = function (m) {
    if (!v2Vis("tl")) { tlDur = tlAxis(m).dur; return; }
    atRT(m);
    if (panelMode) return;
    var labs = $("tl-labels").children, rows = $("tl-rows").children, trackW = $("tl-inner").getBoundingClientRect().width, ct = currentTag(), all = tlRows(m), byKey = {}, tagById = {};
    m.tags.forEach(function (x) { tagById[x.id] = x; });
    all.forEach(function (r) { byKey[r.key] = r; });
    for (var i = 0; i < labs.length; i++) {
      var k = labs[i].dataset.row, r = byKey[k], hide = !!at.hidden[k], sel = !!(ct && r && r.tags.indexOf(ct) >= 0);
      labs[i].style.display = hide ? "none" : ""; if (rows[i]) rows[i].style.display = hide ? "none" : "";
      labs[i].classList.toggle("sel", sel); if (rows[i]) rows[i].classList.toggle("sel", sel);
      var nm = labs[i].querySelector(".nm"); if (nm) nm.textContent = atCase(nm.textContent);
      if (!rows[i]) continue;
      var bl = rows[i].querySelectorAll(".tl-block");
      for (var j = 0; j < bl.length; j++) {
        var t = tagById[bl[j].dataset.tl], w = parseFloat(bl[j].style.width) / 100 * trackW;
        if (t && !atShown(m, t)) { bl[j].style.display = "none"; continue; }
        if (bl[j].firstChild && bl[j].firstChild.nodeType === 3) bl[j].firstChild.nodeValue = w >= 54 && r ? atCase(r.label) : (w >= 16 ? bl[j].firstChild.nodeValue : "");
        bl[j].classList.toggle("wide", w >= 54);
      }
    }
    var sc = $("tl-scroll"), pps = tlDur > 0 ? sc.clientWidth * prefs.tlZoom / tlDur : 0;
    atPps.textContent = (pps >= 10 ? Math.round(pps) : String(Math.round(pps * 10) / 10).replace(".", ",")) + " px/s";
    if (document.activeElement !== atRange) atRange.value = String(prefs.tlZoom);
    /* premier passage : zoom de travail (environ 6 px par seconde), comme une table de montage */
    if (!at.zoomSet && isVideo(m) && videoReady && isFinite(vid.duration) && vid.duration > 60 && sc.clientWidth > 0) {
      at.zoomSet = true; atSave();
      if (prefs.tlZoom === 1) { prefs.tlZoom = Math.max(1, Math.min(TL_MAX, Math.round(6 * vid.duration / sc.clientWidth))); savePrefs(); renderTimeline(m); tlReveal(tlAxis(m).now / tlDur, true); }
    }
  };
  var atRL = renderLog; renderLog = function (m) { atRL(m); atRefresh(m); };
  var atRM = renderMatch; renderMatch = function () { atRM(); requestAnimationFrame(atFit); };
  function atResRow() {
    var res = $("results"), tag = currentTag();
    if (!res.querySelector("button")) {
      res.textContent = "";
      ["Réussi", "Raté"].forEach(function (r) { var b = el("button", "", r); b.type = "button"; b.dataset.res = r; b.disabled = !tag; b.setAttribute("aria-pressed", String(!!tag && tag.res === r)); res.appendChild(b); });
    }
    var cb = document.querySelector("#events .cur-box"); if (cb) cb.hidden = !!padEdit;
  }
  var atRC = renderCurrent; renderCurrent = function (m) { atRC(m); if (!panelMode && m && m.tags) atResRow(); };
  /* Même rendu que la première interface (lignes de 4 px + 2 px d'écart), agrandi d'un seul facteur pour remplir la hauteur */
  function atScalePad() {
    var grid = $("event-grid"); if (!grid.classList.contains("at-fill")) return;
    var max = +grid.dataset.rows || 1, cs = getComputedStyle(grid);
    var avail = grid.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (avail <= 0) return;
    var k = Math.max(0.6, (avail + PAD_GAP) / (max * (ROW_H + PAD_GAP)));
    grid.style.setProperty("--atg", (PAD_GAP * k).toFixed(2) + "px");
    grid.style.gridTemplateRows = "repeat(" + max + ", " + (ROW_H * k).toFixed(2) + "px)";
  }
  if (window.ResizeObserver) new ResizeObserver(function () { atScalePad(); }).observe($("event-grid"));
  var atRE = renderEvents;
  renderEvents = function (m) {
    atRE(m);
    var grid = $("event-grid"), cb = document.querySelector("#events .cur-box");
    if (panelMode || padEdit) { grid.classList.remove("at-fill"); return; }
    /* le panel occupe toute la hauteur : les lignes vides disparaissent, les autres se partagent la place */
    var used = [], max = 0;
    layout().forEach(function (it) { for (var r = it.r; r < it.r + it.h; r++) used[r] = 1; max = Math.max(max, it.r + it.h); });
    grid.classList.add("at-fill"); grid.dataset.rows = max;
    atResRow(); atScalePad(); requestAnimationFrame(atScalePad);
  };
  var atAdd = addTag; addTag = function () { var m = cur(); if (m) atPush({ id: m.id, json: JSON.stringify(m) }); return atAdd.apply(this, arguments); };
  var atST = showToast; showToast = function (t, w) { if (w && pendingUndo) atPush(pendingUndo); atST(t, w); };
  atApplyLay(); atSetTab("codes");
  window.addEventListener("resize", function () { atFit(); var m = cur(); if (m && !$("view-match").hidden) renderTimeline(m); });
  if (cur() && !$("view-match").hidden) renderMatch();

})();
