// Asset loading strictly by manifest (assets/manifest.json), per design/assets.csv.
// A missing manifest asset is a loud failure — no silent placeholder boxes.
import { CFG } from './config.js';
import { CHUNKS } from './chunks.js';

export const IMG = {};     // id -> HTMLImageElement
export const SHEET = {};   // id -> {img, cw, ch, cols, rows, frames, fps, loop}
export const SND = {};     // id -> AudioBuffer
export let MANIFEST = null;

function parseSheetName(file) {
  // {asset}_{action}_f{count}_{cellW}x{cellH}_g{cols}x{rows}_fps{n}_{loop|once}.png
  const m = file.match(/_f(\d+)_(\d+)x(\d+)_g(\d+)x(\d+)_fps(\d+)_(loop|once)\.png$/);
  if (!m) return null;
  return { frames: +m[1], cw: +m[2], ch: +m[3], cols: +m[4], rows: +m[5], fps: +m[6], loop: m[7] === 'loop' };
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('asset 404: ' + src));
    im.src = src;
  });
}

export const audio = {
  ctx: null, musicSrc: null, musicGain: null, humSrc: null, humGain: null, engSrc: null, unlocked: false,
  sfxBus: null, masterSfxGain: null, masterMusicGain: null,
  masterSfxVol: 1, masterMusicVol: 1, musicMuted: false,
  voices: {}, // sound name -> array of scheduled-end timestamps, for concurrency thinning
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      // v10.1 fix: every one-shot SFX used to go straight to destination with no
      // shared bus and no concurrency limit. At real fire rates (gatling, tunnel
      // pistol mash) that's a dozen overlapping copies of the same sample summing
      // and clipping — which is exactly why gunfire "sounds like white noise"
      // (Dylan, playtest). A shared compressor bus + per-sound voice thinning
      // fixes the clipping; a hard per-sound voice cap stops it from ever
      // building past control. (An earlier changelog claimed this was already
      // done — it wasn't; grepping assets.js for compressor/voice code turned up
      // nothing. This is the real fix.)
      this.sfxBus = this.ctx.createDynamicsCompressor();
      this.sfxBus.threshold.value = -18;
      this.sfxBus.knee.value = 12;
      this.sfxBus.ratio.value = 8;
      this.sfxBus.attack.value = 0.002;
      this.sfxBus.release.value = 0.15;
      this.masterSfxGain = this.ctx.createGain();
      this.masterSfxGain.gain.value = this.masterSfxVol;
      this.masterSfxGain.connect(this.sfxBus).connect(this.ctx.destination);
      this.masterMusicGain = this.ctx.createGain();
      this.masterMusicGain.gain.value = this.musicMuted ? 0 : this.masterMusicVol;
      this.masterMusicGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.unlocked = this.ctx.state === 'running';
    return this.ctx;
  },
  // Returns a gain multiplier (1 down to ~0.41) for the Nth concurrent copy of
  // `name` currently playing, or null past the hard cap (caller should drop
  // the trigger entirely rather than start a 7th+ overlapping voice).
  _voiceGain(name) {
    const now = this.ctx.currentTime;
    let arr = this.voices[name];
    if (!arr) arr = this.voices[name] = [];
    while (arr.length && arr[0] <= now) arr.shift(); // sweep out expired voices
    if (arr.length >= 6) return null;
    const THIN = [1, 0.71, 0.58, 0.5, 0.45, 0.41];
    const mult = THIN[Math.min(arr.length, THIN.length - 1)];
    arr.push(now + 0.35); // approx one-shot length; good enough for thinning purposes
    return mult;
  },
  sfx(name, vol = 1) {
    if (!this.ctx || !SND[name]) return;
    const thin = this._voiceGain(name);
    if (thin == null) return; // past the concurrency cap for this sound — drop it, don't stack
    const s = this.ctx.createBufferSource();
    s.buffer = SND[name];
    const g = this.ctx.createGain();
    g.gain.value = CFG.gainSfx * vol * thin;
    s.connect(g).connect(this.masterSfxGain);
    s.start();
  },
  music(name) {
    if (!this.ctx || !SND[name]) return;
    this.stopMusic();
    const s = this.ctx.createBufferSource();
    s.buffer = SND[name]; s.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = CFG.gainMusic;
    s.connect(g).connect(this.masterMusicGain);
    s.start();
    this.musicSrc = s; this.musicGain = g;
  },
  stopMusic() { if (this.musicSrc) { try { this.musicSrc.stop(); } catch (_) {} this.musicSrc = null; } },
  hum(onoff) {
    if (!this.ctx || !SND.sfx_ufo) return;
    if (onoff && !this.humSrc) {
      const s = this.ctx.createBufferSource();
      s.buffer = SND.sfx_ufo; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = CFG.gainHum;
      s.connect(g).connect(this.masterSfxGain); s.start();
      this.humSrc = s; this.humGain = g;
    } else if (!onoff && this.humSrc) {
      try { this.humSrc.stop(); } catch (_) {}
      this.humSrc = null;
    }
  },
  eng(onoff) {
    if (!this.ctx || !SND.sfx_bike) return;
    if (onoff && !this.engSrc) {
      const s = this.ctx.createBufferSource();
      s.buffer = SND.sfx_bike; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0.28;
      s.connect(g).connect(this.masterSfxGain); s.start();
      this.engSrc = s;
    } else if (!onoff && this.engSrc) {
      try { this.engSrc.stop(); } catch (_) {}
      this.engSrc = null;
    }
  },
  // Pause-menu volume sliders call these. 0-1 range; applied live (existing
  // playing voices — music/hum/eng — pick it up immediately via their shared
  // gain nodes, one-shot sfx() picks it up on its next trigger).
  setMusicVol(v) {
    this.masterMusicVol = Math.max(0, Math.min(1, v));
    if (this.masterMusicGain) this.masterMusicGain.gain.value = this.musicMuted ? 0 : this.masterMusicVol;
  },
  setSfxVol(v) {
    this.masterSfxVol = Math.max(0, Math.min(1, v));
    if (this.masterSfxGain) this.masterSfxGain.gain.value = this.masterSfxVol;
  },
  setMusicMuted(m) {
    this.musicMuted = !!m;
    if (this.masterMusicGain) this.masterMusicGain.gain.value = this.musicMuted ? 0 : this.masterMusicVol;
  },
};

