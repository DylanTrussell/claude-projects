// Boot, screens, input, and the fixed-timestep loop — single-player build.
// (The co-op relay server and net client live in the repo for a future version.)
import { CFG, C, BIND, PADBIND, W, H } from './config.js';
import { STR, SUBS, CUT_MEOWS } from './strings.js';

// runtime subtitle driver: cues live in strings.js, never baked into the video
function attachSubs(vid, subEl, cues) {
  const update = () => {
    const t = vid.currentTime;
    const cue = (cues || []).find(c => t >= c[0] && t <= c[1]);
    const txt = cue ? cue[2] : '';
    if (subEl.textContent !== txt) subEl.textContent = txt;
  };
  vid.ontimeupdate = update;
  update();
}
import { loadAll, audio, IMG, ensureChunk, prefetchChunk } from './assets.js';
import { makeGame, step, serialize, LEVEL, spawnTunnelSkirmish, checkpointState, restoreState } from './sim.js';
import { render, fxEvent, fxUpdate, FX, drawRotor, TUNNEL_TRANS_MS } from './render.js';
import { Tunnel } from './fps.js';
import { VIDEO_URLS } from './chunks.js';
import { DoorGun, Skyraider } from './rails.js';
// v11: wiring in content that's existed complete on disk since v8/v9 but was
// never reachable — see the changelog for why (short version: boat.js and
// boss2.js couldn't even be imported until rails.js exported RailBase).
import { PTBoat, Surf } from './boat.js';
import { ParleyBoss } from './boss2.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c'), ctx = canvas.getContext('2d');
let scale = 1, offX = 0, offY = 0;

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, CFG.dprCap);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
  scale = Math.min(innerWidth / W, innerHeight / H);
  offX = (innerWidth - W * scale) / 2; offY = (innerHeight - H * scale) / 2;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
  // v13.3: the side-scroller left smoothing ON, so every sprite took two
  // stacked non-integer bilinear resamples (logical -> CSS -> device pixels).
  // That softened all the pixel art AND smeared the chroma fringe wider than a
  // pixel, which is why the halos read so strongly in motion. The tunnel
  // already sets this false; the main renderer never did.
  ctx.imageSmoothingEnabled = false;
}
addEventListener('resize', resize); addEventListener('orientationchange', resize); resize();

// ---------- input: two clusters, physical key codes ----------
let heldBits = 0, touchBits = 0;
addEventListener('keydown', (e) => {
  if (BIND[e.code] !== undefined) { heldBits |= BIND[e.code]; e.preventDefault(); }
  audio.ensure();
});
addEventListener('keyup', (e) => { if (BIND[e.code] !== undefined) heldBits &= ~BIND[e.code]; });
function padBits() {
  let b = 0;
  for (const gp of navigator.getGamepads?.() ?? []) {
    if (!gp) continue;
    gp.buttons.forEach((bt, i) => { if (bt.pressed && PADBIND[i] !== undefined) b |= PADBIND[i]; });
    if (gp.axes[0] < -0.4) b |= C.L;
    if (gp.axes[0] > 0.4) b |= C.R;
    if (gp.axes[1] < -0.5) b |= C.UP;
    if (gp.axes[1] > 0.5) b |= C.DOWN;
  }
  return b;
}
const myBits = () => heldBits | touchBits | padBits();

