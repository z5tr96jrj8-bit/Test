/* Lecteur vidéo, chrono du direct, barre de lecture, lecture de clips, export vidéo, capture. */
import { $, el, fmt, fmtLong } from "./util.js";
import { S, cur, save, edit } from "./state.js";
import { PERIODS, isVideo, derive, matchTime, recomputeTags, tlPos, clipOf, tagColor } from "./model.js";
import { App, toast } from "./ui-common.js";
import { VS, vsSave, vsGet, vsMeta, vsRemove } from "./videostore.js";
import { saveFile } from "./download.js";

export const V = { vid: null, ready: false, url: null, play: null, rate: 1, lastPosSave: 0, loadingStored: null, rec: null };

/* ---------- Chrono du direct ---------- */
function elapsedMs(m) { const c = m.clock; return c.acc + (c.running ? Date.now() - c.startedAt : 0); }
export function periodSec(m) { return Math.max(0, Math.floor(elapsedMs(m) / 1000)); }
function startClock(m) { if (!m.clock.running) { m.clock.running = true; m.clock.startedAt = Date.now(); } }
function stopClock(m) { if (m.clock.running) { m.clock.acc = elapsedMs(m); m.clock.running = false; m.clock.startedAt = 0; } }
export function nowPos(m) { return isVideo(m) ? videoPos(m) : (m.phase === "pre" ? 0 : matchTime(m.period, periodSec(m))); }

export function clockAction(action) {
  const m = cur(); if (!m) return;
  if (action === "end") {
    edit([m.id], "Fin de période", function () { stopClock(m); m.phase = (m.period === 1 || m.period === 3) ? "break" : "done"; });
    App.renderMatch(); toast(m.phase === "break" ? "Période terminée." : "Match terminé.", true); return;
  }
  if (action === "kickoff") edit([m.id], "Coup d'envoi", function () { m.period = 1; m.phase = "live"; m.clock = { running: false, startedAt: 0, acc: 0 }; startClock(m); });
  else if (action === "next") edit([m.id], "Période suivante", function () { m.period = Math.min(4, m.period + 1); m.phase = "live"; m.clock = { running: false, startedAt: 0, acc: 0 }; startClock(m); });
  else {
    if (action === "pause") stopClock(m);
    else if (action === "resume") startClock(m);
    else if (action === "minus" || action === "plus") {
      const target = Math.max(0, elapsedMs(m) + (action === "plus" ? 10000 : -10000));
      m.clock.acc = target; if (m.clock.running) m.clock.startedAt = Date.now();
    }
    save(m);
  }
  App.renderMatch();
}

/* ---------- Vidéo ---------- */
export function videoPos(m) { return V.ready ? (V.vid.currentTime || 0) : ((m.video && m.video.pos) || 0); }
export function unloadVideo() {
  if (V.rec) cancelRec("");
  V.play = null; V.ready = false;
  try { V.vid.pause(); V.vid.removeAttribute("src"); V.vid.load(); } catch (e) {}
  if (V.url) { try { URL.revokeObjectURL(V.url); } catch (e) {} V.url = null; }
  $("video-msg").hidden = true;
}
export function loadVideoFile(file, fromStore) {
  const m = cur(); if (!m || !file) return;
  unloadVideo();
  if (!isVideo(m)) m.mode = "video";
  if (!m.video) m.video = { name: "", pos: 0, k1: null, k2: null };
  if (m.video.name && m.video.name !== file.name) m.video.pos = 0;
  m.video.name = file.name;
  if (!fromStore) {
    const sm = vsMeta()[m.id];
    if (!sm || sm.size !== file.size || sm.name !== file.name) {
      const go = function () { vsSave(m.id, file, function (ev, msg) { renderVsBadge(); if (ev === "done") toast("Vidéo gardée sur cet appareil : tu n'auras plus à la rechoisir.", false); else if (ev === "error" && msg) toast(msg, false); }); };
      if (sm) vsRemove(m.id).then(go); else go();
    }
  }
  try { V.url = URL.createObjectURL(file); V.vid.src = V.url; V.vid.load(); } catch (e) { videoError(); }
  save(m);
  App.renderMatch();
}
function videoError() {
  V.ready = false;
  $("video-msg").textContent = "Cette vidéo ne peut pas être lue ici. Essaie avec un fichier MP4 enregistré dans l'appli Fichiers.";
  $("video-msg").hidden = false;
  App.renderMatch();
}
export function savePos(force) {
  const m = cur(); if (!m || !isVideo(m) || !V.ready) return;
  const now = Date.now();
  if (!force && now - V.lastPosSave < 10000) return;
  V.lastPosSave = now; m.video.pos = Math.floor(V.vid.currentTime || 0); save(m, true);
}
export function seekTo(sec) {
  if (!V.ready) return;
  const d = V.vid.duration;
  if (isFinite(d)) sec = Math.min(sec, Math.max(0, d - 0.2));
  try { V.vid.currentTime = Math.max(0, sec); } catch (e) {}
  renderClock();
}
export function vsTryLoad(m) {
  if (!VS.ok || !isVideo(m) || V.ready || !vsMeta()[m.id]) return;
  V.loadingStored = m.id; App.renderMatch();
  vsGet(m.id).then(function (f) {
    const still = cur() && cur().id === m.id && !V.ready;
    V.loadingStored = null;
    if (!f) { if (still) App.renderMatch(); return; }
    if (still) loadVideoFile(f, true);
  });
}
export function renderVsBadge() {
  const b = $("vs-badge"), m = cur();
  if (VS.job && m && VS.job.id === m.id) { b.hidden = false; b.textContent = "Enregistrement de la vidéo sur l'appareil… " + Math.round(VS.job.p * 100) + " %"; }
  else b.hidden = true;
}

