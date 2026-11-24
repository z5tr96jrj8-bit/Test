/* Trier : clips d'un projet par tag, sur un ou plusieurs matchs ; montage exporté en un fichier. */
import { $, el, fmt } from "./util.js";
import { S, doc, edit, pjDoc, pjMatches, layout } from "./state.js";
import { padButtons, tagLabel, tagColor, tlPos, pre, post, isVideo, shortLabel } from "./model.js";
import { App, toast, showOnly } from "./ui-common.js";
import { vsGet, vsSave } from "./videostore.js";
import { saveFile } from "./download.js";
import { pickMime, recUnavailable } from "./player.js";

const sv = { cat: null, match: "all", cur: null, end: null, star: false, mid: null, pending: null, back: null, rec: null };
let urls = {};

function groups(a) {
  const list = layout(), g = {}, order = [];
  padButtons(list).forEach(function (b) { if (!g[b.label]) { g[b.label] = { label: b.label, color: b.color, clips: [] }; order.push(b.label); } });
  pjMatches(a).forEach(function (m) {
    m.tags.forEach(function (t) {
      if (t.status && t.status !== "accepted") return;
      const k = tagLabel(t, list);
      if (!g[k]) { g[k] = { label: k, color: tagColor(t, list), clips: [] }; order.push(k); }
      g[k].clips.push({ m: m, t: t, key: m.id + ":" + t.id });
    });
  });
  const pos = {}; padButtons(list).forEach(function (b, i) { if (!(b.label in pos)) pos[b.label] = i; });
  order.sort(function (x, y) { return (x in pos ? pos[x] : 999) - (y in pos ? pos[y] : 999) || x.localeCompare(y); });
  return order.map(function (k) {
    g[k].clips.sort(function (p, q) { return (a.matchIds.indexOf(p.m.id) - a.matchIds.indexOf(q.m.id)) || ((tlPos(p.m, p.t) || 0) - (tlPos(q.m, q.t) || 0)); });
    return g[k];
  });
}
function filt(a, clips) { return clips.filter(function (c) { return (sv.match === "all" || c.m.id === sv.match) && (!sv.star || (a.stars && a.stars[c.key])); }); }
function visible(a) { const g = groups(a).filter(function (x) { return x.label === sv.cat; })[0]; return g ? filt(a, g.clips) : []; }