function bindTouch(id, bit) {
  const el = $(id);
  if (!el) return;
  const on = (e) => { touchBits |= bit; audio.ensure(); e.preventDefault(); };
  const off = (e) => { touchBits &= ~bit; e.preventDefault(); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
['tL:1', 'tR:2', 'tU:4', 'tD:8', 'tJ:16', 'tF:32', 'tG:64', 'tC:128'].forEach(s => { const [id, b] = s.split(':'); bindTouch(id, +b); });
// v13.3: a desktop tester had the translucent D-pad drawn over the game eating
// a third of the screen -- some environments report a coarse pointer even with a
// mouse present. Require coarse AND the absence of a fine pointer.
if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('touch').style.display = 'flex';

// ---------- app state ----------
let mode = 'boot'; // boot|title|brief|game|tally
let g = null;
let lastView = null;
let cutsceneActive = false;
let tunnel = null; // active first-person tunnel section
let rail = null;   // active vehicle rail section (door gun / skyraider)
let loadingChunk = false; // v10: freezes the sim while a lazy CDN chunk fetches
let hudShown = false; // tracks #hudbtns (pause/music) visibility, only touched on change
let ckptSnap = null, lastCkptX = -1, continuesLeft = 3; // v13.3: last checkpoint world-state, for CONTINUE
let directTunnel = false; // ?tunnel=N boot: skip the sink-into-the-ground beat (there's no topside to sink from)
const dev = new URLSearchParams(location.search).has('dev');

function showChunkLoading(on, msg) {
  $('loading').style.display = on ? 'flex' : 'none';
  // v13 (Dylan: "get rid of that text and just say have the bar filling up").
  // The bar is the whole progress story; the caption was noise. Kept as an
  // element so the ASSET FAILURE path below still has somewhere to shout.
  if (on) { $('loadbar').style.width = '0%'; $('loadmsg').textContent = ''; }
}

function show(id) {
  for (const s of ['screen-title', 'screen-lobby', 'screen-tally']) $(s).style.display = 'none';
  if (id) $(id).style.display = 'flex';
}

function tstr() {
  const map = {
    't-title': 'title', 't-sub': 'subtitle', 'btn-start': 'start',
    'l-title': 'lobbyTitle', 'l-brief': 'briefText',
    'btn-go': 'begin',
    't-controls': 'controlsTitle', 'c1': 'controlsMove', 'c2': 'controlsFire', 'c3': 'controlsPad', 'c4': 'controlsTouch',
    't-opts': 'options', 'o-shake': 'optShake', 'o-flash': 'optFlash', 'o-text': 'optTextScale',
    'btn-again': 'playAgain', 'btn-skip': 'skip', 'btn-skip2': 'skip', 'btn-begin': 'watchIntro',
    'p-title': 'pausedTitle', 'p-music': 'musicVol', 'p-sfx': 'sfxVol', 'btn-resume': 'resume',
  };
  for (const [id, k] of Object.entries(map)) { const el = $(id); if (el) el.textContent = STR[k]; }
}

function optBtn(id, key) {
  const el = $(id + '-v');
  const saved = sessionStorage.getItem('am_' + key);
  if (saved !== null) FX.opts[key] = saved === '1';
  const refresh = () => el.textContent = FX.opts[key] ? STR.on : STR.off;
  $(id).addEventListener('click', () => { FX.opts[key] = !FX.opts[key]; sessionStorage.setItem('am_' + key, FX.opts[key] ? '1' : '0'); refresh(); });
  refresh();
}

// ---------- game flow ----------
function startGame() {
  g = makeGame((Math.random() * 0xffffffff) >>> 0, [{ pid: 'p1', hero: 'us' }]);
  const warp = +(new URLSearchParams(location.search).get('warp') || 0);
  if (dev && warp > 0) { // dev-only section warp for verification
    g.phase = 'play';
    if (g.lift) { g.lift.st = 'gone'; g.lift = null; }
    for (const p of g.players) { p.st = 'alive'; p.x = warp; p.y = 100; }
    g.enemies = g.enemies.filter(e => e.k !== 'buddy' && e.k !== 'heli');
    g.cam = Math.max(0, warp - W * 0.4); g.checkpoint = warp;
    if (warp > CFG.sections.invasion) { g.invasion = true; g.sec = 'B'; }
    // dev-only: warping anywhere past x=5572 puts camMid > 5700 immediately,
    // which fires the treeline-burn Skyraider rail section on the very first
    // step — normal for real play (it's meant to happen before the nest door
    // at x=6150) but it eats every warp-based verification script since the
    // rail section runs for a full 52s and blocks the ordinary sim step
    // entirely while active. &skiprail=1 marks it already-done so a warp can
    // land past it instantly for testing.
    if (new URLSearchParams(location.search).get('skiprail')) g.rail1 = 'skip';
  }
  lastView = null;
  mode = 'game';
  show(null);
  audio.ensure();
  audio.music('music_rock', 1200);
  fxEvent({ e: 'hint', k: 'goalBanner' });
  // Act I never said which key FIRES. The tunnel, the door gun and the
  // skyraider all print their controls; the main side-scroller -- the mode you
  // spend most of the game in and the first thing you ever see -- only said
  // "PUSH EAST. SHOOT EVERYTHING ELSE." Playtester mashed keys to find out.
  fxEvent({ e: 'hint', k: 'ctlBasics' });
  ensureChunk('weapons'); // v13: topside weapon overlay art, needed as soon as a pickup lands
  prefetchChunk('tunnel'); // warm the tunnel's CDN chunk now so most players never see the loading beat
  const devRail = dev && new URLSearchParams(location.search).get('rail');
  if (devRail) handleEvents([{ e: 'rail', k: devRail }]);
}

function endGame(won) {
  if (mode === 'tally') return;
  setPauseMenu(false);
  mode = 'tally';
  audio.stopMusic(); audio.hum(false); audio.eng(false);
  const v = lastView || {};
  // v13.3 QA: continues were unlimited and free from the same snapshot, so the
  // game literally could not be lost. Three per run: enough to rescue a player
  // stuck on one section, not enough to remove the ending.
  const canContinue = !won && !!ckptSnap && continuesLeft > 0;
  $('btn-continue').style.display = canContinue ? '' : 'none';
  $('btn-continue').textContent = STR.continueRun + ' (' + continuesLeft + ')';
  $('t-result').textContent = won ? STR.victory : STR.gameOver;
  $('t-result').style.color = won ? '#8CFF3B' : '#c8372d';
  // Read the LIVE game state, not lastView. lastView is only re-serialized by
  // the side-scroller step, so it is frozen at whatever it was when you
  // entered a tunnel or a rail -- and dying inside the tunnel therefore
  // reported the deaths you had BEFORE going in. Measured: 8 tunnel deaths
  // reported as "DEATHS: 1". Falls back to the snapshot if g is gone.
  const deaths = g ? g.players.reduce((a, p) => a + (p.deaths || 0), 0)
                   : (v.pl || []).reduce((a, p) => a + (p[14] || 0), 0);
  const score = (g ? g.score : v.score) || 0;
  const pows = (g ? g.pows : v.pows) || 0;
  // The long-term reward rung. Until this, a run ended by printing three
  // numbers that were then thrown away -- nothing carried from one session to
  // the next, so there was no reason to play a second time. Best score is the
  // cheapest possible persistent hook; the rank turns the raw number into a
  // target you can name ("I got a B, I want an A").
  let best = 0;
  try { best = +(localStorage.getItem('am_best') || 0) || 0; } catch (_) {}
  // v13.3 QA: this guard never fired when it mattered. `g.continued` is only
  // incremented when you PRESS continue -- which happens after this tally has
  // already written am_best -- so the first game over of every run banked its
  // record and only later continues were blocked. The offer of a continue is
  // enough: once a checkpoint snapshot exists, this run can be continued, so it
  // is not a clean run and does not set a record.
  const isRecord = score > best && !(g && g.continued) && !ckptSnap;
  if (isRecord) { try { localStorage.setItem('am_best', String(score)); } catch (_) {} }
  // Rank rewards score, rewards optional rescues heavily, and punishes deaths
  // -- so the safest possible run (die freely, skip POWs) can't earn an S.
  const rating = score + pows * 2000 - deaths * 400;
  // Thresholds re-scaled after measurement: at S >= 30000 a four-input bot
  // (hold right, hold fire, jump at gaps, aim up at flyers) averaged 30,525
  // and took S on 10 of 12 runs -- the persistence hook was maxed on run one.
  // These sit above that bot's ceiling, so S has to be earned.
  const rank = rating >= 42000 ? 'S' : rating >= 34000 ? 'A' : rating >= 26000 ? 'B' : rating >= 18000 ? 'C' : 'D';
  $('t-stats').innerHTML =
    `${STR.score}: <b>${score}</b><br>` +
    `${STR.pows}: <b>${pows}</b><br>` +
    `${STR.deaths}: <b>${deaths}</b><br>` +
    `<span style="font-size:1.6em;color:#FFC93C">${STR.rank}: <b>${rank}</b></span><br>` +
    (isRecord
      ? `<span style="color:#8CFF3B">${STR.newRecord}</span>`
      : `${STR.best}: <b>${Math.max(best, score)}</b>`);
  show('screen-tally');
}

// v12: the touch pad sits at z-index 20 and the cutscene overlay at 10, so on a
// phone the movement/fire buttons floated on top of the film — and the JUMP
// button landed directly under the SKIP button, making SKIP hard to hit. Films
// take no gameplay input, so park the pad for the duration. visibility (not
// display) so the coarse-pointer check in the boot block stays authoritative.
function touchPad(show) {
  const t = $('touch');
  if (t) t.style.visibility = show ? '' : 'hidden';
}

function playCutscene(which, then) {
  const vid = $('cutvid');
  cutsceneActive = true;
  touchPad(false);
  $('cutscene').style.display = 'flex';
  // v12: VIDEO_URLS was exported from chunks.js and imported by NOBODY -- the
  // only import anywhere was `{ CHUNKS }` in assets.js -- so this line always
  // played the bundled copy and the CDN entries were dead code. That is why
  // v11.2's meow splice never reached the player: it edited the CDN truce.mp4
  // (md5 0d0ced0c...) while production kept serving the bundled original
  // (1de9cc99...), and the round "verified" by curling the CDN asset rather
  // than by checking which URL the game actually requests. Confirmed with a
  // network audit (tools/v12_path_audit.mjs) that logs every URL the running
  // game fetches and diffs it against what chunks.js declares.
  vid.src = VIDEO_URLS[which] || './assets/video/intro.mp4';
  vid.currentTime = 0;
  attachSubs(vid, $('cutsub'), SUBS[which]);
  // Meow track: the cats' dialogue was subtitled but SILENT. Fire the meow
  // samples off the video clock so they land on their lines, each at its own
  // playbackRate so the two cats sound like different animals. Visuals
  // untouched -- Dylan asked only for the sound.
  const meows = (CUT_MEOWS[which] || []).map(m => ({ t: m[0], n: m[1], r: m[2], done: false }));
  const meowTick = () => {
    const now2 = vid.currentTime;
    for (const m of meows) {
      if (!m.done && now2 >= m.t && now2 < m.t + 1.2) { m.done = true; audio.sfx(m.n, 1.0, m.r); }
    }
  };
  vid.addEventListener('timeupdate', meowTick);
  vid._meowTick = meowTick;
  vid.play().catch(() => {});
  const done = () => {
    if (!cutsceneActive) return;
    cutsceneActive = false;
    if (vid._meowTick) { vid.removeEventListener('timeupdate', vid._meowTick); vid._meowTick = null; }
    $('cutscene').style.display = 'none';
    touchPad(true);
    vid.pause();
    if (then) then();
  };
  vid.onended = done;
  $('btn-skip2').onclick = done;
  vid.onerror = done;
}

function handleEvents(evs) {
  for (const ev of evs) {
    fxEvent(ev);
    switch (ev.e) {
      case 'sfx': audio.sfx(ev.n); break;
      case 'music': audio.music(ev.n); break;
      case 'hum': audio.hum(!!ev.on); break;
      case 'engine':
        audio.eng(!!ev.on, ev.name || 'sfx_bike');
        // v11: bike-ride start is the last quiet moment before the river/LZ
        // content — warm both new chunks now so most players never see the
        // loading beat, same reasoning as the tunnel prefetch at boot.
        if (ev.on) { prefetchChunk('ptboat'); prefetchChunk('boss2'); }
        break;
      case 'cutscene':
        // the truce film flows straight into the door-gun ride with Charlie
        playCutscene(ev.which, ev.which === 'truce' ? () => handleEvents([{ e: 'rail', k: 'doorgun' }]) : undefined);
        break;
      case 'rail':
        // v11: ptboat/surf/parley are lazy CDN content (same pattern as the
        // 'fps' tunnel below) — doorgun/skyraider's art ships in the base
        // bundle so those two stay synchronous.
        if (ev.k === 'ptboat' || ev.k === 'surf' || ev.k === 'parley') {
          const chunkName = ev.k === 'parley' ? 'boss2' : 'ptboat';
          loadingChunk = true;
          showChunkLoading(true, ev.k === 'parley' ? 'the LZ goes quiet…' : 'shoving off…');
          ensureChunk(chunkName).catch(e => console.error('rail chunk failed', chunkName, e)).then(() => {
            showChunkLoading(false);
            loadingChunk = false;
            rail = ev.k === 'ptboat' ? new PTBoat() : ev.k === 'surf' ? new Surf() : new ParleyBoss();
            FX.hints.length = 0; FX.banners.length = 0;
            audio.music(ev.k === 'parley' ? 'music_ratpatrol' : 'music_gunner');
          });
        } else {
          rail = ev.k === 'skyraider' ? new Skyraider() : new DoorGun();
          FX.hints.length = 0; FX.banners.length = 0;
          audio.music(ev.k === 'skyraider' ? 'music_gunner' : 'music_ratpatrol');
        }
        break;
      case 'gameover': setTimeout(() => endGame(false), 900); break;
      case 'victory': setTimeout(() => playCutscene('victory', () => endGame(true)), 1400); break;
      case 'fps': { // drop into the tunnels — the whole game changes
        // v10: the tunnel's forward-facing gun/fire/reload art, redone enemy
        // frames, and pickup icons are lazy CDN content (see chunks.js) — the
        // sim freezes while the (usually sub-second, since prefetchChunk
        // already kicked this off) fetch happens.
        // v11: Dylan — "he should fall into it when he goes in" — play a
        // brief sink-into-the-ground animation over the STILL-VISIBLE
        // overworld first, instead of instantly cutting to the boot-loader
        // overlay. The old code showed the opaque #loading overlay the
        // instant this event fired, which would have hidden the animation
        // entirely, so the overlay is now deferred: it only appears if the
        // CDN fetch outlasts the fall animation, and both gate the actual
        // mode switch together.
        loadingChunk = true;
        const transMs = directTunnel ? 200 : TUNNEL_TRANS_MS;
        FX.tunnelFallT = directTunnel ? 0 : TUNNEL_TRANS_MS;
        let chunkReady = false, animDone = false, overlayShown = false;
        const finishFall = () => {
          if (!chunkReady || !animDone) return;
          if (overlayShown) showChunkLoading(false);
          loadingChunk = false;
          tunnel = new Tunnel(ev.map);
          audio.music('music_tunnel');
          FX.hints.length = 0; FX.banners.length = 0; // drop stale side-scroller hints
          fxEvent({ e: 'hint', k: 'fpsControls' });
          fxEvent({ e: 'hint', k: ev.map === 0 ? 'fpsObjective0' : 'fpsObjective1' });
        };
        ensureChunk('tunnel').catch(e => console.error('tunnel chunk failed', e)).then(() => { chunkReady = true; finishFall(); });
        setTimeout(() => { animDone = true; finishFall(); }, transMs);
        setTimeout(() => { if (!chunkReady) { overlayShown = true; showChunkLoading(true, 'entering the tunnel…'); } }, transMs);
        break;
      }
      case 'fpsKill': if (g) g.score += 150; break;
      case 'fpsHurt': break;
    }
  }
}

// ---------- UI wiring ----------
tstr();
optBtn('opt-shake', 'shake'); optBtn('opt-flash', 'flash'); optBtn('opt-text', 'bigText');

$('btn-start').addEventListener('click', () => {
  audio.ensure();
  mode = 'brief';
  show('screen-lobby');
  $('titlevid').pause();
});
$('btn-go').addEventListener('click', () => startGame());
$('btn-again').addEventListener('click', () => { ckptSnap = null; lastCkptX = -1; continuesLeft = 3; startGame(); });
// CONTINUE: same run, from the last checkpoint, with the life count restored.
// Score is kept but the continue is recorded, so a continued run cannot quietly
// pass itself off as a clean one on the best-score board.
$('btn-continue').addEventListener('click', () => {
  if (!ckptSnap || continuesLeft <= 0) { startGame(); return; }
  continuesLeft--;
  g = restoreState(ckptSnap, [{ pid: 'p1', hero: 'us' }]);
  for (const p of g.players) { p.lives = CFG.lives; p.hp = CFG.hpMax; p.st = 'alive'; p.invulnT = 2200; }
  g.over = false; g.won = false;
  g.continued = (g.continued || 0) + 1;
  tunnel = null; rail = null; lastView = null;
  mode = 'game'; show(null);
  audio.ensure(); audio.music('music_rock', 800);
  fxEvent({ e: 'banner', k: 'continued' });
});
// no start screen: the film cuts straight to the chopper coming down in gameplay
$('btn-skip').addEventListener('click', () => { $('intro').style.display = 'none'; touchPad(true); $('introvid').pause(); startGame(); });
$('introvid').addEventListener('ended', () => { $('intro').style.display = 'none'; touchPad(true); startGame(); });
// v13 crossfade (Dylan: "the other song should continue for a bit and fade out
// as the instrumental takes over"). Rather than cut at 'ended', start the level
// track under the last 2.5s of the film and ride the film's own volume down so
// the two genuinely overlap. Fires once per playthrough.
$('introvid').addEventListener('timeupdate', () => {
  const iv = $('introvid');
  if (!iv.duration || mode === 'game') return;
  const left = iv.duration - iv.currentTime;
  if (left > 2.5 || left < 0) return;
  if (!iv.__xfade) { iv.__xfade = true; audio.ensure(); audio.music('music_rock', 2200); }
  iv.volume = Math.max(0, Math.min(1, left / 2.5));
});
// v13: the AudioContext only unlocks inside a real user gesture. If the opening
// film autoplayed (no gesture anywhere in the stack), every music() call before
// the first click/keypress ran against a suspended graph and silently did
// nothing — which is exactly why music_rock was audible after SKIP (a click)
// and silent after letting the film run out. Replay the wanted track on the
// first input of any kind.
['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
  window.addEventListener(ev, () => audio.unlockMusic(), { passive: true }));

function showTitle() {
  mode = 'title';
  show('screen-title');
  $('titlevid').play().catch(() => {});
}

// ---------- pause menu + music/sfx volume (Dylan: pause button, music button,
// pause-menu volume sliders) ----------
let manualPause = false;
function setPauseMenu(on) {
  manualPause = on;
  $('screen-pause').style.display = on ? 'flex' : 'none';
  // v13.3: touchPad(false) only ran for cutscenes, so on a phone all eight
  // control buttons sat ON TOP of the pause menu, flanking RESUME.
  if (mode === 'game') touchPad(!on);
  if (!on) last = performance.now(); // avoid a big dt jump on resume, same trick as the focus handler
}
function togglePause() {
  if (mode !== 'game' || cutsceneActive || loadingChunk) return;
  setPauseMenu(!manualPause);
}
function refreshMusicBtn() {
  const icon = audio.musicMuted ? '🔇' : '🔊';
  $('btn-music-toggle').textContent = icon;
  $('p-music-toggle-v').textContent = audio.musicMuted ? STR.musicOff : STR.musicOn;
}
function toggleMusic() {
  audio.setMusicMuted(!audio.musicMuted);
  sessionStorage.setItem('am_musicMuted', audio.musicMuted ? '1' : '0');
  refreshMusicBtn();
}
function initVolumeUI() {
  const mv = sessionStorage.getItem('am_musicVol');
  const sv = sessionStorage.getItem('am_sfxVol');
  const mm = sessionStorage.getItem('am_musicMuted');
  if (mv !== null) audio.masterMusicVol = (+mv) / 100;
  if (sv !== null) audio.masterSfxVol = (+sv) / 100;
  if (mm !== null) audio.musicMuted = mm === '1';
  $('p-music-slider').value = Math.round(audio.masterMusicVol * 100);
  $('p-sfx-slider').value = Math.round(audio.masterSfxVol * 100);
  $('p-music-slider').addEventListener('input', (e) => {
    audio.setMusicVol(+e.target.value / 100);
    sessionStorage.setItem('am_musicVol', e.target.value);
  });
  $('p-sfx-slider').addEventListener('input', (e) => {
    audio.setSfxVol(+e.target.value / 100);
    sessionStorage.setItem('am_sfxVol', e.target.value);
  });
  $('btn-music-toggle').addEventListener('click', toggleMusic);
  $('p-music-toggle').addEventListener('click', toggleMusic);
  $('btn-pause').addEventListener('click', () => togglePause());
  $('btn-resume').addEventListener('click', () => setPauseMenu(false));
  refreshMusicBtn();
}
initVolumeUI();
// ?mute=1: hard-mute the ENTIRE audio path from the first frame — WebAudio sfx,
// music, and every <video>. For automated playtesting: page-side muting after
// load always loses the race against the first sfx, and a fresh tab starts
// unmuted (Dylan: "no sounds while I'm playing — make that part of the
// setting"). Engine-level, so it cannot race and cannot be forgotten.
if (new URLSearchParams(location.search).has('mute')) {
  audio.masterSfxVol = 0;
  audio.masterMusicVol = 0;
  audio.musicMuted = true;
  document.querySelectorAll('video').forEach(v => { v.muted = true; });
  $('p-sfx-slider').value = 0;
  $('p-music-slider').value = 0;
}
addEventListener('keydown', (e) => { if (e.code === 'Escape') { togglePause(); e.preventDefault(); } });
// M toggles the tunnel automap. It defaults ON -- Dylan got lost twice, so the
// map has to be there without being found first; the toggle exists for anyone
// who wants the corner of the screen back.
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && tunnel) { tunnel.mapOn = !tunnel.mapOn; e.preventDefault(); }
});