/* ---------- Lecture de clips ---------- */
export function stopPlayback() { V.play = null; }
export function playClips(clips) {
  if (!cur() || !V.ready) return;
  clips = clips.filter(Boolean); if (!clips.length) return;
  V.play = { clips: clips, i: 0, waiting: false };
  startClip();
}
function startClip() {
  const st = V.play; if (!st) return;
  const c = st.clips[st.i];
  st.waiting = true; setTimeout(function () { if (V.play === st) st.waiting = false; }, 1500);
  S.currentTagId = c.tagId; App.renderSelection();
  seekTo(c.start);
  const pr = V.vid.play(); if (pr && pr.catch) pr.catch(function () {});
}
function playTick() {
  const st = V.play; if (!st || st.waiting || !V.ready || V.rec) return;
  const c = st.clips[st.i];
  if (V.vid.currentTime >= c.end - 0.05 || V.vid.ended) {
    st.i++;
    if (st.i < st.clips.length) startClip(); else { V.play = null; V.vid.pause(); }
  }
}
export function togglePlay() {
  if (!V.ready) return;
  stopPlayback();
  if (V.vid.paused) { const pr = V.vid.play(); if (pr && pr.catch) pr.catch(function () {}); } else V.vid.pause();
}

export function videoAction(action) {
  const m = cur(); if (!m) return;
  if (action === "pick") { $("video-file").value = ""; $("video-file").click(); return; }
  if (!V.ready) return;
  if (action === "vplay") { togglePlay(); return; }
  stopPlayback();
  const t = V.vid.currentTime;
  if (action === "vback") seekTo(t - 5); else if (action === "vfwd") seekTo(t + 5);
  else if (action === "vback20") seekTo(t - 20); else if (action === "vfwd20") seekTo(t + 20);
  else if (action === "vr1" || action === "vr15" || action === "vr2") { V.rate = action === "vr15" ? 1.5 : (action === "vr2" ? 2 : 1); V.vid.playbackRate = V.rate; renderClockBar(m); }
  else if (action === "vmute") { V.vid.muted = !V.vid.muted; renderClockBar(m); }
  else if (action === "k1" || action === "k2") {
    const v = Math.floor(t || 0);
    if (action === "k2" && v <= (m.video.k1 || 0)) { toast("La 2e mi-temps doit commencer après le coup d'envoi.", false); return; }
    edit([m.id], action === "k1" ? "Coup d'envoi" : "2e mi-temps", function () {
      if (action === "k1") { m.video.k1 = v; if (m.video.k2 != null && m.video.k2 <= v) m.video.k2 = null; } else m.video.k2 = v;
      recomputeTags(m);
    });
    App.renderMatch();
    toast((action === "k1" ? "Coup d'envoi" : "2e mi-temps") + " placé à " + fmtLong(v) + " de la vidéo.", true);
  }
}

