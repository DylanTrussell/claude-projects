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
  pendingMusic: null, playingMusic: null, // v13: see music()/unlockMusic()
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
  // rate: playback speed = pitch. Lets one meow sample voice several cats at
  // different pitches (see CUT_MEOWS in strings.js).
  sfx(name, vol = 1, rate = 1) {
    if (!this.ctx || !SND[name]) return;
    const thin = this._voiceGain(name);
    if (thin == null) return; // past the concurrency cap for this sound — drop it, don't stack
    const s = this.ctx.createBufferSource();
    s.buffer = SND[name];
    if (rate !== 1) s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = CFG.gainSfx * vol * thin;
    s.connect(g).connect(this.masterSfxGain);
    s.start();
  },
  // v12 (Dylan: "bring up the sound a little bit on the song 'alien rat patrol'
  // for that scene"). Per-track trim on top of CFG.gainMusic — Dylan's own
  // tracks were mastered at different levels, so a single global music gain
  // makes some scenes sit noticeably quieter than others. Only deviations from
  // 1.0 need an entry here.
  trim: { music_ratpatrol: 1.45 },
  // v13 (Dylan: "after the film ends, and the level begins, the music is not
  // playing... music_rock plays when you SKIP the intro film"). That asymmetry
  // was the whole diagnosis. Skipping means clicking SKIP — a user gesture, so
  // ctx.resume() is granted and music starts. Letting the film run to the end
  // means the 'ended' handler calls startGame() with NO user gesture anywhere
  // in the stack, so on a fresh visit the AudioContext is still 'suspended':
  // resume() returns a promise that never settles into 'running', s.start()
  // runs against a suspended graph, and the level begins in silence. Nothing
  // errored, which is why it never showed up in a console check.
  // Two fixes: remember the track we wanted and re-issue it the moment the
  // context actually unlocks (unlockMusic below, wired to the first input in
  // main.js), and ramp the gain instead of hard-starting so the handoff out of
  // the film is a fade rather than a cut.
  music(name, fadeMs = 0) {
    if (!SND[name]) return;
    this.pendingMusic = name;
    if (!this.ctx || this.ctx.state !== 'running') return; // replayed by unlockMusic()
    this.stopMusic();
    const s = this.ctx.createBufferSource();
    s.buffer = SND[name]; s.loop = true;
    const g = this.ctx.createGain();
    const target = CFG.gainMusic * (this.trim[name] || 1);
    if (fadeMs > 0) {
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(target, this.ctx.currentTime + fadeMs / 1000);
    } else {
      g.gain.value = target;
    }
    s.connect(g).connect(this.masterMusicGain);
    s.start();
    this.musicSrc = s; this.musicGain = g;
    this.playingMusic = name;
  },
  // Called on the first real user input. If a track was requested while the
  // context was suspended and never actually sounded, start it now.
  unlockMusic() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'running' && this.pendingMusic && this.playingMusic !== this.pendingMusic) {
      this.music(this.pendingMusic, 600);
    }
  },
  stopMusic() { if (this.musicSrc) { try { this.musicSrc.stop(); } catch (_) {} this.musicSrc = null; this.playingMusic = null; } },
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
  // v13.4 (Dylan: "both the plane and the motorcycle seem to have the same
  // sound effects"). They literally did -- this hardwired SND.sfx_bike, so the
  // A-1's 'engine' event started the motorcycle loop. The emitter now names
  // its engine, and switching vehicles swaps the loop instead of stacking it.
  eng(onoff, name) {
    if (!this.ctx) return;
    const want = name || 'sfx_bike';
    if (onoff && this.engSrc && this.engName !== want) { try { this.engSrc.stop(); } catch (_) {} this.engSrc = null; }
    if (onoff && !this.engSrc && SND[want]) {
      const s = this.ctx.createBufferSource();
      s.buffer = SND[want]; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0.28;
      s.connect(g).connect(this.masterSfxGain); s.start();
      this.engSrc = s; this.engName = want;
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
    // v13.3: a single missing or mid-rebuild audio file used to reject here,
    // Promise.all rejected with it, and the WHOLE GAME failed to boot on an
    // "ASSET FAILURE: asset 404" screen. A playtester hit exactly that from one
    // sfx_shrapnel.mp3 while the build directory was being rewritten underneath
    // them. A sound that will not load is a missing sound effect, not a reason
    // the game cannot start -- and sfx() already no-ops on an absent buffer
    // (see `if (!SND[name]) return`). Log it and carry on.
    jobs.push(
      loadSound(audio.ctx, './assets/' + file)
        .then(b => { SND[id] = b; })
        .catch(e => { console.warn('sound failed, continuing without it:', id, e && e.message); })
        .then(tick)
    );
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

// ---------- v12 hit flash (Metal Slug damage feedback) ----------
// Dylan, twice, the second time noting it had been ignored: "when shooting an
// enemy ship it should light up and change colors like in metal slug to show
// that its being hit and taking damage". Enemies previously gave zero feedback
// between spawn and death, so a 5-HP saucer looked identical to an untouched
// one and you couldn't tell whether you were hitting it at all.
//
// Canvas has no cheap per-sprite tint, so build a silhouette once per
// (image, colour) and cache it: draw the sprite into an offscreen canvas, then
// fill with 'source-atop' so only the opaque pixels take the colour. Blitting
// that over the sprite at partial alpha gives the classic white/red blowout
// without touching the surrounding scene. Cached, so it costs one extra
// drawImage per flashing enemy per frame and nothing when nothing is hit.
const tintCache = new Map();
function tinted(im, color) {
  const key = (im.currentSrc || im.src) + '|' + color;
  let c = tintCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = im.naturalWidth || im.width; c.height = im.naturalHeight || im.height;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    tintCache.set(key, c);
  }
  return c;
}

// amt: 0..1 flash strength. Ramps white -> red as the enemy nears death so
// damage state reads at a glance, not just "something happened".
export function drawImgHit(ctx, im, x, y, w, h, amt, hpFrac) {
  if (!im) return;
  ctx.drawImage(im, x, y, w, h);
  if (amt <= 0) return;
  // Threshold is 0.5, not 0.34, deliberately: the toughest enemy currently in a
  // rail section has hpMax 2, so a 0.34 cutoff made the red "nearly dead" state
  // mathematically unreachable (1/2 = 0.5 > 0.34) and the feature would have
  // shipped as white-only. At 0.5 a 2-HP enemy flashes white on the first hit
  // and red on its last. Raise enemy HP and this scales on its own.
  const color = hpFrac != null && hpFrac <= 0.5 ? '#ff5a3c' : '#ffffff';
  ctx.save();
  ctx.globalAlpha = Math.min(0.92, amt);
  ctx.drawImage(tinted(im, color), x, y, w, h);
  ctx.restore();
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