// ---------- main loop ----------
let acc = 0, last = performance.now(), paused = false;
let frames = 0, fpsAt = last, fps = 0;
// v13.3: the auto-pause overlay was drawn inside the animation frame, and
// browsers throttle or stop rAF on a blurred tab -- so the frame that would
// have said PAUSED never ran. A first-time playtester hit this twice and
// reported the game as CRASHED both times: the helicopter hung mid-air, a
// banner froze on screen, and no key did anything. Paint the overlay from the
// blur handler itself, while we still get to run.
addEventListener('blur', () => {
  paused = true;
  try {
    if (mode === 'game' && !manualPause && ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(canvas.width / W, canvas.height / H);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#f3e9c8';
      ctx.fillText(STR.paused, W / 2, H / 2);
      ctx.restore();
    }
  } catch (e) { /* never let a paint failure block the pause itself */ }
});
addEventListener('focus', () => { paused = false; last = performance.now(); });
// Freeze the sim while the portrait "turn your phone" overlay covers the screen
// (index.html #rotate) -- otherwise the player keeps taking hits behind it.
const portraitQ = matchMedia('(max-aspect-ratio: 1/1) and (pointer: coarse)');
let rotateBlocked = portraitQ.matches;
// v13.3: the rotate gate had no way past it, so anyone playing with rotation
// lock on -- which is most people, on a couch or in bed -- was hard-stuck at
// the front door and could never start the game at all. PLAY ANYWAY dismisses
// it for the session; the gate still comes back on a real orientation change
// only if they have not opted out.
let rotateOptOut = false;
portraitQ.addEventListener('change', (e) => {
  rotateBlocked = e.matches && !rotateOptOut;
  if (!e.matches) last = performance.now(); // no dt spike on the way back in
});
$('btn-rotskip')?.addEventListener('click', () => {
  rotateOptOut = true; rotateBlocked = false;
  $('rotate').style.display = 'none';
  last = performance.now();
});

