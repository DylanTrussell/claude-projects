// Difficulty playtest for PART TWO (game/missions.js).
//
// missiontest.mjs answers "can every mission be finished?" with a bot that
// holds RIGHT+FIRE on 99 lives. That is a build gate, not a playtest. This is
// the other instrument: a competent player model (it sees threats, plans a
// dodge by simulating the next 0.9s, keeps its distance, aims up at flyers,
// throws grenades) with HUMAN LIMITS layered on top, on the REAL life count:
//
//   react   ms before a new threat (a shot, a tell) is noticed at all
//   miss    chance a given threat is simply never noticed (x1.4 per other live threat: attention splits)
//   decide  ms between decisions (the action is held in between)
//   jit     timing error (ms, 1 sigma) on a pit jump
//   fire    trigger uptime
//   gren    how readily grenades get used
//   idle    fraction of decisions spent hesitating instead of advancing
//   aimLag  ms of dead trigger when switching target / aim direction
//
// Lives: main.js carries p.lives (CFG.lives) and p.hp (CFG.hpMax) through the
// whole run; Mission.hurtHero takes 1 hp a hit, a death refills hp and costs a
// life, and zero lives is game over (the continue restarts the mission with a
// full CFG.lives). So a mission run here starts on CFG.lives / CFG.hpMax and a
// game over counts as "not cleared".
//
//   node tools/missionplay.mjs                         # every mission x every skill, 12 seeds
//   node tools/missionplay.mjs --mission=hive --skill=casual --seeds=30
//   node tools/missionplay.mjs --campaign              # 4-mission runs, lives carried
//   node tools/missionplay.mjs --json=out.json         # machine-readable summary
//   node tools/missionplay.mjs --dir=public            # test the assembled build (or an absolute path to a snapshot)
const argOf = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const DIR = argOf('dir', 'game');
const ROOT = DIR.startsWith('/') ? 'file://' + DIR : `../${DIR}`;   // --dir=/abs/path tests a snapshot (before/after)
const { Mission, MISSIONS, missionBot } = await import(`${ROOT}/missions.js`);
const { CFG, C, W, H } = await import(`${ROOT}/config.js`);