export function openSort() {
  const a = pjDoc(); if (!a) return;
  sv.back = S.currentMatchId;
  App.leaveOthers();
  sv.cur = null; sv.end = null; sv.mid = null; sv.pending = null;
  if (sv.match !== "all" && (a.matchIds || []).indexOf(sv.match) < 0) sv.match = "all";
  showOnly("view-sort");
  const v = $("sv-video"); v.pause(); v.removeAttribute("src"); delete v.dataset.match; v.load();
  empty("Choisis un tag à gauche, puis un clip.", false);
  renderSort(); App.requestWake();
}
export function leaveSort() {
  if ($("view-sort").hidden) return;
  if (sv.rec) recCancel("");
  const v = $("sv-video"); v.pause(); v.removeAttribute("src"); delete v.dataset.match; v.load();
  Object.keys(urls).forEach(function (k) { try { URL.revokeObjectURL(urls[k]); } catch (e) {} }); urls = {};
  $("view-sort").hidden = true;
}
export function renderSort() {
  const a = pjDoc(); if (!a) { leaveSort(); App.showHome("projects"); return; }
  const ms = pjMatches(a), list = layout();
  $("sv-head").textContent = "Trier · " + a.name;
  const seg = $("sv-seg"); seg.textContent = "";
  const all = el("button", sv.match === "all" ? "on" : "", "Tous les matchs"); all.type = "button"; all.dataset.smatch = "all"; seg.appendChild(all);
  ms.forEach(function (m) { const b = el("button", sv.match === m.id ? "on" : ""); b.type = "button"; b.dataset.smatch = m.id; b.title = m.home + " – " + m.away; b.appendChild(document.createTextNode(shortLabel(ms, m, a.myTeam))); seg.appendChild(b); });
  $("sv-star-only").setAttribute("aria-pressed", String(sv.star));
  const ul = $("sv-cats"); ul.textContent = "";
  const gs = groups(a);
  if (sv.cat && !gs.some(function (x) { return x.label === sv.cat; })) sv.cat = null;
  $("sv-cat-back").hidden = !sv.cat;
  if (!sv.cat) {
    $("sv-side-title").textContent = sv.match === "all" ? "Par tag · tous les matchs" : "Par tag · " + shortLabel(ms, doc(sv.match), a.myTeam);
    gs.forEach(function (g, i) {
      const n = filt(a, g.clips).length, li = el("li"), b = el("button", n ? "" : "zero"); b.type = "button"; b.dataset.scat = g.label;
      b.appendChild(el("span", "nn", String(i + 1))); const sw = el("span", "sw"); sw.style.background = g.color; b.appendChild(sw);
      b.appendChild(el("span", "nm", g.label)); b.appendChild(el("span", "ct", n + (n > 1 ? " clips" : " clip")));
      li.appendChild(b); ul.appendChild(li);
    });
    if (!gs.length) ul.appendChild(el("li", "cat-none", "Aucun tag dans ton panel."));
  } else {
    const clips = visible(a), total = (gs.filter(function (x) { return x.label === sv.cat; })[0] || { clips: [] }).clips.length;
    $("sv-side-title").textContent = sv.cat + " · " + clips.length + (clips.length !== total ? " / " + total : "");
    let lastM = null;
    clips.forEach(function (c) {
      if (c.m !== lastM) { lastM = c.m; ul.appendChild(el("li", "sv-grp", c.m.home + " – " + c.m.away)); }
      const li = el("li", "sv-clip" + (sv.cur && sv.cur.key === c.key ? " on" : "")), b = el("button"); b.type = "button"; b.dataset.sclip = c.key;
      const x = tlPos(c.m, c.t); b.appendChild(el("span", "tm", x != null ? fmt(x) : "--:--")); b.appendChild(el("span", "nm", c.t.note || c.t.res || ""));
      const on = !!(a.stars && a.stars[c.key]), st = el("button", "st", on ? "★" : "☆"); st.type = "button"; st.dataset.sstar = c.key; st.setAttribute("aria-pressed", String(on)); st.setAttribute("aria-label", "Garder ce clip");
      li.appendChild(b); li.appendChild(st); ul.appendChild(li);
    });
    if (!clips.length) ul.appendChild(el("li", "cat-none", sv.star ? "Aucun clip gardé dans ce tag." : "Aucun clip de ce tag dans ce match."));
  }
  renderBar(a, list);
}
function renderBar(a, list) {
  const v = $("sv-video"), b = $("sv-export");
  const clips = a && sv.cat ? visible(a) : []; let dur = 0; clips.forEach(function (c) { dur += pre(c.t) + post(c.t); });
  b.disabled = !clips.length || !!sv.rec;
  b.textContent = clips.length ? "Exporter le montage (" + clips.length + (clips.length > 1 ? " clips · " : " clip · ") + fmt(dur) + ")" : "Exporter le montage";
  $("sv-play").innerHTML = '<svg class="ic"><use href="#i-' + (v.paused ? "play" : "pause") + '"/></svg>';
  const now = $("sv-now"); now.textContent = "";
  if (!sv.cur || !a) { if (sv.mid && doc(sv.mid)) now.textContent = doc(sv.mid).home + " – " + doc(sv.mid).away; $("sv-star").hidden = true; return; }
  const x = tlPos(sv.cur.m, sv.cur.t);
  now.appendChild(document.createTextNode(tagLabel(sv.cur.t, list || layout()) + " · " + sv.cur.m.home + " – " + sv.cur.m.away + " · " + (x != null ? fmt(x) : "")));
  const cl = visible(a), i = cl.map(function (c) { return c.key; }).indexOf(sv.cur.key);
  if (i >= 0) now.appendChild(el("span", "pos", "clip " + (i + 1) + " / " + cl.length));
  const on = !!(a.stars && a.stars[sv.cur.key]);
  $("sv-star").hidden = false; $("sv-star").textContent = on ? "★ Gardé" : "☆ Garder"; $("sv-star").setAttribute("aria-pressed", String(on));
}
function empty(text, btn) { $("sv-empty").hidden = false; $("sv-empty-text").textContent = text; $("sv-empty-btn").hidden = !btn; }
function urlOf(m) { if (urls[m.id]) return Promise.resolve(urls[m.id]); return vsGet(m.id).then(function (f) { if (!f) return null; urls[m.id] = URL.createObjectURL(f); return urls[m.id]; }); }
function openVid(m, at) {
  const v = $("sv-video");
  if (!isVideo(m)) { v.pause(); empty("Ce match a été tagué sans vidéo.", false); return; }
  urlOf(m).then(function (url) {
    if ($("view-sort").hidden) return;
    if (!url) { v.pause(); sv.pending = { m: m, at: at }; empty("La vidéo de " + m.home + " – " + m.away + " n'est pas encore sur cet appareil." + (m.video && m.video.name ? " (" + m.video.name + ")" : "") + " Choisis-la une fois, elle sera gardée.", true); return; }
    $("sv-empty").hidden = true;
    if (v.dataset.match !== m.id) { v.dataset.match = m.id; v.src = url; v.addEventListener("loadedmetadata", at, { once: true }); v.load(); } else at();
  });
}
function playOne(c) {
  sv.cur = c; sv.end = null; sv.mid = c.m.id;
  const start = Math.max(0, tlPos(c.m, c.t) - pre(c.t)), end = tlPos(c.m, c.t) + post(c.t);
  openVid(c.m, function () { const v = $("sv-video"); try { v.currentTime = start; } catch (err) {} sv.end = end; const pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); });
  renderSort();
}
function showMatch(m) { sv.cur = null; sv.end = null; sv.mid = m.id; openVid(m, function () { const v = $("sv-video"); v.pause(); try { v.currentTime = (m.video && m.video.pos) || 0; } catch (err) {} }); }
function step(d) { const a = pjDoc(); if (!a || !sv.cat) return; const cl = visible(a); if (!cl.length) return; const i = sv.cur ? cl.map(function (c) { return c.key; }).indexOf(sv.cur.key) : -1; playOne(cl[i < 0 ? 0 : Math.min(cl.length - 1, Math.max(0, i + d))]); }
function find(key) { const a = pjDoc(); if (!a) return null; let r = null; groups(a).forEach(function (g) { g.clips.forEach(function (c) { if (c.key === key) r = c; }); }); return r; }
function toggle() { const v = $("sv-video"); if (!v.getAttribute("src")) { step(0); return; } if (v.paused) { if (sv.cur && sv.end == null && v.currentTime >= tlPos(sv.cur.m, sv.cur.t) + post(sv.cur.t) - 0.3) { playOne(sv.cur); return; } const pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } else v.pause(); }
function star(key) { const a = pjDoc(); if (!a) return; edit([a.id], "Garder un clip", function () { a.stars = a.stars || {}; if (a.stars[key]) delete a.stars[key]; else a.stars[key] = true; }); renderSort(); }