function frame(now) {
  requestAnimationFrame(frame);
  let dt = now - last; last = now;
  dt = Math.min(dt, 250);
  fxUpdate(dt);

  // v13.3 CONTINUE. checkpointState/restoreState have existed in sim.js the
  // whole time and nothing ever called them: running out of lives threw you
  // back to the opening film and the PLAY button. A first-time playtester who
  // had just spent nine lives called that "the moment I would have closed the
  // tab for good", and the game is hard enough that a novice reaches it. Snap
  // the world each time the sim passes a checkpoint so we can hand it back.
  if (mode === 'game' && g && g.checkpoint !== lastCkptX) {
    lastCkptX = g.checkpoint;
    try { ckptSnap = checkpointState(g); } catch (_) { ckptSnap = null; }
  }
  if (mode === 'game' && g && !cutsceneActive && !paused && !manualPause && !loadingChunk && !rotateBlocked) {
    if (tunnel) { // first-person underworld
      const p = g.players[0];
      tunnel.step(myBits(), dt, p);
      if (tunnel.events.length) handleEvents(tunnel.events.splice(0));
      if (tunnel.done) {
        const r = tunnel.result, mapIdx = tunnel.mapIdx;
        tunnel = null;
        if (r.dead) { endGame(false); }
        else {
          // v13.1 tunnel rebuild: kills and secrets pay like everything else
          g.score += (r.kills || 0) * 100 + (r.secrets || 0) * 500;
          if (mapIdx === 0) {
            g.fps0 = 'done';
            if (r.rescued) { g.pows++; g.score += 800; p.weap = 'gatling'; p.ammo = 200; handleEvents([{ e: 'banner', k: 'gotGatling' }]); }
            p.x = LEVEL.fpsDoors.main + 60;
          } else {
            g.fps1 = 'done';
            g.score += r.cleared ? 1200 : 300;
            if (r.cleared) handleEvents([{ e: 'banner', k: 'nestCleared' }]);
            if (r.loot > 0) { p.weap = 'raygun'; p.ammo = 60; }
            p.x = LEVEL.fpsDoors.nest + 60;
          }
          if (r.shotgun) p.gren += 3; // spare shells become grenades topside (close enough)
          if (mapIdx === 0) spawnTunnelSkirmish(g, p.x); // a few more VC waiting in the light
          p.y = 100; p.invulnT = 2200; p.st = 'alive';
          FX.hints.length = 0; FX.banners.length = 0; // crawl out clean — no tunnel darkness lingers
          audio.music(g.invasion ? 'music_invasion' : 'music_rock');
          // v11: Dylan — "pop out of it when he comes out" — rise-from-the-
          // ground animation instead of snapping straight back to normal
          // control. Re-serialize immediately so render() draws the player
          // at the exit door in his new position (not a stale pre-tunnel
          // frame) while the animation plays; loadingChunk briefly freezes
          // the sim the same way a CDN chunk fetch does.
          FX.tunnelPopT = TUNNEL_TRANS_MS;
          // v12: fps.js has just faded the tunnel view up to solid white; come
          // back down out of it here so the two halves join into one move.
          // Longer than TUNNEL_TRANS_MS so the light lingers a beat after the
          // pop-out animation starts, which is what sells it as emerging.
          FX.whiteT0 = 900; FX.whiteT = 900;
          loadingChunk = true;
          lastView = serialize(g);
          lastView.secX = g.cam + W / 2;
          lastView.crates = g.crates;
          setTimeout(() => { loadingChunk = false; }, TUNNEL_TRANS_MS);
        }
      }
    } else if (rail) { // vehicle rail sections
      const p = g.players[0];
      rail.step(myBits(), dt, p);
      if (rail.events.length) handleEvents(rail.events.splice(0));
      if (rail.done) {
        const wasDoorgun = rail instanceof DoorGun;
        // v11: PTBoat -> Surf -> (normal control resumes, evac timer starts)
        // -> ParleyBoss -> real victory. See the changelog for why these
        // three were sitting complete but unreachable since v8/v9.
        const wasPTBoat = rail instanceof PTBoat;
        const wasSurf = rail instanceof Surf;
        const wasParley = rail instanceof ParleyBoss;
        const kills = rail.kills, dead = rail.dead;
        // Kill quotas (v13.1) end a rail early when you shoot well -- but the
        // payout is kills*100, so clearing the quota FORGOES the kills you'd
        // have racked up running the timer out: measured ~4,765 points across
        // the four sections, i.e. playing well lowered your score. Pay for the
        // time you saved so the incentive points the same way as the skill.
        const timeBonus = Math.max(0, Math.round((rail.dur - rail.t) / 100) * 10);
        rail = null;
        if (dead) { endGame(false); }
        else if (wasPTBoat) { // straight into the surf-out, no return to normal control in between
          g.score += kills * 100 + timeBonus;
          handleEvents([{ e: 'rail', k: 'surf' }]);
        } else if (wasParley) { // Chancellor Grimtail down — the evac he interrupted actually lands now
          g.score += kills * 100 + timeBonus;
          g.over = true; g.won = true;
          handleEvents([{ e: 'victory' }]);
        } else {
          g.score += kills * 100 + timeBonus;
          if (wasDoorgun) { // Charlie hops off the gun and back into the fight
            for (const e of g.enemies) if (e.duel) e.st = 'gone';
            // Dylan: "after the main helicopter scene, there needs to be a
            // transition into the next scene. It just ends abruptly." The rail
            // used to cut straight to the side-scroller on the same frame.
            // Now the gun run fades to white, holds, and fades back in on the
            // ground with a title card -- the same white-out grammar the
            // tunnel exit already uses, so the game reads as one piece.
            FX.whiteT0 = 1500; FX.whiteT = 1500;
            loadingChunk = true;
            setTimeout(() => { loadingChunk = false; }, 900);
            handleEvents([{ e: 'banner', k: 'actGroundwar' }]);
          }
          const p2 = g.players[0];
          p2.invulnT = 2200; if (p2.st !== 'out') p2.st = 'alive';
          audio.music('music_invasion');
          if (wasSurf) { // washed up at the LZ — the chopper's inbound (may get interrupted, see sim.js)
            g.heliEvac = { t: 2600 };
            handleEvents([{ e: 'evac' }]);
          }
        }
      }
    } else {
      if (FX.hitPause > 0) { FX.hitPause -= dt; }
      else {
        acc += dt;
        const inputs = { p1: myBits() };
        while (acc >= 1000 / 60) {
          step(g, 1000 / 60, inputs);
          acc -= 1000 / 60;
        }
      }
      const evs = g.events.splice(0);
      if (evs.length) handleEvents(evs);
      lastView = serialize(g);
      lastView.secX = g.cam + W / 2;
      lastView.crates = g.crates;
    }
  }

  ctx.fillStyle = '#0b0d09';
  ctx.fillRect(-offX / scale, -offY / scale, innerWidth / scale, innerHeight / scale);
  if (mode === 'game' && tunnel) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    tunnel.render(ctx, now);
    drawFpsHud(ctx);
    ctx.restore();
  } else if (mode === 'game' && rail) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    rail.render(ctx, now, drawRotor);
    drawFpsHud(ctx);
    ctx.restore();
    // A ?tunnel=N boot never runs the side-scroller, so lastView is null: on
    // dying out down there the canvas fell through every branch and stayed
    // black behind the tally. Serialize once so there's always a frame to
    // draw, whatever route got us here.
  } else if ((mode === 'game' || mode === 'tally') && !lastView && g) {
    lastView = serialize(g);
    render(ctx, lastView, now, 'p1', null);
  } else if ((mode === 'game' || mode === 'tally') && lastView) {
    let dbg = null;
    if (dev) {
      const ents = (lastView.en || []).length + (lastView.bl || []).length;
      dbg = `${fps} fps · ent ${ents}`;
    }
    render(ctx, lastView, now, 'p1', dbg);
  }
  // v13.3 QA: the PAUSED overlay lived ONLY inside the side-scroller branch, so
  // the tunnel and the rail sections showed nothing at all when the window lost
  // focus -- and their shake and rotor keep animating, so the screen reads as
  // running while every key is ignored. That is exactly the "helicopter hung
  // mid-air, no key did anything, reported as CRASHED" symptom I claimed to have
  // fixed earlier today; it was still live in the two sections that need it
  // most, and on desktop it fires any time you click another window. Drawn last
  // and for every mode now, so nothing can paint over it.
  if (paused && mode === 'game' && !manualPause) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#f3e9c8';
    ctx.fillText(STR.paused, W / 2, H / 2);
  }
  const wantHud = mode === 'game' && !cutsceneActive;
  if (wantHud !== (hudShown)) { hudShown = wantHud; $('hudbtns').style.display = wantHud ? 'flex' : 'none'; }
  if (dev) {
    frames++;
    if (now - fpsAt >= 500) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
  }
}