/* ---------- Barre de lecture ---------- */
function ictl(icon, action, label, cls) {
  const b = el("button", "tbtn " + (cls || "")); b.type = "button"; b.dataset.clock = action; b.setAttribute("aria-label", label); b.title = label;
  b.innerHTML = '<svg class="ic"><use href="#i-' + icon + '"/></svg>'; return b;
}
function ctl(label, action, cls) { const b = el("button", "btn " + (cls || ""), label); b.type = "button"; b.dataset.clock = action; return b; }
export function renderClockBar(m) {
  const box = $("clock-controls"), extra = $("clock-extra");
  box.textContent = ""; extra.textContent = "";
  if (isVideo(m)) {
    if (!V.ready) box.appendChild(ctl(m.video && m.video.name ? "Rouvrir la vidéo" : "Choisir la vidéo", "pick", "primary small"));
    else {
      box.appendChild(ictl("rew", "vback20", "Reculer de 20 secondes"));
      box.appendChild(ictl("prev", "vback", "Reculer de 5 secondes"));
      box.appendChild(ictl(V.vid.paused ? "play" : "pause", "vplay", V.vid.paused ? "Lecture" : "Pause"));
      box.appendChild(ictl("next", "vfwd", "Avancer de 5 secondes"));
      box.appendChild(ictl("ff", "vfwd20", "Avancer de 20 secondes"));
      extra.appendChild(ictl(V.vid.muted ? "mute" : "sound", "vmute", V.vid.muted ? "Remettre le son" : "Couper le son"));
      const seg = el("span", "rate-seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Vitesse de lecture");
      [["vr1", 1, "×1"], ["vr15", 1.5, "×1,5"], ["vr2", 2, "×2"]].forEach(function (r) {
        const rb = el("button", "", r[2]); rb.type = "button"; rb.dataset.clock = r[0]; rb.setAttribute("aria-pressed", String(V.rate === r[1])); rb.setAttribute("aria-label", "Vitesse " + r[2]); seg.appendChild(rb);
      });
      extra.appendChild(seg);
      extra.appendChild(ictl("film", "pick", "Changer de vidéo"));
    }
    renderClock(); return;
  }
  let name = "", state = "";
  if (m.phase === "pre") { name = "Avant-match"; state = "En direct ou sur une vidéo enregistrée"; box.appendChild(ctl("Coup d'envoi", "kickoff", "primary")); if (!m.tags.length) box.appendChild(ctl("Taguer sur une vidéo", "pick")); }
  else if (m.phase === "live") {
    name = PERIODS[m.period].name; state = m.clock.running ? "Chrono en marche" : "Chrono en pause";
    box.appendChild(ctl("− 10 s", "minus", "small")); box.appendChild(ctl("+ 10 s", "plus", "small"));
    box.appendChild(m.clock.running ? ctl("Pause", "pause") : ctl("Reprendre", "resume", "primary"));
    box.appendChild(ctl(m.period === 1 ? "Mi-temps" : (m.period === 3 ? "Fin de la période" : "Fin du match"), "end"));
  } else if (m.phase === "break") { name = m.period === 1 ? "Mi-temps" : "Pause"; state = PERIODS[m.period].name + " terminée"; box.appendChild(ctl("Lancer la " + PERIODS[m.period + 1].name.toLowerCase(), "next", "primary")); }
  else { name = "Match terminé"; state = "Tu peux encore corriger tes tags"; if (m.period === 2) box.appendChild(ctl("Jouer la prolongation", "next")); }
  $("period-name").textContent = name; $("period-state").textContent = state;
  renderClock();
}
export function renderClock() {
  const m = cur(); if (!m || $("view-match").hidden) return;
  let txt, total = "", live = false;
  if (isVideo(m)) {
    const v = videoPos(m), d = derive(m, v);
    txt = fmtLong(v);
    total = V.ready && isFinite(V.vid.duration) && V.vid.duration > 0 ? "/ " + fmtLong(V.vid.duration) : "";
    $("period").hidden = V.ready;
    $("period-name").textContent = V.ready ? fmt(matchTime(d.p, d.t)) : "";
    $("period-state").textContent = V.ready ? PERIODS[d.p].name : (m.video && m.video.name ? "Vidéo à rouvrir : " + m.video.name : "Aucune vidéo choisie");
    savePos(false);
  } else {
    txt = fmt(m.phase === "pre" ? 0 : matchTime(m.period, periodSec(m)));
    live = m.phase === "live" && m.clock.running;
    $("period").hidden = false;
  }
  if ($("clock-total").textContent !== total) $("clock-total").textContent = total;
  $("period").classList.toggle("live-on", live);
  if ($("clock").textContent !== txt) $("clock").textContent = txt;
  seekPos();
  App.tickTimeline(m);
}
export function seekPos() {
  const f = V.ready && isFinite(V.vid.duration) && V.vid.duration > 0 ? V.vid.currentTime / V.vid.duration : 0;
  $("at-seek-pr").style.width = "calc((100% - 16px) * " + f + ")";
  $("at-seek-kn").style.left = "calc(8px + (100% - 16px) * " + f + " - 7px)";
}
export function renderSeekMarks(m, list, shown) {
  const mk = $("at-seek-mk"); mk.textContent = "";
  if (!(isVideo(m) && V.ready && isFinite(V.vid.duration) && V.vid.duration > 0)) return;
  const frag = document.createDocumentFragment();
  m.tags.forEach(function (t) {
    if (t.v == null || !shown(t)) return;
    const s = el("i"); s.style.left = "calc(8px + (100% - 16px) * " + Math.min(1, t.v / V.vid.duration) + ")"; s.style.background = tagColor(t, list); frag.appendChild(s);
  });
  mk.appendChild(frag); seekPos();
}