/* ---------- Montage ---------- */
function exportMontage() {
  const a = pjDoc(); if (!a || !sv.cat || sv.rec) return;
  const clips = visible(a); if (!clips.length) return;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { recUnavailable(); return; }
  const mids = []; clips.forEach(function (c) { if (mids.indexOf(c.m.id) < 0) mids.push(c.m.id); });
  Promise.all(mids.map(function (id) { return urlOf(doc(id)); })).then(function (us) {
    const missing = mids.filter(function (id, i) { return !us[i]; });
    if (missing.length) { toast("Il manque la vidéo de : " + missing.map(function (id) { return doc(id).home + " – " + doc(id).away; }).join(", ") + ". Ouvre un de ses clips pour la choisir.", false); return; }
    recStart(a, clips);
  });
}
function recStart(a, clips) {
  const v = $("sv-video"); v.pause(); sv.end = null;
  const W = 1280, H = 720, canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  const mime = pickMime(); let rec;
  try { rec = new MediaRecorder(canvas.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 5000000 } : undefined); } catch (e) { recUnavailable(); return; }
  const chunks = [], name = (a.name + " - " + sv.cat).replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
  const st = sv.rec = { clips: clips, i: 0, rec: rec, ctx: ctx, cancelled: false, raf: 0, lastT: -1, lastMove: Date.now(), muted: v.muted };
  rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = function () {
    v.pause(); v.muted = st.muted; sv.rec = null; renderSort();
    if (st.cancelled) { if (!st.msg) $("rec-overlay").hidden = true; return; }
    if (!chunks.length) { $("rec-msg").textContent = "L'enregistrement n'a rien produit. Réessaie."; $("rec-cancel").textContent = "Fermer"; return; }
    const type = rec.mimeType || mime || "video/webm", ext = /mp4/.test(type) ? "mp4" : "webm";
    saveFile(name + "." + ext, new Blob(chunks, { type: type })).then(function () { $("rec-overlay").hidden = true; toast("Montage enregistré : " + name + "." + ext, false); });
  };
  v.muted = true; $("rec-cancel").textContent = "Annuler"; $("rec-overlay").hidden = false;
  try { rec.start(1000); rec.pause(); } catch (e) { sv.rec = null; $("rec-overlay").hidden = true; recUnavailable(); return; }
  renderSort(); recNext(st);
}
function draw(st) {
  const v = $("sv-video"), vw = v.videoWidth || 16, vh = v.videoHeight || 9, k = Math.min(1280 / vw, 720 / vh), dw = vw * k, dh = vh * k;
  st.ctx.fillStyle = "#000"; st.ctx.fillRect(0, 0, 1280, 720);
  try { st.ctx.drawImage(v, (1280 - dw) / 2, (720 - dh) / 2, dw, dh); } catch (e) {}
}
function recNext(st) {
  if (sv.rec !== st || st.cancelled) return;
  if (st.i >= st.clips.length) { try { st.rec.stop(); } catch (e) {} return; }
  const c = st.clips[st.i], v = $("sv-video");
  sv.cur = c; sv.mid = c.m.id; renderSort();
  $("rec-msg").textContent = "Montage : clip " + (st.i + 1) + " sur " + st.clips.length + ", enregistré en temps réel. Garde cette page ouverte et l'écran allumé.";
  const start = Math.max(0, tlPos(c.m, c.t) - pre(c.t)), end = tlPos(c.m, c.t) + post(c.t);
  let started = false;
  const go = function () {
    if (started || sv.rec !== st || st.cancelled) return;
    started = true; v.removeEventListener("seeked", go);
    const stop = isFinite(v.duration) ? Math.min(end, v.duration - 0.05) : end;
    draw(st); try { st.rec.resume(); } catch (e) {}
    const pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
    st.lastT = -1; st.lastMove = Date.now();
    const frame = function () {
      if (sv.rec !== st || st.cancelled) return;
      draw(st); const t = v.currentTime;
      if (t !== st.lastT) { st.lastT = t; st.lastMove = Date.now(); }
      if (t >= stop || v.ended) { v.pause(); try { st.rec.pause(); } catch (e) {} st.i++; recNext(st); return; }
      if (Date.now() - st.lastMove > 8000) { recCancel("La lecture s'est arrêtée pendant l'enregistrement. Réessaie en gardant la page au premier plan."); return; }
      st.raf = requestAnimationFrame(frame);
    };
    st.raf = requestAnimationFrame(frame);
  };
  const seek = function () { v.addEventListener("seeked", go); try { v.currentTime = start; } catch (e) {} setTimeout(go, 2500); };
  urlOf(c.m).then(function (url) {
    if (sv.rec !== st || st.cancelled) return;
    if (!url) { recCancel("La vidéo de " + c.m.home + " – " + c.m.away + " n'est plus disponible."); return; }
    $("sv-empty").hidden = true;
    if (v.dataset.match !== c.m.id) { v.dataset.match = c.m.id; v.src = url; v.addEventListener("loadedmetadata", seek, { once: true }); v.load(); } else seek();
  });
}
function recCancel(msg) {
  const st = sv.rec; if (!st) return false;
  st.cancelled = true; st.msg = msg || ""; cancelAnimationFrame(st.raf);
  if (msg) { $("rec-msg").textContent = msg; $("rec-cancel").textContent = "Fermer"; try { st.rec.stop(); } catch (e) {} $("rec-overlay").hidden = false; return true; }
  try { st.rec.stop(); } catch (e) { sv.rec = null; }
  $("rec-overlay").hidden = true; return true;
}
export function cancelMontage() { return recCancel(""); }