// ---------- FPS-mode HUD (health, shells, weapon, banners/hints) ----------
function drawFpsHud(ctx) {
  const p = g && g.players[0];
  if (!p) return;
  const segW = 22, segH = 10;
  for (let i = 0; i < CFG.hpMax; i++) {
    const x0 = 16 + i * (segW + 4);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x0 - 1, 19, segW + 2, segH + 2);
    ctx.fillStyle = i < p.hp ? (p.hp >= 4 ? '#8CFF3B' : p.hp >= 2 ? '#FFC93C' : '#c8372d') : 'rgba(243,233,200,0.15)';
    ctx.fillRect(x0, 20, segW, segH);
  }
  ctx.font = 'bold 14px monospace'; ctx.textAlign = 'left';
  ctx.fillStyle = '#f3e9c8';
  if (tunnel) {
    // v10: pistol now has a real magazine (Dylan: "there's no animation for
    // it reloading") — show the count / a RELOADING flag so the mechanic
    // reads on the HUD, not just in the viewmodel.
    const wname = tunnel.weap === 'pistol' ? (tunnel.reloadT > 0 ? 'PISTOL — RELOADING' : `PISTOL ${tunnel.ammoInMag}/10`) : tunnel.weap === 'shotgun' ? `SHOTGUN ${tunnel.shells}` : 'CLAWS';
    ctx.fillStyle = tunnel.weap === 'pistol' && tunnel.reloadT > 0 ? '#c8372d' : '#f3e9c8';
    // Progression on the HUD (loop-1: no stats anywhere): kills always;
    // shells shown while carrying them WITHOUT the shotgun, so "SHELLS +5"
    // pickups stop reading as a no-op ("it said I got shells, but there was
    // no shotgun").
    // "CLAWS: K" read as a lie while a gun was out (loop 3 thought the claw
    // was broken). Say SWIPE — K is a melee swipe on top of whatever you hold,
    // and only becomes your weapon once the grab takes the pistol.
    let line = `x${p.lives}  ${wname}  ·  ${tunnel.weap === 'claws' ? 'CLAWS: J' : 'SWIPE: K'}`;
    if (tunnel.weap !== 'shotgun' && tunnel.shells > 0) line += tunnel.hasShotgun ? `  ·  SHELLS ${tunnel.shells}` : `  ·  SHELLS ${tunnel.shells} (find the SHOTGUN)`;
    if (tunnel.result.kills > 0) line += `  ·  KILLS ${tunnel.result.kills}`;
    ctx.fillText(line, 16, 50);
    ctx.fillStyle = '#f3e9c8';
  } else {
    ctx.fillText(`x${p.lives}`, 16, 50);
  }
  // throat-grab: giant mash meter
  if (tunnel && tunnel.script && !tunnel.script.done && tunnel.script.phase === 'grapple') {
    const mw = 460, mx = W / 2 - mw / 2, my = H * 0.2;
    ctx.font = 'bold 30px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#26231c'; ctx.fillText(STR.grabPrompt, W / 2 + 2, my - 16 + 2);
    ctx.fillStyle = '#c8372d'; ctx.fillText(STR.grabPrompt, W / 2, my - 16);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(mx - 3, my - 3, mw + 6, 30);
    ctx.fillStyle = '#c8372d';
    ctx.fillRect(mx, my, mw * Math.max(0, Math.min(1, tunnel.script.meter / 100)), 24);
    ctx.strokeStyle = '#f3e9c8'; ctx.lineWidth = 2; ctx.strokeRect(mx - 3, my - 3, mw + 6, 30);
  }
  // banners + hints (same queues the side-scroller uses)
  let by = H * 0.3;
  ctx.textAlign = 'center';
  for (const b of FX.banners) {
    if ((b.d || 0) > 0) continue; // queued behind an earlier banner (see render.js fxEvent)
    ctx.globalAlpha = Math.min(1, b.t / 400);
    ctx.font = 'bold 32px monospace';
    ctx.fillStyle = '#26231c'; ctx.fillText(STR[b.k] || b.k, W / 2 + 2, by + 2);
    ctx.fillStyle = '#FFC93C'; ctx.fillText(STR[b.k] || b.k, W / 2, by);
    ctx.globalAlpha = 1; by += 44;
  }
  let hy = H - 84;
  for (const h2 of FX.hints) {
    if ((h2.d || 0) > 0) continue; // queued behind an earlier hint (see render.js fxEvent)
    ctx.globalAlpha = Math.min(1, h2.t / 500);
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#26231c'; ctx.fillText(STR[h2.k] || h2.k, W / 2 + 1, hy + 1);
    ctx.fillStyle = '#8CFF3B'; ctx.fillText(STR[h2.k] || h2.k, W / 2, hy);
    ctx.globalAlpha = 1; hy -= 24;
  }
}