const GY = 620, GRAV = 2300, RUN = 310, JUMP = -830, DT = 1000 / 60;
const FLY = { jelly: 1, chopper: 1, ufo: 1 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SKILLS = {
  novice: { react: 450, miss: 0.30, decide: 180, jit: 75, fire: 0.62, gren: 0.25, idle: 0.22, aimLag: 520 },
  casual: { react: 320, miss: 0.16, decide: 120, jit: 50, fire: 0.80, gren: 0.50, idle: 0.10, aimLag: 330 },
  good:   { react: 230, miss: 0.07, decide: 80,  jit: 30, fire: 0.92, gren: 0.80, idle: 0.04, aimLag: 210 },
  expert: { react: 160, miss: 0.02, decide: 50,  jit: 16, fire: 0.98, gren: 1.00, idle: 0.01, aimLag: 120 },
};
// how long each emitter telegraphs before the shot exists (ms)
const TELL = { rat: 420, zombie: 520, fatz: 600, jelly: 460, flamer: 480, ufo: 400, chopper: 0 };
const SHOT_FROM = { ray: ['rat', 'ufo'], vomit: ['zombie', 'fatz'], zap: ['jelly'], flame: ['flamer'], napalm: ['flamer'], bomb: ['chopper'] };
const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ------------------------------------------------------------------ player
function makeBot(m, p, S, rng) {
  const st = { next: 0, move: 0, up: false, fire: true, jumpNow: false, gren: false, key: '', aimAt: 0, grenAt: 0, pit: {}, lastJump: false };
  const gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += rng(); return (u - 2) * 1.732; };
  const M = 9;   // safety margin a player leaves around a threat (px)

  function perceive() {
    const t = m.t;
    // attention splits: the more that is already coming at you, the likelier the next thing goes unseen
    let busy = 0; for (const s of m.eshots) if (s._n !== undefined && !s._ig && s.k !== 'flame') busy++;
    for (const e of m.en) if (e._hot && !e._tig) busy++;
    const missP = Math.min(0.8, S.miss * (1 + 0.4 * busy));
    for (const s of m.eshots) if (s._n === undefined) { const bb = m.boss; if (s.k === 'beam' && bb) { s._n = t; s._ig = !!bb._tig; } else { s._n = t + Math.max(70, S.react - 0.5 * (TELL[s._srcK] || s._tell || 0)); s._ig = rng() < missP; } }
    for (const e of m.en) { const hot = e.tell > 0 || e.spew > 0 || !!e.hop; if (hot && !e._hot) { e._tn = t + S.react; e._tig = rng() < missP; } e._hot = hot; }
    const b = m.boss; if (b) { const hot = b.st !== 'idle' || b.lunge > 0; if (hot && !b._hot) { b._tn = t + S.react; b._tig = rng() < S.miss; } b._hot = hot; }
  }

  // Simulate the next `horizon` ms holding fn(tau) and return when the hero is first hit (Infinity = clean).
  function firstHit(fn, horizon = 900) {
    const h = m.h, dt = 1 / 30, now = m.t;
    let x = h.x, y = h.y, vx = h.vx, vy = h.vy, onG = h.onG, jumped = false;
    const shots = []; for (const s of m.eshots) if (!s._ig && s._n <= now) shots.push({ k: s.k, x: s.x, y: s.y, vx: s.vx, vy: s.vy, g: s.g || 0, r: s.r, t: s.t || 0, life: s.life });
    const foes = []; for (const e of m.en) if (e.st === 'live') foes.push({ k: e.k, x: e.x, y: e.y, vx: e.vx || 0, vy: e.vy || 0, hop: e.hop, tell: e.tell || 0, spew: e.spew || 0, rise: e.rise || 0, face: e.face, seen: !e._tig && e._tn <= now, sl: -1 });
    const b = m.boss && m.boss.live && m.boss.hp > 0 ? m.boss : null, bSeen = b && !b._tig && b._tn <= now;
    const E = m.eater && !m.eater.stop ? m.eater : null, ew = E ? m.eaterW() : 0; let ex = E ? E.x : 0;
    const home = m.eater ? m.eater.x + m.eaterW() - 190 : 0;
    const left = m.cam + 30, right = m.camLock > 0 ? m.camLock - 30 : m.m.len - 30;
    for (let k = 0; k * 33.34 < horizon || (!onG && k * 33.34 < 1500); k++) {
      const tau = k * 33.34, bits = fn(tau), crouch = !!(bits & C.DOWN) && onG;
      let mv = 0; if (bits & C.L) mv = -1; if (bits & C.R) mv = 1;
      vx += ((crouch ? 0 : mv * RUN) - vx) * Math.min(1, dt * 18);
      if ((bits & C.JUMP) && onG && !jumped) { vy = JUMP; onG = false; jumped = true; }
      else if (onG && mv && y >= GY - 1 && !m.solid(x + mv * 16) && m.solid(x)) { vy = JUMP; onG = false; }   // a pit ahead gets jumped, as it will be
      const py = y; vy += GRAV * dt; x += vx * dt; y += vy * dt;
      const ly = m.land({ x, y, vy }, py); if (ly !== null) { y = ly; vy = 0; onG = true; } else onG = false;
      x = clamp(x, left, right);
      if (y > GY + 60) return Math.min(tau, horizon - 1);
      if (tau >= horizon) continue;                                  // past the horizon only the landing matters
      const hh = crouch ? 44 : 84;
      for (const s of shots) {
        if (s.dead) continue;
        s.t += 33.34; if (s.g) s.vy += s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.k === 'beam') { if (s.t > s.life) { s.dead = 1; continue; } if (Math.abs(s.x - x) < 34 + M) return tau; continue; }
        if (s.k === 'flame' && s.t > s.life) { s.dead = 1; continue; }
        if (s.k === 'patch') { if (s.t > s.life) s.dead = 1; else if (Math.abs(s.x - x) < 44 + M && y > GY - 40) return tau; continue; }
        if (Math.abs(s.x - x) < 20 + s.r + M && s.y > y - hh - s.r - M && s.y < y + s.r + M) return tau;
        if (s.k === 'wave') { if (Math.abs(s.x - x) < 34 + M && y > GY - 46 - M) return tau; continue; }
        if (s.y >= GY && m.solid(s.x) && s.k === 'napalm') { s.k = 'patch'; s.y = GY; s.vx = s.vy = s.g = 0; s.t = 0; s.life = 1300; continue; }
        if (s.y >= GY && m.solid(s.x)) { s.dead = 1; if ((s.k === 'bomb' || s.k === 'shell') && Math.abs(s.x - x) < (s.k === 'shell' ? 90 : 60) + M && y > GY - 70 - M) return tau; }
      }
      for (const f of foes) {
        if (f.rise > 0) { f.rise -= 33.34; continue; }
        const dx = x - f.x, ad = Math.abs(dx), sg = dx > 0 ? 1 : -1;
        if (f.k === 'zombie') { f.x += sg * 62 * dt; if (tau < 320 && ad < 42 + M && Math.abs(y - f.y) < 70) return tau; }   // walkers are handled by spacing, not by reflex
        else if (f.k === 'fatz') { if (ad > 260) f.x += sg * 44 * dt; if (tau < 320 && ad < 70 + M && Math.abs(y - f.y) < 110) return tau; }
        else if (f.k === 'crab') {
          if (f.hop) { f.vy += GRAV * dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.y >= GY) { f.y = GY; f.hop = 0; } }
          else if (f.tell > 0 && f.seen) { f.tell -= 33.34; if (f.tell <= 0) { f.hop = 1; f.vy = -760; f.vx = clamp(dx * 1.25, -620, 620); } }
          else if (ad > 380) f.x += sg * 210 * dt;
          if (ad < 66 + M && Math.abs(y - f.y) < 80) return tau;
        }
        else if (f.k === 'jelly') { if (ad < 44 + M && Math.abs((y - 50) - f.y) < 60) return tau; }
        else if (f.k === 'flamer' && f.seen && (f.tell > 0 || f.spew > 0 || f.sl > 0)) {
          if (f.tell > 0) { f.tell -= 33.34; if (f.tell <= 0) f.sl = 1500; }
          else { if (f.sl < 0) f.sl = f.spew + 500; f.sl -= 33.34; const rel = (x - f.x) * f.face; if (f.sl > 0 && rel > -10 && rel < 345 && y > GY - 95) return tau; }
        }
      }
      if (E) { ex += 112 * dt; if (x < ex + ew + 40) return tau; }
      if (b) {
        if (b.k === 'zero' && Math.abs(x - b.x) < 110 + M) return tau;
        if (b.k === 'core' && x > b.x - 190 - M) return tau;
        const tr = Math.max(0, b.tell || 0);
        if (b.k === 'eater') { const a0 = b.lunge > 0 ? 0 : (b.st === 'lunge' && bSeen ? tr : -1), a1 = b.lunge > 0 ? b.lunge : tr + 900; if (a0 >= 0 && tau >= a0 && tau <= a1 && x < home + 545 && y > GY - 200) return tau; }
        if (b.k === 'jellyq' && b.st === 'bolts' && bSeen && b.cols && tau >= tr - 40 && tau <= tr + 340) for (const cx of b.cols) if (Math.abs(x - cx) < 34 + M + 4) return tau;
        if (b.k === 'gunship' && b.st === 'string' && bSeen && tau >= tr + 550 && tau <= tr + (5 - (b.k2 || 0)) * 130 + 950 && Math.abs(x - b.x) < 60 + M + 8 && y > GY - 70) return tau;
      }
    }
    return Infinity;
  }

  // pits: a known obstacle, so the jump is anticipated; only the timing is human
  function pitJump(dir) {
    const h = m.h; if (!h.onG || !dir) return false;
    const onPlat = h.y < GY - 4 ? m.plats().find(([px, py, pw]) => Math.abs(py - h.y) < 3 && h.x >= px - 6 && h.x <= px + pw + 6) : null;
    const foot = (x) => onPlat ? (x >= onPlat[0] - 6 && x <= onPlat[0] + onPlat[2] + 6) : m.solid(x);
    let edge = null; for (let d = 0; d <= 260; d += 4) if (!foot(h.x + dir * d)) { edge = h.x + dir * (d - 4); break; }
    if (edge === null) return false;
    if (onPlat && m.solid(edge + dir * 30)) return false;            // just a ledge over solid ground: walk off
    let end = null; for (let d = 8; d <= 420; d += 4) if (m.solid(edge + dir * d)) { end = edge + dir * d; break; }
    const key = Math.round(edge) + ':' + dir;
    if (st.pit[key] === undefined) {
      const reach = 205, width = end === null ? 999 : Math.abs(end - edge);
      const lo = Math.max(0, width + 14 - reach), hi = 60;            // take off between lo and hi px short of the lip
      const aim = lo < hi ? Math.min(34, (lo + hi) / 2 + 4) : 12;
      st.pit[key] = Math.max(aim, lo < aim ? lo + 2 : aim) + gauss() * S.jit * 0.31;
    }
    const gap = (edge - h.x) * dir;
    if (Math.abs(h.vx) < 240 && end !== null && gap > 205 - Math.abs(end - edge) - 14) return false;   // not up to speed yet: nobody hops in from a standstill
    return gap <= st.pit[key];
  }

  function decide() {
    const h = m.h, t = m.t, b = m.boss && m.boss.live && m.boss.hp > 0 ? m.boss : null;
    let mv = 0, up = false, gren = false, key = '', turn = 0;
    const live = m.en.filter(e => e.st === 'live' && e.x > m.cam - 10 && e.x < m.cam + W + 10);
    let g = null, gd = 1e9, f = null, fd = 1e9;
    for (const e of live) { const d = Math.abs(e.x - h.x); if (FLY[e.k]) { if (d < fd) { fd = d; f = e; } } else if (d < gd) { gd = d; g = e; } }
    const STAND = { rat: 330, zombie: 150, fatz: 500, crab: 430, flamer: 410 };
    const chase = m.eater && !m.eater.stop ? h.x - (m.eater.x + m.eaterW()) : null;
    let tgt = null;
    if (g && gd < STAND[g.k] + 200) tgt = g; else if (f && (!b || !b.fly)) tgt = f; else if (g && !b) tgt = g;
    if (b && !tgt) {
      const home = m.eater ? m.eater.x + m.eaterW() - 190 : 0;
      if (b.fly) { const dx = b.x - h.x; if (Math.abs(dx) > 40) mv = dx > 0 ? 1 : -1; up = true; key = 'B^'; }
      else {
        const face = b.k === 'eater' ? -1 : 1;
        const want = b.k === 'zero' ? b.x - 410 : b.k === 'core' ? b.x - 440 : b.k === 'barge' ? b.x - b.w / 2 - 290 : home + 590;
        if (h.x < want - 36) mv = 1; else if (h.x > want + 36) mv = -1; else if (h.face !== face) turn = face;
        key = 'B' + face;
        const edge = Math.abs(b.x - h.x) - b.w / 2;
        if (h.face === face && edge > 150 && edge < 335 && h.gren > 0 && t > st.grenAt) { st.grenAt = t + 700 / S.gren; gren = true; }
      }
    } else if (tgt && !FLY[tgt.k]) {
      const dir = tgt.x > h.x ? 1 : -1, S0 = chase !== null ? Math.min(STAND[tgt.k], 300) : STAND[tgt.k];
      const bz = b && !b.fly ? (b.k === 'eater' ? h.x - dir * 70 < b.x + 560 : h.x - dir * 70 > b.x - b.w / 2 - 150) : false;   // never back into the boss
      if (h.onG && h.y < GY - 4) mv = gd > 90 ? dir : -dir;
      else if (gd < S0 - 70 && m.solid(h.x - dir * 70) && h.x - dir * 70 > m.cam + 40 && !bz) mv = -dir;
      else if (gd > S0 + 240) mv = dir;
      else if (h.face !== dir) turn = dir;
      key = 'h' + dir;
      if (h.face === dir && gd > 200 && gd < 430 && h.gren > 0 && t > st.grenAt) {
        const near = live.filter(e => !FLY[e.k] && Math.abs(e.x - (h.x + dir * 330)) < 140).length;
        if (tgt.hpMax >= 6 || near >= 2) { st.grenAt = t + 1300; if (rng() < S.gren) gren = true; }
      }
    } else if (tgt) {
      const lead = tgt.k === 'chopper' ? -40 : 0, dx = tgt.x + lead - h.x;
      if (Math.abs(dx) > 30) mv = dx > 0 ? 1 : -1;
      if (Math.abs(dx) < 80) up = true;
      key = up ? '^' : 'h' + (dx > 0 ? 1 : -1);
    } else { mv = 1; key = 'h1'; }
    // hurt, and a medkit is lying on screen: go and get it unless something is in your face
    const med = p.hp <= 2 ? m.picks.find(k => k.k === 'med' && k.y > GY - 40 && k.x > m.cam + 40 && k.x < m.cam + W - 40) : null;
    if (med && Math.abs(med.x - h.x) > 16 && (!g || gd > 170)) { mv = med.x > h.x ? 1 : -1; turn = 0; }
    if (chase !== null && chase < 300) mv = 1;                       // the bridge: it is right behind you
    if (!b && mv && rng() < S.idle) mv = 0;                          // hesitation
    if (key !== st.key) { st.key = key; st.aimAt = t + S.aimLag; }
    const fire = t >= st.aimAt && rng() < S.fire;

    // is the plan safe? if not, find a dodge
    const base = (mv < 0 ? C.L : mv > 0 ? C.R : 0);
    const wantJump = pitJump(mv);
    const plan = (tau) => base | (wantJump && tau === 0 ? C.JUMP : 0);
    let act = base, jump = wantJump;
    const d0 = firstHit(plan);
    if (d0 !== Infinity) {
      const ALTS = [[0, 0], [C.L, 0, 220], [C.R, 0, 220], [C.DOWN, 0], [0, 1], [C.L, 0], [C.R, 0], [C.L, 1], [C.R, 1]];
      let best = null, bt = d0;
      for (const [mb, j, hold] of ALTS) {
        if (h.onG === false && j) continue;
        const tt = firstHit((tau) => (hold && tau > hold ? 0 : mb) | (j && tau === 0 ? C.JUMP : 0));
        if (tt === Infinity) { best = [mb, j]; bt = tt; break; }
        if (tt > bt + 120) { best = [mb, j]; bt = tt; }
      }
      if (best && (bt === Infinity || d0 < 260)) { act = best[0]; jump = !!best[1]; }
    }
    st.move = act; st.up = up; st.fire = fire; st.jumpNow = jump; st.gren = gren; st.turn = act === 0 && !mv ? turn : 0;
  }

  return function bot(frame) {
    if (m.phase === 'drop' || m.phase === 'out' || m.phase === 'clear') return 0;
    if (m.phase === 'fork') return missionBot(m, frame);
    perceive();
    if (m.t >= st.next) { st.next = m.t + S.decide; decide(); }
    else if (!st.jumpNow && (st.move & (C.L | C.R)) && !(st.move & C.DOWN)) st.jumpNow = pitJump(st.move & C.R ? 1 : -1);   // a lip can arrive between decisions
    let bits = st.move | (st.up ? C.UP : 0) | (st.fire ? C.FIRE : 0);
    if (st.turn) { bits |= st.turn > 0 ? C.R : C.L; st.turn = 0; }
    if (st.jumpNow && !st.lastJump) { bits |= C.JUMP; st.jumpNow = false; }
    if (st.gren) { bits |= C.GREN; st.gren = false; }
    st.lastJump = !!(bits & C.JUMP);
    return bits;
  };
}

