/* Export vidéo : UN seul moteur pour un clip, une liste de lecture ou un montage multi-matchs.
   Les clips sont rejoués et enregistrés en temps réel (canvas + MediaRecorder), tout reste sur l'appareil. */

export const recorderOk = () => !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);

function pickMime() {
  const c = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const m of c) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* rien */ } }
  return "";
}

/**
 * @param video   élément <video> utilisé pour la lecture
 * @param clips   [{ start, end, src?: () => Promise<url|null> }]  (src : pour changer de vidéo entre deux clips)
 * @param status  (texte, i, n) => void
 * @returns {{ promise: Promise<Blob|null>, cancel: Function, ext: string }}
 */
export function recordClips(video, clips, status) {
  const W = 1280, H = 720;
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const mime = pickMime();
  const rec = new MediaRecorder(canvas.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 5000000 } : undefined);
  const chunks = [];
  const prev = { muted: video.muted, rate: video.playbackRate, time: video.currentTime, src: video.getAttribute("src") };
  let cancelled = false, raf = 0, fail = null;
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  const draw = () => {
    const vw = video.videoWidth || 16, vh = video.videoHeight || 9, k = Math.min(W / vw, H / vh);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    try { ctx.drawImage(video, (W - vw * k) / 2, (H - vh * k) / 2, vw * k, vh * k); } catch (e) { /* image pas prête */ }
  };
  const once = (evt, ms) => new Promise((res) => {
    let done = false; const f = () => { if (!done) { done = true; video.removeEventListener(evt, f); res(); } };
    video.addEventListener(evt, f); setTimeout(f, ms);
  });

  async function playOne(c, i) {
    status(i, clips.length);
    if (c.src) {
      const url = await c.src();
      if (!url) throw new Error("missing-video");
      if (video.getAttribute("src") !== url) { video.src = url; video.load(); await once("loadedmetadata", 8000); }
    }
    video.currentTime = c.start;
    await once("seeked", 2500);
    const end = isFinite(video.duration) ? Math.min(c.end, video.duration - 0.05) : c.end;
    draw();
    rec.resume();
    const p = video.play(); if (p && p.catch) p.catch(() => {});
    await new Promise((res, rej) => {
      let lastT = -1, lastMove = Date.now();
      const frame = () => {
        if (cancelled) { res(); return; }
        draw();
        const t = video.currentTime;
        if (t !== lastT) { lastT = t; lastMove = Date.now(); }
        if (t >= end || video.ended) { video.pause(); rec.pause(); res(); return; }
        if (Date.now() - lastMove > 8000) { rej(new Error("stalled")); return; }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
  }

  const promise = (async () => {
    video.muted = true; video.playbackRate = 1; video.pause();
    rec.start(1000); rec.pause();
    try { for (let i = 0; i < clips.length && !cancelled; i++) await playOne(clips[i], i); }
    catch (e) { fail = e; }
    const stopped = new Promise((res) => { rec.onstop = res; });
    try { rec.stop(); } catch (e) { /* déjà arrêté */ }
    await stopped;
    cancelAnimationFrame(raf);
    video.pause(); video.muted = prev.muted; video.playbackRate = prev.rate;
    if (prev.src && video.getAttribute("src") !== prev.src) { video.src = prev.src; video.load(); await once("loadedmetadata", 5000); }
    try { video.currentTime = prev.time; } catch (e) { /* rien */ }
    if (fail) throw fail;
    if (cancelled || !chunks.length) return null;
    return new Blob(chunks, { type: rec.mimeType || mime || "video/webm" });
  })();
  return { promise, cancel: () => { cancelled = true; }, ext: /mp4/.test(mime) ? "mp4" : "webm" };
}