// ---------- test/debug hook ----------
window.__AM = () => {
  const me = lastView && (lastView.pl || []).find(p => p[0] === 'p1');
  return {
    mode,
    myX: me ? me[2] : null,
    myState: me ? me[5] : null,
    hp: me ? me[15] : null,
    crouch: me ? !!me[16] : null, // v11 debug: verify the crouch-shrink fix without eyeballing pixels
    fireFlash: me ? !!me[18] : null,
    weap: me ? me[7] : null,
    bullets: lastView ? (lastView.bl || []).length : 0,
    score: lastView ? lastView.score : 0,
    cam: lastView ? Math.round(lastView.cam) : 0,
    enemies: lastView ? (lastView.en || []).length : 0,
    over: lastView ? !!lastView.over : false,
    tunnel: tunnel ? { weap: tunnel.weap, ammoInMag: tunnel.ammoInMag, reloadT: tunnel.reloadT, fireT: tunnel.fireT, shells: tunnel.shells, script: tunnel.script ? { phase: tunnel.script.phase, t: Math.round(tunnel.script.t), meter: Math.round(tunnel.script.meter || 0) } : null } : null,
  };
};
if (dev) {
  window.__AMtp = (x, y, ang) => { if (tunnel) { tunnel.px = x; tunnel.py = y; if (ang !== undefined) tunnel.ang = ang; } }; // dev-only teleport for verification
  window.__AMtun = () => tunnel && { items: tunnel.items.map(i => ({ kind: i.kind, x: i.x, y: i.y, got: !!i.got })), enemies: tunnel.enemies.map(e => ({ x: e.x, y: e.y, st: e.st, dead: !!e.dead })), mittens: tunnel.mittens, exit: tunnel.exit };
  window.__AMlook = (tx, ty) => { if (tunnel) tunnel.ang = Math.atan2(ty - tunnel.py, tx - tunnel.px); };
  window.__AMburst = (i) => { if (tunnel && tunnel.enemies[i]) tunnel.burst(tunnel.enemies[i]); }; // dev-only: force an enemy out of hiding for verification
  // dev-only: force a weapon so the flamethrower/raygun rendering can be
  // verified without hunting down the pickup first.
  window.__AMweap = (w, ammo) => { const p = g && g.players[0]; if (p) { p.weap = w; p.ammo = ammo || 999; } };
  // dev-only: force the TUNNEL weapon, so the shotgun/claw viewmodels and
  // their fire paths can be exercised without walking the whole level first
  window.__AMtweap = (w, n) => { if (tunnel) { tunnel.weap = w; if (w === 'shotgun') { tunnel.hasShotgun = true; tunnel.shells = n || 8; } } };
}