/* ---------- Capture, plein écran ---------- */
export function capture(nameFn) {
  if (!V.ready) { toast("Ouvre d'abord la vidéo.", false); return; }
  const c = document.createElement("canvas"); c.width = V.vid.videoWidth; c.height = V.vid.videoHeight;
  try { c.getContext("2d").drawImage(V.vid, 0, 0); c.toBlob(function (b) { if (b) saveFile(nameFn(fmt(V.vid.currentTime).replace(":", "m")) + ".png", b); }, "image/png"); }
  catch (e) { toast("Capture impossible sur cette vidéo.", false); }
}
export function fullscreen() {
  const box = $("videobox");
  if (document.fullscreenElement) { document.exitFullscreen(); return; }
  if (box.requestFullscreen) box.requestFullscreen().catch(function () {}); else if (V.vid.webkitEnterFullscreen) V.vid.webkitEnterFullscreen();
}

/* ---------- Export de clips en vidéo (enregistrement en temps réel) ---------- */
export function pickMime() {
  const c = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (let i = 0; i < c.length; i++) { try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) {} }
  return "";
}
export function recUnavailable() { toast("L'export vidéo n'est pas disponible sur cet appareil. Utilise l'export CSV pour découper les clips dans un autre logiciel.", false); }
export function exportClips(clips, baseName) {
  const vid = V.vid;
  if (!cur() || !V.ready || V.rec) return;
  clips = clips.filter(Boolean); if (!clips.length) return;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { recUnavailable(); return; }
  stopPlayback(); vid.pause();
  let w = vid.videoWidth || 1280, h = vid.videoHeight || 720; const sc = Math.min(1, 1280 / w);
  w = Math.max(2, Math.round(w * sc / 2) * 2); h = Math.max(2, Math.round(h * sc / 2) * 2);
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d"), mime = pickMime(); let rec;
  try { rec = new MediaRecorder(canvas.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 5000000 } : undefined); } catch (e) { recUnavailable(); return; }
  const chunks = [];
  const st = V.rec = { clips: clips, i: 0, rec: rec, ctx: ctx, w: w, h: h, cancelled: false, raf: 0, lastT: -1, lastMove: Date.now(), prevRate: vid.playbackRate, prevMuted: vid.muted, prevTime: vid.currentTime };
  rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = function () {
    vid.pause(); vid.playbackRate = st.prevRate; vid.muted = st.prevMuted; try { vid.currentTime = st.prevTime; } catch (e) {}
    V.rec = null;
    if (st.cancelled) { $("rec-overlay").hidden = true; return; }
    if (!chunks.length) { $("rec-msg").textContent = "L'enregistrement n'a rien produit. Réessaie avec un clip plus long."; $("rec-cancel").textContent = "Fermer"; return; }
    const type = rec.mimeType || mime || "video/webm", ext = /mp4/.test(type) ? "mp4" : "webm";
    saveFile(baseName + "." + ext, new Blob(chunks, { type: type })).then(function () { $("rec-overlay").hidden = true; toast("Vidéo enregistrée : " + baseName + "." + ext, false); },
      function () { $("rec-msg").textContent = "Le fichier n'a pas pu être enregistré ici."; $("rec-cancel").textContent = "Fermer"; });
  };
  vid.playbackRate = 1; vid.muted = true;
  $("rec-cancel").textContent = "Annuler"; $("rec-overlay").hidden = false;
  try { rec.start(1000); rec.pause(); } catch (e) { V.rec = null; $("rec-overlay").hidden = true; recUnavailable(); return; }
  recNext(st);
}
function recNext(st) {
  const vid = V.vid;
  if (V.rec !== st || st.cancelled) return;
  if (st.i >= st.clips.length) { try { st.rec.stop(); } catch (e) {} return; }
  const c = st.clips[st.i];
  $("rec-msg").textContent = "Enregistrement du clip " + (st.i + 1) + " sur " + st.clips.length + ", en temps réel. Garde cette page ouverte et l'écran allumé.";
  const end = isFinite(vid.duration) ? Math.min(c.end, vid.duration - 0.05) : c.end;
  let started = false;
  const go = function () {
    if (started || V.rec !== st || st.cancelled) return;
    started = true; vid.removeEventListener("seeked", go);
    try { st.ctx.drawImage(vid, 0, 0, st.w, st.h); } catch (e) {}
    try { st.rec.resume(); } catch (e) {}
    const pr = vid.play(); if (pr && pr.catch) pr.catch(function () {});
    st.lastT = -1; st.lastMove = Date.now();
    const frame = function () {
      if (V.rec !== st || st.cancelled) return;
      try { st.ctx.drawImage(vid, 0, 0, st.w, st.h); } catch (e) {}
      const t = vid.currentTime;
      if (t !== st.lastT) { st.lastT = t; st.lastMove = Date.now(); }
      if (t >= end || vid.ended) { vid.pause(); try { st.rec.pause(); } catch (e) {} st.i++; recNext(st); return; }
      if (Date.now() - st.lastMove > 8000) { cancelRec("La lecture s'est arrêtée pendant l'enregistrement. Réessaie en gardant la page au premier plan."); return; }
      st.raf = requestAnimationFrame(frame);
    };
    st.raf = requestAnimationFrame(frame);
  };
  vid.addEventListener("seeked", go);
  try { vid.currentTime = c.start; } catch (e) {}
  setTimeout(go, 2500);
}
export function cancelRec(msg) {
  const st = V.rec;
  if (!st) { $("rec-overlay").hidden = true; return; }
  st.cancelled = true; cancelAnimationFrame(st.raf);
  try { st.rec.stop(); } catch (e) { V.rec = null; }
  $("rec-overlay").hidden = true;
  if (msg) toast(msg, false);
}

