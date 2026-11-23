/* Lecteur vidéo du match : lecture locale, vitesses, sauts, lecture de clips à la suite.
   Une seule boucle d'animation, active seulement pendant la lecture (pas de minuterie permanente). */

export const RATES = [0.5, 1, 1.5, 2];

export class Player {
  constructor(video) {
    this.v = video;
    this.url = null;
    this.ready = false;
    this.rate = 1;
    this.queue = null;        // { clips, i, waiting }
    this.listeners = {};
    this.raf = 0;
    const v = video;
    v.addEventListener("loadedmetadata", () => { this.ready = true; v.playbackRate = this.rate; this.emit("ready"); });
    v.addEventListener("error", () => { if (v.getAttribute("src")) { this.ready = false; this.emit("error"); } });
    v.addEventListener("play", () => { this.emit("state"); this.loop(); });
    v.addEventListener("pause", () => { this.emit("state"); this.emit("time"); });
    v.addEventListener("seeked", () => { if (this.queue) this.queue.waiting = false; this.emit("time"); });
    v.addEventListener("ratechange", () => this.emit("state"));
    v.addEventListener("volumechange", () => this.emit("state"));
  }
  on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); }
  emit(evt) { (this.listeners[evt] || []).forEach((fn) => fn()); }

  loop() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (this.v.paused) return;
      this.checkQueue();
      this.emit("time");
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  loadFile(file) { this.unload(); this.url = URL.createObjectURL(file); this.v.src = this.url; this.v.load(); }
  unload() {
    this.queue = null; this.ready = false;
    try { this.v.pause(); this.v.removeAttribute("src"); this.v.load(); } catch (e) { /* rien */ }
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
  }

  get time() { return this.v.currentTime || 0; }
  get duration() { const d = this.v.duration; return isFinite(d) && d > 0 ? d : 0; }
  get paused() { return this.v.paused; }

  play() { const p = this.v.play(); if (p && p.catch) p.catch(() => {}); }
  pause() { this.v.pause(); }
  toggle() { if (!this.ready) return; this.queue = null; if (this.v.paused) this.play(); else this.pause(); }
  seek(sec) {
    if (!this.ready) return;
    const d = this.duration;
    if (d) sec = Math.min(sec, Math.max(0, d - 0.2));
    try { this.v.currentTime = Math.max(0, sec); } catch (e) { /* rien */ }
    this.emit("time");
  }
  skip(d) { this.queue = null; this.seek(this.time + d); }
  setRate(r) { this.rate = r; this.v.playbackRate = r; }
  toggleMute() { this.v.muted = !this.v.muted; }

  /** Lit des clips à la suite : [{ start, end, tagId }] ; onClip(clip) à chaque début de clip. */
  playClips(clips, onClip) {
    clips = clips.filter(Boolean);
    if (!this.ready || !clips.length) return;
    this.queue = { clips, i: 0, waiting: false, onClip };
    this.startClip();
  }
  startClip() {
    const q = this.queue, c = q.clips[q.i];
    q.waiting = true;
    setTimeout(() => { if (this.queue === q) q.waiting = false; }, 1500);
    if (q.onClip) q.onClip(c, q.i, q.clips.length);
    this.seek(c.start);
    this.play();
  }
  checkQueue() {
    const q = this.queue;
    if (!q || q.waiting) return;
    const c = q.clips[q.i];
    if (this.v.currentTime >= c.end - 0.05 || this.v.ended) {
      q.i++;
      if (q.i < q.clips.length) this.startClip();
      else { this.queue = null; this.pause(); }
    }
  }
  stopClips() { this.queue = null; }

  /** Image affichée, en PNG. */
  capture() {
    return new Promise((resolve) => {
      if (!this.ready || !this.v.videoWidth) { resolve(null); return; }
      const c = document.createElement("canvas"); c.width = this.v.videoWidth; c.height = this.v.videoHeight;
      try { c.getContext("2d").drawImage(this.v, 0, 0); c.toBlob(resolve, "image/png"); } catch (e) { resolve(null); }
    });
  }
}