// ---------- boot ----------
(async () => {
  try {
    await loadAll((p) => { $('loadbar').style.width = (p * 100).toFixed(0) + '%'; });
  } catch (err) {
    $('loadmsg').textContent = 'ASSET FAILURE: ' + err.message;
    throw err;
  }
  $('loading').style.display = 'none';
  // v13.2: ?tunnel=1 (Mittens tunnel) / ?tunnel=2 (rat nest) boots STRAIGHT
  // into that tunnel -- no film, no title, no walking there. Dylan liked the
  // tunnel as "a separate thing I can click on until we test it and make it
  // perfect", so it's a first-class mode now. Dev warps also skip the film
  // (his note: "the intro cutscene replays on every load, SKIP every time").
  const qs = new URLSearchParams(location.search);
  const tunnelMode = +(qs.get('tunnel') || 0);
  if (tunnelMode === 1 || tunnelMode === 2) {
    if (IMG.logo) { $('t-logo').src = IMG.logo.src; $('t-logo').style.display = 'block'; $('t-title').style.display = 'none'; }
    directTunnel = true; // loop-1: ?tunnel=2 booted to ~3s of raw black -- skip the topside fall beat
    // A browser keeps the AudioContext SUSPENDED until a real user gesture.
    // The normal route unlocks it when you click SKIP on the opening film;
    // booting straight to ?tunnel=N had no gesture at all, so the whole level
    // played silent -- "the gun sounds aren't working on the tunnel level".
    // One click gate, which is also where the controls get taught.
    await new Promise(res => {
      const g0 = $('tunnelgate');
      g0.style.display = 'flex';
      const go = () => { g0.style.display = 'none'; audio.ensure(); res(); };
      g0.addEventListener('click', go, { once: true });
      window.addEventListener('keydown', go, { once: true });
    });
    startGame();
    const p0 = g.players[0];
    p0.x = tunnelMode === 1 ? LEVEL.fpsDoors.main : LEVEL.fpsDoors.nest;
    g.cam = Math.max(0, p0.x - W * 0.4); g.checkpoint = p0.x;
    if (tunnelMode === 2) { g.invasion = true; g.sec = 'B'; }
    handleEvents([{ e: 'fps', map: tunnelMode - 1 }]);
    requestAnimationFrame(frame);
    return;
  }
  if (dev && +(qs.get('warp') || 0) > 0) {
    if (IMG.logo) { $('t-logo').src = IMG.logo.src; $('t-logo').style.display = 'block'; $('t-title').style.display = 'none'; }
    startGame();
    requestAnimationFrame(frame);
    return;
  }
  const iv = $('introvid');
  iv.src = './assets/video/intro.mp4';
  attachSubs(iv, $('introsub'), SUBS.intro);
  $('intro').style.display = 'flex';
  touchPad(false); // v12: opening film owns the screen — no floating d-pad over it
  // Chrome blocks un-muted autoplay on a fresh visit — never silently skip the
  // opening film. If play() is rejected, gate on one tap (which also unlocks audio).
  iv.play().catch(() => {
    $('btn-begin').style.display = 'block';
    $('btn-begin').addEventListener('click', () => {
      $('btn-begin').style.display = 'none';
      iv.play().catch(() => { $('intro').style.display = 'none'; touchPad(true); showTitle(); });
    });
  });
  // (start screen removed — title video no longer loaded)
  if (IMG.logo) { $('t-logo').src = IMG.logo.src; $('t-logo').style.display = 'block'; $('t-title').style.display = 'none'; }
  requestAnimationFrame(frame);
})();