/* ---------- Branchements ---------- */
export function initPlayer() {
  V.vid = $("video");
  const vid = V.vid;
  vid.addEventListener("loadedmetadata", function () {
    const m = cur(); if (!m || !isVideo(m)) return;
    V.ready = true; vid.playbackRate = V.rate; $("video-msg").hidden = true;
    const pos = m.video.pos || 0;
    if (pos > 0 && isFinite(vid.duration) && pos < vid.duration - 1) { try { vid.currentTime = pos; } catch (e) {} }
    App.renderMatch();
  });
  vid.addEventListener("error", function () { if (vid.getAttribute("src")) videoError(); });
  vid.addEventListener("play", function () { const m = cur(); if (m) renderClockBar(m); });
  vid.addEventListener("pause", function () { const m = cur(); if (m) { savePos(true); renderClockBar(m); } });
  vid.addEventListener("seeked", function () { if (V.play) V.play.waiting = false; renderClock(); });
  vid.addEventListener("timeupdate", function () { playTick(); seekPos(); });
  vid.addEventListener("click", togglePlay);
  $("clockbar").addEventListener("click", function (e) {
    const b = e.target.closest("button[data-clock]"); if (!b) return;
    const a = b.dataset.clock;
    if (/^(pick|k1|k2|v[a-z0-9]+)$/.test(a)) videoAction(a); else clockAction(a);
  });
  $("video-file").addEventListener("change", function () { const f = $("video-file").files && $("video-file").files[0]; if (f) loadVideoFile(f); });
  $("video-ask-btn").addEventListener("click", function () { videoAction("pick"); });
  const seek = $("at-seek"); let seeking = false;
  function seekAt(e) { if (!V.ready || !isFinite(V.vid.duration)) return; const r = seek.getBoundingClientRect(); stopPlayback(); seekTo(Math.max(0, Math.min(1, (e.clientX - r.left - 8) / (r.width - 16))) * V.vid.duration); }
  seek.addEventListener("pointerdown", function (e) { seeking = true; try { seek.setPointerCapture(e.pointerId); } catch (x) {} seekAt(e); });
  seek.addEventListener("pointermove", function (e) { if (seeking) seekAt(e); });
  ["pointerup", "pointercancel"].forEach(function (k) { seek.addEventListener(k, function () { seeking = false; }); });
  $("rec-cancel").addEventListener("click", function () { if (V.rec) cancelRec(""); else if (App.cancelMontage && App.cancelMontage()) return; else $("rec-overlay").hidden = true; });
  try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (e) {}
  setInterval(renderClock, 250);
}