export function initSort() {
  $("sv-back").addEventListener("click", function () {
    const a = pjDoc(), back = sv.back && doc(sv.back) ? sv.back : (a && pjMatches(a)[0] ? pjMatches(a)[0].id : null);
    if (back) App.openMatch(back); else App.showHome("projects");
  });
  $("sv-export").addEventListener("click", exportMontage);
  const v = $("sv-video");
  v.addEventListener("timeupdate", function () { if (sv.end != null && v.currentTime >= sv.end) { v.pause(); sv.end = null; } });
  v.addEventListener("play", function () { renderBar(pjDoc()); }); v.addEventListener("pause", function () { renderBar(pjDoc()); });
  v.addEventListener("click", toggle); $("sv-play").addEventListener("click", toggle);
  $("sv-prev").addEventListener("click", function () { step(-1); }); $("sv-next").addEventListener("click", function () { step(1); });
  $("sv-star").addEventListener("click", function () { if (sv.cur) star(sv.cur.key); });
  $("sv-star-only").addEventListener("click", function () { sv.star = !sv.star; renderSort(); });
  $("sv-cat-back").addEventListener("click", function () { sv.cat = null; renderSort(); });
  $("sv-seg").addEventListener("click", function (e) { const b = e.target.closest("button[data-smatch]"); if (!b) return; sv.match = b.dataset.smatch; if (sv.match !== "all" && doc(sv.match) && (!sv.cur || sv.cur.m.id !== sv.match)) showMatch(doc(sv.match)); renderSort(); });
  $("sv-cats").addEventListener("click", function (e) {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.scat) { sv.cat = b.dataset.scat; renderSort(); $("sv-cats").parentNode.scrollTop = 0; }
    else if (b.dataset.sstar) star(b.dataset.sstar);
    else if (b.dataset.sclip) { const c = find(b.dataset.sclip); if (c) playOne(c); }
  });
  $("sv-empty-btn").addEventListener("click", function () { $("sv-one").value = ""; $("sv-one").click(); });
  $("sv-one").addEventListener("change", function () {
    const f = $("sv-one").files && $("sv-one").files[0], p = sv.pending; if (!f || !p) return;
    sv.pending = null;
    if (urls[p.m.id]) { try { URL.revokeObjectURL(urls[p.m.id]); } catch (e) {} }
    urls[p.m.id] = URL.createObjectURL(f);
    vsSave(p.m.id, f, function () {});
    openVid(p.m, p.at);
  });
}