// --------------------------------------------------------------- one mission
function playMission(id, skillName, seed, p, route) {
  const S = SKILLS[skillName];
  Math.random = mulberry(seed * 7919 + 13);
  const rng = mulberry(seed * 104729 + 71);
  const m = new Mission(id, { via: id === 'graveyard' ? null : (process.env.VIA === 'none' ? null : process.env.VIA || null) }); m.botRoute = route || 'low';
  if (argOf('heat', '')) m.heat = +argOf('heat', 1);   // what-if knob for tuning
  const bot = makeBot(m, p, S, rng);
  const TR = +argOf('trace', 0);
  const R = { id, skill: skillName, seed, hits: [], deaths: [], weap: { rifle: 0, H: 0, F: 0, R: 0 }, frames: 0, bossMs: 0, playMs: 0, pits: 0, meds: 0, d0: p.deaths || 0 };
  let lastSt = 'idle', lastDeathT = -1e9;
  const waveAt = () => { let i = -1; m.waves.forEach((w, k) => { if (w.done) i = k; }); return i; };
  const classify = () => {
    const h = m.h, b = m.boss && m.boss.live && m.boss.hp > 0 ? m.boss : null;
    if (h.y > H + 120) return { src: 'pit' };
    if (m.eater && !m.eater.stop && h.x < m.eater.x + m.eaterW() + 26) return { src: 'eater:chew' };
    const hh = h.crouch ? 44 : 84;
    for (const s of m.eshots) {
      const body = s.k !== 'patch' && Math.abs(s.x - h.x) < 20 + s.r && s.y > h.y - hh - s.r && s.y < h.y + s.r;
      const splash = (s.k === 'bomb' || s.k === 'shell') && s.y >= GY && Math.abs(s.x - h.x) < (s.k === 'shell' ? 90 : 60) && h.y > GY - 70;
      const wave = s.k === 'wave' && Math.abs(s.x - h.x) < 34 && h.y > GY - 46;
      const beam = s.k === 'beam' && Math.abs(s.x - h.x) < 34;
      const patch = s.k === 'patch' && Math.abs(s.x - h.x) < 44 && h.y > GY - 40;
      if (patch) return { src: 'flamer:fire-patch', shot: s };
      if (s.k !== 'patch' && (body || splash || wave || beam)) return { src: s._src || s.k, shot: s };
    }
    if (b) {
      if (b.k === 'zero' && Math.abs(h.x - b.x) < 110) return { src: 'zero:touch' };
      if (b.k === 'core' && h.x > b.x - 190) return { src: 'core:touch' };
      if (b.k === 'eater' && b.lunge > 0) return { src: 'eater:lunge' };
    }
    for (const e of m.en) {
      if (e.st !== 'live') continue; const ad = Math.abs(h.x - e.x);
      if ((e.k === 'zombie' && ad < 42) || (e.k === 'fatz' && ad < 70) || (e.k === 'crab' && ad < 66) || (e.k === 'jelly' && ad < 44)) return { src: e.k + ':touch', foe: e };
    }
    return { src: '?' };
  };
  const orig = m.hurtHero.bind(m);
  m.hurtHero = (pp, amt) => {
    const hp0 = pp.hp, dd0 = pp.deaths || 0, c = classify();
    orig(pp, amt);
    if (pp.hp === hp0 && (pp.deaths || 0) === dd0) return;
    const flags = [];
    if (c.shot) {
      const warn = (m.t - c.shot._born) + (TELL[c.shot._srcK] || c.shot._tell || 0);
      if (c.shot._off) flags.push('offscreen-source');
      if (warn < 450) flags.push('no-warning');
    }
    if (c.foe && c.foe.t < 350) flags.push('spawned-on-hero');
    if (m.t - lastDeathT < 3300 && c.src !== 'pit') flags.push('right-after-respawn');
    const loc = m.phase === 'boss' ? 'boss' : `w${waveAt() + 1}@${waveAt() >= 0 ? m.waves[waveAt()].x : 0}`;
    const hit = { src: c.src, loc, flags, t: m.t, x: Math.round(m.h.x) };
    if (TR) console.log(`   HIT ${c.src} [${flags}] hero x=${Math.round(m.h.x)} y=${Math.round(m.h.y)} onG=${m.h.onG} shotAge=${c.shot ? Math.round(m.t - c.shot._born) : '-'}`);
    R.hits.push(hit);
    if (c.src === 'pit') R.pits++;
    if ((pp.deaths || 0) > dd0) { R.deaths.push(hit); lastDeathT = m.t; }
  };
  let ms = 0, fr = 0, hpPrev = p.hp;
  while (!m.done && ms < 600000) {
    const bossSt = m.boss ? m.boss.st : 'idle';
    if (bossSt !== 'idle') lastSt = bossSt;
    const bits = bot(fr++); if (TR && fr % Math.round(TR / DT) === 0) console.log(`t=${(ms/1000).toFixed(1)} ph=${m.phase} x=${Math.round(m.h.x)} y=${Math.round(m.h.y)} cam=${Math.round(m.cam)} lock=${Math.round(m.camLock)} bits=${bits} hp=${p.hp} L=${p.lives} w=${m.h.weap} en=[${m.en.map(e => e.k[0] + Math.round(e.x) + (e.rise > 0 ? "r" : "")).join(" ")}] boss=${m.boss ? Math.round(m.boss.hp) + m.boss.st + '@' + Math.round(m.boss.x) : "-"} es=[${m.eshots.map(q => q.k[0] + Math.round(q.x) + ',' + Math.round(q.y)).join(' ')}]`);
    const dBefore = p.deaths || 0;
    m.step(bits, DT, p); m.events.length = 0; ms += DT;
    if (p.hp > hpPrev && (p.deaths || 0) === dBefore) R.meds++;
    hpPrev = p.hp;
    // tag fresh enemy fire with who sent it and whether they were on screen
    for (const s of m.eshots) if (s._born === undefined) {
      s._born = m.t;
      let src = null; const kinds = SHOT_FROM[s.k] || [];
      let bd = 170; for (const e of m.en) if (kinds.includes(e.k) && e.st === 'live') { const d = Math.hypot(e.x - s.x, (e.y - 50) - s.y); if (d < bd) { bd = d; src = e; } }
      if (src) { s._src = src.k; s._srcK = src.k; s._off = src.x < m.cam - 4 || src.x > m.cam + W + 4; }
      else if (m.boss && m.boss.live && m.phase === 'boss') { s._src = m.boss.k + ':' + lastSt; s._tell = 600; }
      else if (s.k === 'glob') { s._src = 'drip'; s._tell = 900; }
      else if (s.k === 'patch') { s._src = 'flamer:fire-patch'; s._tell = 1400; }
      else s._src = s.k;
    }
    if (m.phase === 'play' || m.phase === 'boss') { R.weap[m.h.weap]++; R.frames++; if (m.phase === 'boss') R.bossMs += DT; else R.playMs += DT; }
  }
  R.ms = ms; R.cleared = m.done && !m.dead; R.gameover = !!m.dead; R.timeout = !m.done; R.next = m.next;
  R.nDeaths = (p.deaths || 0) - R.d0; R.livesLeft = p.lives; R.kills = m.kills; R.phase = m.phase; R.bossHp = m.boss ? Math.round(m.boss.hp) : null;
  return R;
}