async function loadSound(ctx, src) {
  const r = await fetch(src);
  if (!r.ok) throw new Error('asset 404: ' + src);
  const buf = await r.arrayBuffer();
  return await ctx.decodeAudioData(buf);
}

export async function loadAll(onProgress) {
  const r = await fetch('./assets/manifest.json');
  if (!r.ok) throw new Error('manifest.json missing');
  MANIFEST = await r.json();
  const jobs = [];
  let done = 0, total = 0;
  const tick = () => { done++; if (onProgress) onProgress(done / total); };

  for (const [id, file] of Object.entries(MANIFEST.images || {})) {
    total++;
    jobs.push(loadImage('./assets/' + file).then(im => { IMG[id] = im; tick(); }));
  }
  for (const [id, file] of Object.entries(MANIFEST.sheets || {})) {
    total++;
    jobs.push(loadImage('./assets/' + file).then(im => {
      const meta = parseSheetName(file);
      if (!meta) throw new Error('bad sheet name: ' + file);
      SHEET[id] = { img: im, ...meta };
      tick();
    }));
  }
  // Audio decode needs a context; create silently (it may start suspended — fine for decode).
  // v10.2 fix: this used to poke audio.ctx directly ("audio.ctx = audio.ctx ||
  // new AC()"), bypassing ensure() entirely — so by the time the player's
  // first click/keypress called ensure(), this.ctx was already truthy and the
  // whole "if (!this.ctx)" node-creation block (sfxBus, masterSfxGain,
  // masterMusicGain) got skipped for the rest of the session. Every sfx()/
  // music()/hum()/eng() call then connected to an undefined gain node, which
  // is the actual "Overload resolution failed" crash the compressor fix was
  // otherwise supposed to prevent. Routing this through ensure() builds the
  // whole audio graph up front instead of half of it.
  audio.ensure();
  for (const [id, file] of Object.entries(MANIFEST.audio || {})) {
    total++;
    jobs.push(loadSound(audio.ctx, './assets/' + file).then(b => { SND[id] = b; tick(); }));
  }
  await Promise.all(jobs);
}

// ---------- lazy CDN chunks (v10: actually wired up — see chunks.js) ----------
// game/chunks.js defines the CHUNKS registry but nothing previously imported
// or fetched it, so every "chunk" section (tunnel/ptboat/boss2) has been
// referencing IMG/SND ids that were never populated. This is the loader that
// was documented as already existing but wasn't. ensureChunk(name) fetches +
// decodes every asset in that chunk exactly once (cached), populating the
// same IMG/SND tables loadAll() uses, so downstream code doesn't need to
// know or care whether an id came from the base bundle or a chunk.
const chunkPromises = {};
export function ensureChunk(name) {
  if (chunkPromises[name]) return chunkPromises[name];
  const chunk = CHUNKS[name];
  if (!chunk) return Promise.resolve();
  const jobs = [];
  for (const [id, src] of Object.entries(chunk.images || {})) {
    jobs.push(loadImage(src).then(im => { IMG[id] = im; }).catch(e => console.error('chunk image failed:', name, id, e)));
  }
  if (chunk.audio) {
    const ctx = audio.ensure();
    for (const [id, src] of Object.entries(chunk.audio)) {
      jobs.push(loadSound(ctx, src).then(b => { SND[id] = b; }).catch(e => console.error('chunk audio failed:', name, id, e)));
    }
  }
  chunkPromises[name] = Promise.all(jobs);
  return chunkPromises[name];
}
export function prefetchChunk(name) { ensureChunk(name).catch(() => {}); }

export function drawSheet(ctx, id, frame, x, y, w, h, flip) {
  const s = SHEET[id];
  if (!s) return false;
  const f = frame % s.frames;
  const sx = (f % s.cols) * s.cw, sy = Math.floor(f / s.cols) * s.ch;
  ctx.save();
  if (flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(s.img, sx, sy, s.cw, s.ch, 0, 0, w, h); }
  else ctx.drawImage(s.img, sx, sy, s.cw, s.ch, x, y, w, h);
  ctx.restore();
  return true;
}

export function drawImg(ctx, id, x, y, w, h, flip) {
  const im = IMG[id];
  if (!im) return false;
  ctx.save();
  if (flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0, w, h); }
  else ctx.drawImage(im, x, y, w, h);
  ctx.restore();
  return true;
}