// ------------------------------------------------------------------ report
const med = (a) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const pct = (n, d) => d ? Math.round(100 * n / d) : 0;
const top = (o, n, tot) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${tot ? pct(v, tot) + '%' : v}`).join(', ');
function summarize(runs) {
  const N = runs.length, cl = runs.filter(r => r.cleared);
  const dmg = {}, dloc = {}, dsrc = {}, cheap = {}; let hits = 0, deaths = 0, fr = 0; const wp = { rifle: 0, H: 0, F: 0, R: 0 };
  for (const r of runs) {
    for (const h of r.hits) { dmg[h.src] = (dmg[h.src] || 0) + 1; hits++; for (const f of h.flags) cheap[f + ' <' + h.src + '>'] = (cheap[f + ' <' + h.src + '>'] || 0) + 1; }
    for (const d of r.deaths) { dloc[d.loc] = (dloc[d.loc] || 0) + 1; dsrc[d.src] = (dsrc[d.src] || 0) + 1; deaths++; }
    for (const k in wp) wp[k] += r.weap[k]; fr += r.frames;
  }
  return {
    n: N, clear: pct(cl.length, N), timeouts: runs.filter(r => r.timeout).length,
    time: Math.round(med((cl.length ? cl : runs).map(r => r.ms / 1000))), deaths: med(runs.map(r => r.nDeaths)), deathsMax: Math.max(...runs.map(r => r.nDeaths)),
    boss: Math.round(med((cl.length ? cl : runs).map(r => r.bossMs / 1000))), hits: +(hits / N).toFixed(1), pits: +(runs.reduce((a, r) => a + r.pits, 0) / N).toFixed(1),
    meds: +(runs.reduce((a, r) => a + r.meds, 0) / N).toFixed(1),
    dmg, dloc, dsrc, cheap, hitsTotal: hits, deathsTotal: deaths, weap: Object.fromEntries(Object.keys(wp).map(k => [k, pct(wp[k], fr)])),
  };
}

const SEEDS = +argOf('seeds', 12), seed0 = +argOf('seed', 1);
const missions = argOf('mission', Object.keys(MISSIONS).join(',')).split(',');
const skills = argOf('skill', Object.keys(SKILLS).join(',')).split(',');
const SLOT = { graveyard: 1, caves: 2, bridge: 2, citadel: 3, coast: 3, hive: 4 };
const out = {};
if (!flag('campaign-only')) {
  console.log(`PART TWO playtest  (${DIR}/missions.js, ${SEEDS} seeds, lives=${CFG.lives} hp=${CFG.hpMax})`);
  for (const id of missions) {
    console.log(`\n== ${id.toUpperCase()}  (slot ${SLOT[id]})`);
    console.log('skill    clear  time  boss  deaths(med/max)  hits  pits  meds  weapon in hand');
    const lines = [];
    for (const sk of skills) {
      const runs = []; for (let s = 0; s < SEEDS; s++) runs.push(playMission(id, sk, seed0 + s, { hp: CFG.hpMax, lives: CFG.lives, deaths: 0, st: 'alive' }, s % 2 ? 'up' : 'low'));
      const z = summarize(runs); (out[id] = out[id] || {})[sk] = z;
      console.log(`${sk.padEnd(8)} ${String(z.clear).padStart(4)}%  ${String(z.time).padStart(3)}s  ${String(z.boss).padStart(3)}s  ${String(z.deaths).padStart(6)} / ${String(z.deathsMax).padEnd(6)}  ${String(z.hits).padStart(4)}  ${String(z.pits).padStart(4)}  ${String(z.meds).padStart(4)}  rifle ${z.weap.rifle}% H ${z.weap.H}% F ${z.weap.F}% R ${z.weap.R}%${z.timeouts ? '  TIMEOUTS ' + z.timeouts : ''}`);
      if (!flag('brief')) {
        lines.push(`  ${sk}: damage by source: ${top(z.dmg, 7, z.hitsTotal)}`);
        if (z.deathsTotal) lines.push(`  ${sk}: deaths at: ${top(z.dloc, 6, z.deathsTotal)}   | killing blow: ${top(z.dsrc, 4, z.deathsTotal)}`);
        if (Object.keys(z.cheap).length) lines.push(`  ${sk}: CHEAP HITS: ${top(z.cheap, 6)}`);
      }
    }
    for (const l of lines) console.log(l);
  }
}
if (flag('campaign') || flag('campaign-only')) {
  console.log('\n== CAMPAIGN (4 missions, lives carried, both forks rotated)');
  const ROUTES = [['caves', 'citadel'], ['caves', 'coast'], ['bridge', 'citadel'], ['bridge', 'coast']];
  for (const sk of skills) {
    let wins = 0; const overAt = {}; const dts = [];
    for (let s = 0; s < SEEDS; s++) {
      const rt = ROUTES[s % 4], order = ['graveyard', rt[0], rt[1], 'hive'];
      const p = { hp: CFG.hpMax, lives: CFG.lives, deaths: 0, st: 'alive' }; let ok = true;
      for (const id of order) { const r = playMission(id, sk, seed0 + s, p, 'low'); if (!r.cleared) { ok = false; overAt[id] = (overAt[id] || 0) + 1; break; } }
      if (ok) wins++; dts.push(p.deaths);
    }
    console.log(`${sk.padEnd(8)} no game over ${pct(wins, SEEDS)}%   median deaths over the run ${med(dts)}   game over in: ${top(overAt, 6) || '-'}`);
    (out._campaign = out._campaign || {})[sk] = { win: pct(wins, SEEDS), deaths: med(dts), overAt };
  }
}
const jf = argOf('json', '');
if (jf) { const fs = await import('node:fs'); fs.writeFileSync(jf, JSON.stringify(out, null, 1)); }
