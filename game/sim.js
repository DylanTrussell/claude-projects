// Authoritative simulation. Runs on the HOST tab (and solo). Guests only render snapshots.
// Fixed timestep, seeded RNG — same seed + same inputs => same game.
import { CFG, C, W, H } from './config.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Level (authored; §7.1 modules calibrated to frozen agency metrics) ----------
// Jump: apex ~190px, length ~300px => gaps 120-240 (tight->comfortable), steps <=150 high.
export const LEVEL = {
  platforms: [ // solid tops you can stand on (x, y, w, h) — crates, sandbags, banks
    [520, 540, 130, 80], [660, 470, 120, 60],          // tutorial crate stairs
    [1450, 545, 170, 75], [2050, 530, 140, 90],
    [2560, 555, 200, 65], [3120, 560, 160, 60],
    [4300, 540, 150, 80], [4900, 500, 130, 60],
    [5740, 545, 170, 75], [6050, 520, 140, 70],
    [6600, 550, 180, 70],
  ],
  pits: [ // gaps in the ground: fall in => spike death (x0, x1)
    [1750, 1890], [2850, 2985], [5850, 5990],
    [5100, 5600],               // THE long gap — crossed via floating islands
    [9400, 9540], [10300, 10440], // act III road washouts (jump the bike)
  ],
  islands: [ // floating platforms over the long gap: x(left), baseY(top), w, bobAmp, bobPeriodMs, phase, loot
    { x: 5140, y: 500, w: 150, amp: 22, per: 2600, ph: 0, loot: 'raygun' },
    { x: 5365, y: 475, w: 150, amp: 26, per: 3100, ph: 1.7, loot: null },
  ],
  traps: [ // hidden punji traps under disturbed earth (x center) — revealed on trigger
    [1180], [2350], [2700], [4700], [5790],
  ].map(a => ({ x: a[0], armed: true })),
  tunnels: [900, 1600, 2250, 2900, 6150],  // VC pop-up spawn points (+ the rat nest mouth)
  pows: [6700],                             // outdoor POW (Mittens is rescued INSIDE the tunnel now)
  fpsDoors: { main: 3350, nest: 6150 },     // first-person tunnel entrances
  crates: [ // breakable crates with pickups: x, kind
    [560, 'grenades'], [2100, 'tuna'], [4350, 'flame'], [5770, 'tuna'], [6080, 'grenades'],
  ],
};

const SEC = CFG.sections;

// Wave director: locks camera until cleared. {x: trigger camX+screen, spawn list}
const WAVES = [
  { x: 700,  lock: 1, spawn: [['gruntVC', 2, 'tunnel'], ['gruntUS', 1, 'right']] },
  { x: 1300, lock: 1, spawn: [['gruntVC', 2, 'tunnel'], ['gruntUS', 2, 'right'], ['gruntVC', 1, 'right']] },
  { x: 2150, lock: 1, spawn: [['gruntUS', 3, 'right'], ['gruntVC', 2, 'tunnel']] },
  { x: 2650, lock: 1, pin: 1, spawn: [['gruntVC', 3, 'tunnel'], ['gruntUS', 3, 'right'], ['gruntVC', 2, 'left']] }, // exam A: pinned down -> air support
  { x: 4200, lock: 1, spawn: [['alien', 3, 'right']] },
  { x: 4800, lock: 1, spawn: [['alien', 3, 'right'], ['ufo', 1, 'sky']] },
  { x: 5600, lock: 1, spawn: [['alien', 4, 'right'], ['ufo', 1, 'sky'], ['alien', 2, 'left']] },
  { x: 6450, lock: 1, spawn: [['alien', 4, 'right'], ['ufo', 2, 'sky'], ['alien', 2, 'left']] }, // exam B
];

let nextId = 1;

export function makeGame(seed, seats) {
  nextId = 1;
  const g = {
    seed, rng: mulberry32(seed),
    t: 0, cam: 0, camLock: -1,
    sec: 'A', invasion: false, over: false, won: false,
    score: 0, pows: 0, checkpoint: 0,
    players: seats.map((s, i) => spawnPlayer(s.pid, s.hero, 200 + i * 60)),
    enemies: [], pickups: [], lures: [], fires: [], // v13: burning ground patches from flame/napalm
    bullets: [], // pooled
    waves: WAVES.map(w => ({ ...w, done: false, alive: [] })),
    traps: LEVEL.traps.map(t => ({ ...t })),
    powsLeft: LEVEL.pows.slice(),
    crates: LEVEL.crates.map(c => ({ x: c[0], kind: c[1], hp: 1, id: nextId++ })),
    boss: null, bossDone: false,
    heliEvac: null,
    events: [],
    banners: { A: false, tunnel: false, B: false, boss: false, cheeseDrop: false, cheeseHint: false, trapHint: false, ufoHint: false },
    // scripted opening
    phase: 'insertion', phaseT: 0, phaseStep: 0,
    pinned: false, airSupport: 'none', airT: 0,
  };
  for (let i = 0; i < CFG.bulletPool; i++) g.bullets.push({ on: 0, x: 0, y: 0, vx: 0, vy: 0, k: 0, from: 0, t: 0 });
  for (const px of LEVEL.pows) g.enemies.push(en('pow', px, CFG.groundY));
  for (const isl of LEVEL.islands) { // island loot floats where the brave go
    if (isl.loot) g.pickups.push({ id: nextId++, x: isl.x + isl.w / 2, y: isl.y - 8, kind: isl.loot, t: 1e9 });
  }
  // insertion helicopter carrying the squad
  g.lift = en('heli', -160, 170, { st: 'insert', side: 'buddy' });
  g.enemies.push(g.lift);
  for (const p of g.players) { p.st = 'riding'; p.x = -160; p.y = 170; }
  return g;
}

// --- act III: the bike (driver + sidecar gunner as one vehicle) ---
function stepBike(g, p, bits, dt, dts) {
  p.invulnT = Math.max(0, p.invulnT - dt);
  p.fireCd -= dt; p.grenCd -= dt;
  p.aimUp = !!(bits & C.UP);
  p.aimDown = !p.onG && !!(bits & C.DOWN);
  p.crouch = false;
  p.face = 1; p.runT += dt;
  let v = CFG.bikeBase;
  if (bits & C.R) v = CFG.bikeMax; else if (bits & C.L) v = CFG.bikeMin;
  p.vx = v;
  const jp = (bits & C.JUMP) && !(p.prevC & C.JUMP);
  if (jp && p.onG) { p.vy = CFG.bikeJumpVy; p.onG = false; }
  p.vy += CFG.gravity * dts;
  p.x += p.vx * dts; p.y += p.vy * dts;
  p.x = Math.max(g.cam + 30, Math.min(p.x, CFG.worldLen - 30));
  p.onG = false;
  const gy = groundAt(p.x);
  if (p.y >= gy) { p.y = gy; p.vy = 0; p.onG = true; }
  if (p.y > H + 200) { p.invulnT = 0; hurtPlayer(g, p, 'pit', 99); return; }
  if ((bits & C.FIRE) && p.fireCd <= 0) { // sidecar mounted gun (Trung Sĩ Mèo earns his ride)
    p.fireCd = CFG.bikeGunCd;
    const up = p.aimUp, down = p.aimDown;
    fireBullet(g, p.x + (up ? 20 : 52), p.y - (up ? 96 : 56),
      up ? 140 : (down ? 360 : 780), up ? -720 : (down ? 520 : (g.rng() - 0.5) * 60), 2, 1);
    evPush(g, { e: 'sfx', n: 'sfx_shot' });
    // v10: match the ground-hero muzzle fix — keep the up-aim flash offset to
    // the side of centerline rather than dead-center.
    evPush(g, { e: 'muzzle', x: p.x + (up ? 30 : 56), y: p.y - (up ? 104 : 56), up: up ? 1 : 0, f: 1 });
  }
  if ((bits & C.GREN) && !(p.prevC & C.GREN) && p.grenCd <= 0 && p.gren > 0) {
    p.gren--; p.grenCd = CFG.grenadeCd;
    fireBullet(g, p.x + 30, p.y - 70, CFG.grenadeVx + v * 0.5, CFG.grenadeVy, 3, 1);
  }
  p.prevC = bits;
}

// --- scripted opening: heli insertion, ambush, the dragging of Pvt. Mittens ---
function stepInsertion(g, dt, dts) {
  g.phaseT += dt;
  const t = g.phaseT, lift = g.lift;
  if (lift && lift.st === 'insert') {
    if (t < 2600) { // fly in and flare down onto LZ CATNIP
      const k = Math.min(1, t / 2400);
      lift.x = -160 + (520 - -160) * k;
      lift.y = 170 + (CFG.groundY - 118 - 170) * (k * k);
      for (const p of g.players) if (p.st === 'riding') { p.x = lift.x - 10; p.y = lift.y + 40; }
    } else if (g.phaseStep < 1) { // touchdown: squad out
      g.phaseStep = 1;
      for (const p of g.players) { p.st = 'alive'; p.x = 480; p.y = CFG.groundY; p.vx = 0; p.vy = 0; p.invulnT = 2600; }
      for (let i = 0; i < 3; i++) {
        g.enemies.push(en('buddy', 380 + i * 46, CFG.groundY, { hp: 8, side: 'buddy', face: 1, sq: i }));
      }
      evPush(g, { e: 'banner', k: 'actA' });
      evPush(g, { e: 'boom', x: 520, y: CFG.groundY - 10, big: 0 });
    } else if (t > 3300 && g.phaseStep < 2) { // dustoff
      g.phaseStep = 2;
      lift.vx = -260; lift.vy = -160;
    }
    if (g.phaseStep >= 2) { lift.x += lift.vx * dts; lift.y += lift.vy * dts; if (lift.y < -240) { lift.st = 'gone'; g.lift = null; } }
  }
  if (t > 3900 && g.phaseStep < 3) { // AMBUSH: mortars take the squad apart
    g.phaseStep = 3;
    for (const e2 of g.enemies) {
      if (e2.k === 'buddy' && e2.sq === 0) {
        e2.st = 'gone';
        evPush(g, { e: 'boom', x: e2.x, y: e2.y - 30, big: 1 });
        evPush(g, { e: 'blood', x: e2.x, y: e2.y - 40, big: 1 });
      }
    }
    evPush(g, { e: 'sfx', n: 'sfx_explosion' });
    evPush(g, { e: 'banner', k: 'squadDown' });
    evPush(g, { e: 'shake', m: 10 });
  }
  if (t > 4700 && g.phaseStep < 4) { // Mittens gets dragged into the tunnels
    g.phaseStep = 4;
    const mittens = g.enemies.find(e2 => e2.k === 'buddy' && e2.sq === 1);
    if (mittens) mittens.st = 'gone'; // grabbed — he reappears as the tunnel POW
    g.enemies.push(en('gruntVC', 640, CFG.groundY, { st: 'drag', face: 1, hp: 99 }));
    evPush(g, { e: 'banner', k: 'mittensTaken' });
    evPush(g, { e: 'sfx', n: 'sfx_meow' });
  }
  if (t > 6000) {
    g.phase = 'play'; // weapons free
    evPush(g, { e: 'hint', k: 'ctlMove' });
    evPush(g, { e: 'hint', k: 'ctlGrenade' });
  }
}

function spawnPlayer(pid, hero, x) {
  return {
    pid, hero, x, y: CFG.groundY - 200, vx: 0, vy: 0, face: 1, onG: false,
    st: 'alive', lives: CFG.lives, hp: CFG.hpMax, invulnT: CFG.invulnMs, respT: 0,
    weap: 'rifle', ammo: 0, gren: CFG.startGrenades, cheese: 0,
    fireCd: 0, grenCd: 0, cheeseCd: 0, meleeCd: 0, meleeT: 0,
    coyote: 0, jbuf: 0, aimUp: false, deaths: 0, score: 0,
    prevC: 0, runT: 0,
    fireFlashT: 0, // v11: brief "just fired" window — see render.js's drawPlayerEnt
  };
}

function en(k, x, y, extra) {
  return Object.assign({
    id: nextId++, k, x, y, vx: 0, vy: 0, face: -1, hp: 1, st: 'walk', t: 0, fireCd: 800, wave: -1,
  }, defaults(k), extra || {});
}
function defaults(k) {
  switch (k) {
    case 'gruntUS': return { hp: CFG.gruntHp, side: 'us' };
    case 'gruntVC': return { hp: CFG.gruntHp, side: 'vc' };
    case 'alien':   return { hp: CFG.alienHp, side: 'alien' };
    case 'ufo':     return { hp: CFG.ufoHp, side: 'alien', st: 'hover' };
    case 'heli':    return { hp: CFG.heliHp, side: 'us', st: 'pass' };
    case 'pow':     return { hp: 1, side: 'pow', st: 'captive' };
    case 'boss':    return { hp: CFG.bossHp, side: 'alien', st: 'enter', ph: 1, open: 0, atkT: 2000 };
    default: return {};
  }
}

// ---------- helpers ----------
function groundAt(x) {
  for (const [x0, x1] of LEVEL.pits) if (x > x0 && x < x1) return H + 400; // pit
  return CFG.groundY;
}
export function islandTop(t, isl) {
  return isl.y + Math.sin((t / isl.per) * Math.PI * 2 + isl.ph) * isl.amp;
}
function platformUnder(g, x, y, vy) {
  let best = null;
  for (const [px, py, pw] of LEVEL.platforms) {
    if (x >= px - 6 && x <= px + pw + 6 && vy >= 0 && y <= py + 14 && y >= py - 40) {
      if (best === null || py < best) best = py;
    }
  }
  for (const isl of LEVEL.islands) { // floating islands bob — tops move
    const top = islandTop(g.t, isl);
    if (x >= isl.x - 6 && x <= isl.x + isl.w + 6 && vy >= 0 && y <= top + 18 && y >= top - 44) {
      if (best === null || top < best) best = top;
    }
  }
  return best;
}
// nearest x to want that is real, solid, un-trapped ground (never respawn into a pit)
function safeGroundX(g, want) {
  for (let d = 0; d <= 520; d += 20) {
    for (const s of d === 0 ? [1] : [1, -1]) {
      const x = want + d * s;
      if (x < 40 || x > CFG.worldLen - 40) continue;
      if (groundAt(x) !== CFG.groundY) continue;
      if (g.traps.some(tr => tr.armed && Math.abs(tr.x - x) < 60)) continue;
      return x;
    }
  }
  return want;
}
function evPush(g, e) { g.events.push(e); }
function alivePlayers(g) { return g.players.filter(p => p.st === 'alive'); }

// Health-meter damage: most hits chip HP and grant i-frames; death only at 0 HP.
function hurtPlayer(g, p, why, dmg) {
  if (p.st !== 'alive' || p.invulnT > 0 || g.over) return;
  dmg = dmg || 1;
  p.hp -= dmg;
  if (p.hp > 0) { // tagged but alive: blood nick, i-frames, tiny knockback
    p.invulnT = CFG.hitInvulnMs;
    p.vx = -80 * p.face;
    evPush(g, { e: 'sfx', n: 'sfx_meow' });
    evPush(g, { e: 'blood', x: p.x, y: p.y - 44, big: 0 });
    evPush(g, { e: 'shake', m: CFG.shakeHit });
    return;
  }
  p.st = 'dead'; p.deaths++; p.respT = 1400; p.deathKind = why;
  if (why === 'trap') { p.vx = 0; p.vy = -60; } // impaled — the body stays on the spikes
  else { p.vx = -120 * p.face; p.vy = -420; }
  evPush(g, { e: 'sfx', n: 'sfx_meow' });
  evPush(g, { e: 'blood', x: p.x, y: p.y - 44, big: (why === 'trap' || why === 'pit') ? 1 : 0 });
  evPush(g, { e: 'boom', x: p.x, y: p.y - 40, big: 0 });
  evPush(g, { e: 'shake', m: CFG.shakeHit });
}

function killEnemy(g, e, big) {
  e.st = 'gone';
  const pts = e.k === 'boss' ? 5000 : e.k === 'ufo' ? 300 : e.k === 'heli' ? 800 : 100;
  g.score += pts;
  // The short rung of the reward ladder. The score lived only in the top-centre
  // HUD, which on a phone is a couple of CSS pixels tall, so a good firefight
  // and a bad one felt identical. Float the points off the body instead.
  evPush(g, { e: 'score', x: e.x, y: e.y - 50, n: pts });
  evPush(g, { e: 'boom', x: e.x, y: e.y - 30, big: big ? 1 : 0 });
  evPush(g, { e: 'sfx', n: 'sfx_explosion' });
  // drops: their weapons, not their lunch — cheese is mission-issued, not confetti
  if (!g.rideOn) {
    if (e.k === 'alien' && g.rng() < 0.18) {
      g.pickups.push({ id: nextId++, x: e.x, y: CFG.groundY - 20, kind: 'raygun', t: 15000 });
    } else if (e.k === 'ufo' && g.rng() < 0.25) {
      g.pickups.push({ id: nextId++, x: e.x, y: CFG.groundY - 20, kind: 'raygun', t: 15000 });
    }
  }
}

function fireBullet(g, x, y, vx, vy, k, from) {
  for (const b of g.bullets) {
    if (!b.on) { b.on = 1; b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.k = k; b.from = from; b.t = 2600; b.p = 0; b.lh = -1; return b; }
  }
  return null;
}

// ---------- main step ----------
export function step(g, dt, inputs) {
  if (g.over) { g.t += dt; return; }
  g.t += dt;
  const dts = dt / 1000;
  if (g.phase === 'insertion') {
    stepInsertion(g, dt, dts);
    inputs = {}; // controls locked during the opening cinematic
  }

  // -- players --
  for (const p of g.players) {
    const bits = inputs[p.pid] | 0;
    if (p.st === 'riding') continue; // aboard the insertion heli
    if (p.st === 'dead') {
      p.respT -= dt;
      p.vy += CFG.gravity * dts; p.x += p.vx * dts; p.y += p.vy * dts;
      if (p.respT <= 0) {
        if (p.lives > 1) {
          p.lives--; p.st = 'alive'; p.hp = CFG.hpMax; p.invulnT = CFG.invulnMs;
          // Respawn 260px in rather than 120: at 120 you drop in at the very
          // edge of a 1280-wide camera, half-cropped and often right on top of
          // whatever just killed you. Playtesters twice lost track of their own
          // character on respawn.
          p.x = safeGroundX(g, Math.max(g.cam + 260, g.checkpoint + 100)); p.y = 100; p.vx = 0; p.vy = 0;
          // Tell the player what killed them. deathKind has been set since v13
          // but ONLY ever picked a ragdoll animation -- the player was never
          // actually told, so repeated deaths taught nothing. Both playtesters
          // independently called this the worst feedback gap in the game.
          const causeK = p.deathKind === 'trap' ? 'diedTrap'
            : p.deathKind === 'pit' ? 'diedPit'
            : p.deathKind === 'boom' ? 'diedBoom'
            : p.deathKind === 'abduct' ? 'diedAbduct' : 'diedShot';
          evPush(g, { e: 'hint', k: causeK });
        } else { p.lives = 0; p.st = 'out'; }
        if (g.players.every(q => q.st === 'out')) {
          g.over = true; evPush(g, { e: 'gameover' });
        }
      }
      continue;
    }
    if (p.st !== 'alive') continue;

    if (p.mode === 'bike') { stepBike(g, p, bits, dt, dts); continue; }

    p.invulnT = Math.max(0, p.invulnT - dt);
    p.fireCd -= dt; p.grenCd -= dt; p.cheeseCd -= dt; p.meleeCd -= dt; p.meleeT -= dt;
    p.fireFlashT -= dt;
    p.crouch = p.onG && !!(bits & C.DOWN);          // S on the ground = crouch
    p.aimDown = !p.onG && !!(bits & C.DOWN);        // S in the air = shoot down
    p.aimUp = !!(bits & C.UP) && !p.crouch;

    let mx = 0;
    if (bits & C.L) mx -= 1;
    if (bits & C.R) mx += 1;
    if (p.crouch) mx = 0;                            // dug in
    if (mx) { p.face = mx; p.runT += dt; } else p.runT = 0;
    p.vx = mx * CFG.run;

    // jump: coyote + buffer
    const jumpPressed = (bits & C.JUMP) && !(p.prevC & C.JUMP);
    if (jumpPressed) p.jbuf = CFG.bufferMs;
    else p.jbuf = Math.max(0, p.jbuf - dt);
    if (p.onG) p.coyote = CFG.coyoteMs; else p.coyote = Math.max(0, p.coyote - dt);
    if (p.jbuf > 0 && p.coyote > 0) {
      p.vy = CFG.jumpVy; p.onG = false; p.coyote = 0; p.jbuf = 0;
    }

    p.vy += CFG.gravity * dts;
    p.x += p.vx * dts; p.y += p.vy * dts;
    p.x = Math.max(g.cam + 30, Math.min(p.x, g.camLock > 0 ? g.camLock - 30 : CFG.worldLen - 30));

    // ground / platforms (incl. bobbing islands — snap while riding them)
    const wasG = p.onG;
    p.onG = false;
    const plat = platformUnder(g, p.x, p.y, p.vy);
    const gy = groundAt(p.x);
    const floor = plat !== null && plat < gy ? plat : gy;
    if (p.y >= floor || (wasG && p.vy >= 0 && Math.abs(p.y - floor) < 30)) { p.y = floor; p.vy = 0; p.onG = true; }
    if (p.y > H + 200) { p.invulnT = 0; hurtPlayer(g, p, 'pit', 99); continue; } // pit spikes: always lethal

    // hidden punji traps: trigger on tread
    for (const tr of g.traps) {
      if (tr.armed && Math.abs(p.x - tr.x) < 26 && p.onG && Math.abs(groundAt(tr.x) - p.y) < 4) {
        tr.armed = false;
        evPush(g, { e: 'trap', x: tr.x });
        evPush(g, { e: 'sfx', n: 'sfx_meow' });
        hurtPlayer(g, p, 'trap', 3); // punji spikes hit HARD but a healthy cat survives
        if (!g.banners.trapHint) { g.banners.trapHint = true; evPush(g, { e: 'hint', k: 'trapHint' }); }
      }
    }

    // weapons
    const firePressed = bits & C.FIRE;
    if (firePressed && p.meleeCd <= 0) {
      // auto-melee if enemy in claw range
      const tgt = g.enemies.find(e2 => e2.st !== 'gone' && e2.k !== 'pow' && hostileTo(g, e2) &&
        (e2.k !== 'boss' || e2.open) && // no clawing armored warship hull
        Math.abs(e2.y - p.y) < 70 && (e2.x - p.x) * p.face > 0 && Math.abs(e2.x - p.x) < CFG.meleeRange);
      if (tgt) {
        p.meleeCd = CFG.meleeCd; p.meleeT = 140;
        tgt.hp -= CFG.meleeDmg;
        evPush(g, { e: 'sfx', n: 'sfx_meow' });
        evPush(g, { e: 'slash', x: tgt.x, y: tgt.y - 40 });
        if (tgt.hp <= 0) { if (tgt.k === 'boss') winBoss(g, tgt); else killEnemy(g, tgt, 0); }
      }
    }
    if (firePressed && g.noFire && !(p.prevC & C.FIRE)) { // the standoff: hammer falls on nothing
      evPush(g, { e: 'sfx', n: 'sfx_click' });
      if (!g.banners.click) { g.banners.click = true; evPush(g, { e: 'banner', k: 'outOfAmmo' }); }
    }
    if (firePressed && p.fireCd <= 0 && p.meleeT <= 0 && !g.noFire) {
      // v11 (Dylan: "if you fire when hes moving it looks like its coming
      // out of nowhere") — the muzzle-flash spawn point below is measured
      // against the STATIC standing pose, but render.js was drawing the
      // run-cycle sheet animation whenever runT>0, which visibly swings the
      // gun/arm to different spots per frame. The flash never moved with it.
      // This flag tells render.js to hold the static forward pose (whose
      // barrel position IS what's measured below) for a brief window
      // whenever a shot just went off, the same way aimUp already forces its
      // own dedicated pose.
      p.fireFlashT = 110;
      // one aiming model for every weapon: up / down-in-air / crouched-low / forward
      const up = p.aimUp, down = p.aimDown;
      // v10.1 fix (Dylan, with a screenshot: the DEFAULT forward-fire case —
      // by far the most common one — was still spawning bullets from the
      // middle of the character's chest, not the actual gatling-gun barrel.
      // The earlier v10 pass only touched the up/down offsets and never
      // re-measured the plain standing/forward pose at all. Pixel-measured
      // hero_us.png (and hero_vc.png, which land on almost the same fractional
      // barrel position despite a totally different gun shape) directly:
      // barrel tip sits at ~99% of sprite width / ~63% of sprite height from
      // the top-left of the drawn quad. At this sprite's actual draw size
      // (w2=102, hgt=107.5 for standing; w2=114, hgt=69 crouched) that's
      // +50/-39.5 standing and +56/-25 crouched from the feet anchor — not
      // the old +34/-58 guess, which put the flash up near the collarbone.
      const mzX = p.x + (up ? p.face * 32 : down ? p.face * 16 : p.face * (p.crouch ? 56 : 50));
      const mzY = down ? p.y - 20 : up ? p.y - 107 : p.crouch ? p.y - 25 : p.y - 39.5;
      const mzAng = up ? -Math.PI / 2 : down ? Math.PI / 2 : (p.face < 0 ? Math.PI : 0);
      const aim = (spd, jit) => up ? [jit, -spd] : down ? [jit, spd] : [p.face * spd, jit];
      if (p.weap === 'raygun') { // stolen alien tech: piercing acid bolt
        p.fireCd = CFG.raygunCd;
        const [vx2, vy2] = aim(CFG.raygunSpd, 0);
        const b2 = fireBullet(g, mzX, mzY, vx2, vy2, 9, 1);
        if (b2) { b2.p = CFG.raygunPierce; b2.lh = -1; }
        if (--p.ammo <= 0) p.weap = 'rifle';
        evPush(g, { e: 'sfx', n: 'sfx_raygun' });
        evPush(g, { e: 'muzzle', x: mzX, y: mzY, up: up ? 1 : 0, f: p.face, ang: mzAng });
      } else if (p.weap === 'flame') { // short-range fire hose
        p.fireCd = CFG.flameCd;
        const [vx2, vy2] = aim(CFG.flameSpd, (g.rng() - 0.5) * 110);
        const b2 = fireBullet(g, mzX, mzY, vx2, vy2, 10, 1);
        if (b2) b2.t = CFG.flameLife;
        if (--p.ammo <= 0) p.weap = 'rifle';
        p.flameSfx = (p.flameSfx || 0) - CFG.flameCd;
        if (p.flameSfx <= 0) { p.flameSfx = 380; evPush(g, { e: 'sfx', n: 'sfx_flame' }); }
      } else {
        const cd = p.weap === 'gatling' ? CFG.gatlingCd : CFG.rifleCd;
        p.fireCd = cd;
        const spd = p.weap === 'gatling' ? CFG.rifleSpd * 1.15 : CFG.rifleSpd;
        const [vx2, vy2] = aim(spd, p.weap === 'gatling' ? (g.rng() - 0.5) * 60 : 0);
        fireBullet(g, mzX, mzY, vx2, vy2, p.weap === 'gatling' ? 2 : 1, 1);
        if (p.weap === 'gatling' && --p.ammo <= 0) { p.weap = 'rifle'; }
        evPush(g, { e: 'sfx', n: 'sfx_shot' });
        evPush(g, { e: 'muzzle', x: mzX, y: mzY, up: up ? 1 : 0, f: p.face, ang: mzAng });
      }
    }
    if ((bits & C.GREN) && !(p.prevC & C.GREN) && p.grenCd <= 0 && p.gren > 0) {
      p.gren--; p.grenCd = CFG.grenadeCd;
      fireBullet(g, p.x + p.face * 20, p.y - 70, p.face * CFG.grenadeVx, CFG.grenadeVy, 3, 1);
    }
    if ((bits & C.CHEESE) && !(p.prevC & C.CHEESE)) {
      if (!g.invasion && g.airSupport === 'ready') { // L before the invasion = the radio
        g.airSupport = 'inbound'; g.airT = 2400;
        evPush(g, { e: 'banner', k: 'airInbound' });
        evPush(g, { e: 'hint', k: 'ctlCrouch' });
        evPush(g, { e: 'music', n: 'music_valkyries' }); // the Valkyries arrive WITH the napalm
      } else if (p.cheeseCd <= 0 && p.cheese > 0) {
        p.cheese--; p.cheeseCd = 500;
        fireBullet(g, p.x + p.face * 20, p.y - 70, p.face * CFG.cheeseVx, CFG.cheeseVy, 4, 1);
        evPush(g, { e: 'sfx', n: 'sfx_meow' });
      }
    }

    // pickups
    for (const pk of g.pickups) {
      if (pk.t > 0 && Math.abs(pk.x - p.x) < 42 && Math.abs(pk.y - (p.y - 40)) < 70) {
        pk.t = 0;
        applyPickup(g, p, pk.kind);
      }
    }
    // POW rescue
    for (const e2 of g.enemies) {
      // Rescue box was 44x80 -- roughly "standing on his exact tile" -- and the
      // camera is monotonic (sim.js: g.cam = Math.max(g.cam, ...)), so the
      // player gets exactly ONE pass at the only outdoor POW in the game with
      // no way to walk back. Any vertical displacement on that single pass
      // loses him silently: there's a platform at x=6600, a pit just before,
      // and -- measured on a real run -- the exam-B UFO tractor beam hauls the
      // player straight up his column, crossing him at dx=1 but dy=286. Tall,
      // narrow box instead: you still have to be on his column, but however
      // you arrive there counts. He's worth a life now, so silently missing
      // him is the worst outcome.
      if (e2.k === 'pow' && e2.st === 'captive' && Math.abs(e2.x - p.x) < 80 && Math.abs(e2.y - p.y) < 320) {
        e2.st = 'freed'; e2.t = 3000; g.pows++; g.score += 500;
        evPush(g, { e: 'banner', k: 'powFreed' });
        evPush(g, { e: 'sfx', n: 'sfx_meow' });
        // The game contains exactly TWO POWs (the outdoor one here and Mittens
        // in the tunnel), so the old `% 5` meant g.pows never hit the multiple
        // and the 'life' pickup -- plus its banner and its sprite -- was dead
        // code. Lives could only ever go down. At `% 2` the second rescue pays
        // a life, which makes optional rescues the one way to extend a run.
        const kind = g.pows % 2 === 0 ? 'life' : 'grenades';
        g.pickups.push({ id: nextId++, x: e2.x + 30, y: e2.y, kind, t: 15000 });
      }
    }
    // tunnel doors: the war goes underground
    if (g.phase === 'play' && !g.fps0 && Math.abs(p.x - LEVEL.fpsDoors.main) < 30 && p.onG) {
      g.fps0 = 'active';
      evPush(g, { e: 'banner', k: 'fpsEnter' });
      evPush(g, { e: 'fps', map: 0 });
    }
    if (g.invasion && !g.fps1 && !g.rideOn && Math.abs(p.x - LEVEL.fpsDoors.nest) < 44 && p.onG) {
      if (!g.nestHintT || g.t - g.nestHintT > 6000) { g.nestHintT = g.t; evPush(g, { e: 'hint', k: 'fpsNest' }); }
      if ((bits & C.DOWN) && !(p.prevC & C.DOWN)) {
        g.fps1 = 'active';
        evPush(g, { e: 'banner', k: 'fpsEnter' });
        evPush(g, { e: 'fps', map: 1 });
      }
    }
    p.prevC = bits;
  }

  // -- camera + sections + waves --
  const ap = alivePlayers(g);
  if (ap.length) {
    const lead = Math.max(...ap.map(p => p.x));
    let target = lead - W * 0.38;
    if (g.camLock > 0) target = Math.min(target, g.camLock - W);
    g.cam = Math.max(g.cam, Math.min(target, CFG.worldLen - W));
  }
  // section banners + checkpoints
  const camMid = g.cam + W * 0.5;
  if (!g.banners.A) { g.banners.A = true; evPush(g, { e: 'banner', k: 'actA' }); }
  if (!g.banners.tunnel && camMid > SEC.tunnel) { g.banners.tunnel = true; g.checkpoint = SEC.tunnel; evPush(g, { e: 'banner', k: 'actTunnel' }); }
  if (!g.standoff && !g.invasion && camMid > SEC.invasion) triggerInvasion(g);
  if (g.invasion && !g.rail1 && !g.rideOn && camMid > 5700) { // ACT — TREELINE BURN
    g.rail1 = 'active';
    evPush(g, { e: 'rail', k: 'skyraider' });
  }
  if (!g.banners.boss && camMid > SEC.boss - 200) startBoss(g);

  for (const w of g.waves) {
    if (g.phase !== 'play') break; // no waves during the opening cinematic
    if (!w.done && g.cam - 300 > w.x) { w.done = true; continue; } // stale wave: passed long ago, skip
    if (!w.done && w.alive.length === 0 && g.cam + W > w.x + 200) {
      // spawn
      for (const [kind, n, where] of w.spawn) {
        for (let i = 0; i < n; i++) {
          let x, y = CFG.groundY;
          if (where === 'tunnel') {
            const t = LEVEL.tunnels.filter(tx => tx > g.cam - 100 && tx < g.cam + W + 300);
            x = t.length ? t[(g.rng() * t.length) | 0] : g.cam + W + 60 + i * 70;
          } else if (where === 'left') x = g.cam - 40 - i * 60;
          else if (where === 'sky') { x = g.cam + W + 120 + i * 200; y = 180 + g.rng() * 120; }
          else x = g.cam + W + 60 + i * 90;
          const e2 = en(kind, x, y);
          if (where === 'tunnel') { e2.st = 'emerge'; e2.t = 600; }
          if (kind === 'heli') { e2.y = 160; e2.vx = -220; }
          // v11 (Dylan: "some should be flying on their own crafts"): a
          // third of ground-spawned aliens hover instead of walking — see
          // the 'flyer' branch in stepEnemy's 'alien' case.
          if (kind === 'alien' && where !== 'tunnel' && g.rng() < 0.35) e2.flyer = true;
          e2.wave = w.x;
          g.enemies.push(e2);
          w.alive.push(e2.id);
        }
      }
      if (w.lock) g.camLock = w.x + W * 0.55 + W * 0.45; // lock right edge ~ trigger + screen
      w.done = true;
      if (w.x === 4800 && !g.banners.ufoHint) {
        g.banners.ufoHint = true;
        evPush(g, { e: 'hint', k: 'ufoHint' });
        evPush(g, { e: 'hint', k: 'ctlAimUp' });
      }
      if (w.x === 6450 && !g.banners.cheeseDrop) { // the cheese MISSION: one supply drop, used with intent
        // Two fixes here. (1) This used to set g.banners.cheeseHint, which is
        // the SAME flag applyPickup tests before firing the "throw it" hint --
        // so the hint could never fire and the whole cheese mechanic shipped
        // untaught. Uses its own cheeseDrop flag now. (2) One cheese spawned
        // BEHIND the player, and the wave's camLock immediately pushes the
        // camera forward, so it was unreachable and simply expired; the player
        // ended up with one cheese, not two. Both spawn ahead now.
        g.banners.cheeseDrop = true;
        const px2 = alivePlayers(g)[0] ? alivePlayers(g)[0].x : g.cam + 300;
        g.pickups.push({ id: nextId++, x: px2 + 70, y: CFG.groundY - 20, kind: 'cheese', t: 60000 });
        g.pickups.push({ id: nextId++, x: px2 + 220, y: CFG.groundY - 20, kind: 'cheese', t: 60000 });
        evPush(g, { e: 'banner', k: 'cheeseMission' });
      }
    }
    if (w.done && w.alive.length) {
      w.alive = w.alive.filter(id => {
        const e2 = g.enemies.find(q => q.id === id);
        return e2 && e2.st !== 'gone';
      });
      if (!w.alive.length && g.camLock > 0 && !g.boss && Math.abs(g.camLock - (w.x + W)) < W) g.camLock = -1;
    }
  }

  // ambient trickle spawns between waves (variance, capped)
  if (g.phase === 'play' && g.enemies.filter(e2 => e2.st !== 'gone' && e2.k !== 'pow' && e2.k !== 'buddy').length < 6 && g.rng() < 0.004 && !g.boss) {
    const kind = g.invasion ? 'alien' : (g.rng() < 0.5 ? 'gruntUS' : 'gruntVC');
    g.enemies.push(en(kind, g.cam + W + 80, CFG.groundY));
  }

  // pinned-down beat -> air support (the L key becomes the radio)
  const pinWave = g.waves.find(w => w.pin);
  if (pinWave && pinWave.done && pinWave.alive.length > 2 && !g.pinned && !g.invasion) {
    g.pinned = true; g.airSupport = 'ready';
    evPush(g, { e: 'banner', k: 'pinned' });
    evPush(g, { e: 'hint', k: 'airHint' });
  }
  // Re-prompt every 6s until they call it -- but only while the L key ACTUALLY
  // calls air support, and only a few times. Without the !g.invasion guard this
  // fired 17 times a run and kept nagging "PRESS L -- CALL IN AIR SUPPORT" long
  // after the invasion flipped L over to throwing cheese, i.e. telling the
  // player to do something the code no longer lets them do.
  if (g.airSupport === 'ready' && g.pinned && !g.invasion && (g.airHints || 0) < 3 &&
      (Math.floor(g.t / 6000) !== Math.floor((g.t - dt) / 6000))) {
    g.airHints = (g.airHints || 0) + 1;
    evPush(g, { e: 'hint', k: 'airHint' });
  }
  if (g.airSupport === 'inbound') {
    g.airT -= dt;
    if (g.airT <= 0) {
      g.airSupport = 'striking';
      g.enemies.push(en('heli', g.cam - 320, 150, { st: 'napalm', side: 'buddy', vx: 470, face: 1, hp: 999 }));
      g.enemies.push(en('heli', g.cam - 620, 186, { st: 'napalm', side: 'buddy', vx: 470, face: 1, hp: 999 }));
    }
  }
  if (g.airSupport === 'striking' && !g.enemies.some(e2 => e2.k === 'heli' && e2.st === 'napalm')) {
    g.airSupport = 'done';
  }

  // invasion beat: duel -> BOTH GUNS CLICK EMPTY -> green flash -> the movie
  if (g.invT) {
    g.invT -= dt;
    if (g.invT <= 0) {
      g.invT = 0; g.clickT = 1700;
      g.noFire = 1; g.duelClick = 1;              // your gun's dry — and so is his
      for (const b of g.bullets) if (b.on) b.on = 0; // the air goes quiet
      evPush(g, { e: 'sfx', n: 'sfx_click' });
    }
  }
  if (g.clickT) {
    g.clickT -= dt;
    if (g.clickT < 900 && !g.banners.theyreOut) { g.banners.theyreOut = true; evPush(g, { e: 'banner', k: 'theyreOutToo' }); evPush(g, { e: 'sfx', n: 'sfx_click' }); }
    if (g.clickT <= 0) {
      g.clickT = 0; g.invT2 = 620;
      g.invasion = true; g.sec = 'B'; g.banners.B = true; // the sky turns WITH the flash
      evPush(g, { e: 'invasion' });
      evPush(g, { e: 'greenflash' });
      evPush(g, { e: 'sfx', n: 'sfx_ufo' });
    }
  }
  if (g.invT2) {
    g.invT2 -= dt;
    if (g.invT2 <= 0) {
      g.invT2 = 0; g.noFire = 0; g.camLock = -1;
      evPush(g, { e: 'cutscene', which: 'truce' });
      evPush(g, { e: 'banner', k: 'truce' });
      evPush(g, { e: 'music', n: 'music_invasion' });
    }
  }
  // boss down -> mount the bike
  if (g.rideT) {
    g.rideT -= dt;
    if (g.rideT <= 0) {
      g.rideT = 0; g.rideOn = true; g.camLock = -1;
      for (const p2 of g.players) { if (p2.st !== 'out') { p2.mode = 'bike'; p2.st = 'alive'; p2.hp = CFG.hpMax; p2.invulnT = 2200; p2.y = CFG.groundY; } }
      evPush(g, { e: 'banner', k: 'actRide' });
      evPush(g, { e: 'hint', k: 'rideHint' });
      evPush(g, { e: 'music', n: 'music_rock' });
      evPush(g, { e: 'engine', on: 1 });
    }
  }
  // act III chase spawner
  if (g.rideOn && !g.over) {
    g.rideSpawnT = (g.rideSpawnT || 0) - dt;
    const live = g.enemies.filter(e2 => e2.st !== 'gone' && e2.k !== 'pow').length;
    if (g.rideSpawnT <= 0 && live < 9) {
      g.rideSpawnT = 850 + g.rng() * 700;
      const r = g.rng();
      if (r < 0.6) g.enemies.push(en('alien', g.cam + W + 90, CFG.groundY, { fast: 1 }));
      else g.enemies.push(en('ufo', g.cam + W + 140, 150 + g.rng() * 110));
    }
  }

  // -- enemies --
  for (const e2 of g.enemies) {
    if (e2.st === 'gone') continue;
    stepEnemy(g, e2, dt, dts);
  }
  g.enemies = g.enemies.filter(e2 => e2.st !== 'gone' || e2.k === 'boss');

  // -- lures decay --
  for (const l of g.lures) l.t -= dt;
  g.lures = g.lures.filter(l => l.t > 0);
  // v13: burning ground. Each patch ticks damage into anything standing in it
  // on a fixed cadence rather than every frame, so walking through costs a
  // predictable amount instead of melting on contact.
  // flame or napalm washing over a cheese cache cooks it as well
  for (const l of g.lures) {
    if (l.t > 0 && g.fires.some(f2 => Math.abs(f2.x - l.x) < 46)) meltCheese(g, l);
  }
  // enemies coated in molten cheese burn down rather than dying on contact
  for (const e2 of g.enemies) {
    if (!e2.molten || e2.st === 'gone') continue;
    e2.molten -= dt;
    e2.mTick = (e2.mTick || 0) - dt;
    if (e2.mTick <= 0) { e2.mTick = 300; e2.hp -= 1; evPush(g, { e: 'cheesecoat', x: e2.x, y: e2.y - 40 }); }
    if (e2.molten <= 0 || e2.hp <= 0) { e2.molten = 0; if (e2.st !== 'gone') killEnemy(g, e2, 1); }
  }
  for (const f of g.fires) {
    f.t -= dt; f.tick -= dt;
    if (f.tick <= 0) {
      f.tick = 260;
      for (const e2 of g.enemies) {
        if (e2.st === 'gone' || e2.k === 'pow' || e2.k === 'buddy' || !hostileTo(g, e2)) continue;
        if (e2.k === 'boss') continue; // the mothership does not care about a grass fire
        if (Math.abs(e2.x - f.x) < 40 && Math.abs(e2.y - f.y) < 96) {
          e2.hp -= 1;
          evPush(g, { e: 'hit', x: e2.x, y: e2.y - 40 });
          if (e2.hp <= 0) killEnemy(g, e2, 0);
        }
      }
    }
  }
  g.fires = g.fires.filter(f => f.t > 0);
  // -- pickups decay --
  for (const pk of g.pickups) if (pk.t > 0) pk.t -= dt;
  g.pickups = g.pickups.filter(pk => pk.t > 0);

  // -- bullets --
  for (const b of g.bullets) {
    if (!b.on) continue;
    b.t -= dt;
    if (b.k === 3 || b.k === 4 || b.k === 5) b.vy += CFG.gravity * 0.8 * dts; // grenade / cheese / gouda arc
    if (b.k === 8) b.vy += CFG.gravity * 0.9 * dts; // shrapnel arcs down onto heads
    b.x += b.vx * dts; b.y += b.vy * dts;
    const gy = groundAt(b.x);
    if (b.t <= 0) { // grenades ALWAYS pay off — even airborne timeouts detonate
      if (b.k === 3) explode(g, b.x, b.y, 1);
      b.on = 0; continue;
    }
    if (b.x < g.cam - 80 || b.x > g.cam + W + 400) { b.on = 0; continue; }
    if (b.y >= gy - 2) {
      if (b.k === 3) { explode(g, b.x, gy - 10, 1); b.on = 0; continue; }
      if (b.k === 4) { g.lures.push({ id: nextId++, x: b.x, y: gy - 14, t: CFG.cheeseLife }); b.on = 0; continue; }
      if (b.k === 5) { explode(g, b.x, gy - 10, 0); b.on = 0; continue; }
      // v13 (Dylan: "make them leave flaming residue"). Flame hitting dirt used
      // to just vanish. Now it drops a burning patch that keeps damaging what
      // walks through it, so the flamethrower paints ground rather than only
      // hosing air. Rate-limited by proximity so a held trigger lays a
      // continuous strip instead of stacking 20 patches on one pixel.
      if (b.k === 10) {
        const near = g.fires.find(f => Math.abs(f.x - b.x) < 34);
        if (near) { near.t = Math.max(near.t, 2600); }
        else if (g.fires.length < 26) { g.fires.push({ id: nextId++, x: b.x, y: gy - 6, t: 2600, tick: 0 }); }
        b.on = 0; continue;
      }
      if (b.y > gy + 8) { b.on = 0; continue; }
    }
    if (b.from === 1 || b.from === 9 || b.from === 8) { // player (1), allied grunts (9), squad buddy (8)
      if (b.k === 4) continue; // cheese sails over everyone's heads
      // Crates take BULLETS, not just explosions. Until this existed, explode()
      // was the only thing that ever touched g.crates, so every crate in the
      // game required a grenade -- and a full playthrough ends with all five
      // still standing. That gated BOTH the only flamethrower in the game
      // (x=4350) and BOTH tuna crates, which are the only healing that exists,
      // so a player who never lobbed a grenade at a wooden box had no heals at
      // all. Grenades still work and still pop several at once.
      if (b.from === 1 && b.k !== 3) {
        let hitCrate = false;
        for (const cr of g.crates) {
          if (cr.hp > 0 && Math.abs(b.x - cr.x) < 26 && b.y > CFG.groundY - 74 && b.y < CFG.groundY + 6) {
            cr.hp = 0;
            g.pickups.push({ id: nextId++, x: cr.x, y: CFG.groundY - 20, kind: cr.kind, t: 15000 });
            evPush(g, { e: 'hit', x: b.x, y: b.y });
            evPush(g, { e: 'sfx', n: 'sfx_shrapnel' });
            b.on = 0; hitCrate = true; break;
          }
        }
        if (hitCrate) continue;
      }
      for (const e2 of g.enemies) {
        if (e2.st === 'gone' || e2.k === 'pow' || e2.k === 'buddy' || e2.st === 'drag' || !hostileTo(g, e2)) continue;
        if (b.from === 9 && e2.side !== 'alien') continue; // allies only strafe aliens
        if (e2.k === 'boss' && !e2.open) { // armored unless the hatch is open
          if (Math.abs(b.x - e2.x) < 260 && Math.abs(b.y - (e2.y - 170)) < 190) { b.on = 0; break; }
          continue;
        }
        const rw = e2.k === 'boss' ? 85 : e2.k === 'heli' ? 110 : e2.k === 'ufo' ? 54 : 34;
        const rh = e2.k === 'boss' ? 135 : e2.k === 'heli' ? 60 : e2.k === 'ufo' ? 34 : 78; // jump-shots + up-shots both reach the hatch
        const cy = e2.k === 'boss' ? e2.y - 170 : e2.y - rh / 2;
        if (Math.abs(b.x - e2.x) < rw && Math.abs(b.y - cy) < rh) {
          if (b.k === 3) { // grenade on direct contact DETONATES — no more sad plinks
            explode(g, b.x, b.y, 1);
            b.on = 0; break;
          }
          const dmg = b.k === 9 ? CFG.raygunDmg : 1;
          if (b.k === 9) { // stolen ray gun: pierces through the line
            if (b.lh === e2.id) continue;
            b.lh = e2.id;
            e2.hp -= dmg;
            evPush(g, { e: 'hit', x: b.x, y: b.y });
            if (e2.hp <= 0) {
              if (e2.k === 'boss') winBoss(g, e2); else killEnemy(g, e2, e2.k === 'heli' || e2.k === 'ufo');
            }
            if (--b.p <= 0) { b.on = 0; break; }
            continue;
          }
          b.on = 0;
          e2.hp -= dmg;
          evPush(g, { e: 'hit', x: b.x, y: b.y });
          if (e2.hp <= 0) {
            if (e2.k === 'boss') winBoss(g, e2); else killEnemy(g, e2, e2.k === 'heli' || e2.k === 'ufo');
          }
          break;
        }
      }
    } else { // enemy shot
      for (const p of g.players) {
        if (p.st !== 'alive' || p.invulnT > 0) continue;
        const hw = 20 * CFG.hitboxScale * 2;
        const hh = CFG.heroH * CFG.hitboxScale * (p.crouch ? 0.55 : 1); // crouching ducks under fire
        const cy2 = p.y - CFG.heroH * (p.crouch ? 0.28 : 0.5);
        if (Math.abs(b.x - p.x) < hw && Math.abs(b.y - cy2) < hh) {
          b.on = 0; hurtPlayer(g, p, 'shot'); break;
        }
      }
      if (b.on && g.invasion) { // alien fire also cuts down allied cat grunts (both armies bleed on screen)
        for (const e3 of g.enemies) {
          if (e3.st === 'gone' || e3.st === 'drag' || (e3.k !== 'gruntUS' && e3.k !== 'gruntVC')) continue;
          if (Math.abs(b.x - e3.x) < 26 && Math.abs(b.y - (e3.y - 45)) < 52) {
            b.on = 0; e3.hp--;
            if (e3.hp <= 0) {
              e3.st = 'gone';
              evPush(g, { e: 'blood', x: e3.x, y: e3.y - 40, big: 0 });
            }
            break;
          }
        }
      }
      if (b.on) { // squad buddy can take the hit too
        for (const e3 of g.enemies) {
          if (e3.k !== 'buddy' || e3.st === 'gone') continue;
          if (Math.abs(b.x - e3.x) < 24 && Math.abs(b.y - (e3.y - 46)) < 56) {
            b.on = 0; e3.hp--;
            evPush(g, { e: 'hit', x: b.x, y: b.y });
            if (e3.hp <= 0) {
              e3.st = 'gone';
              evPush(g, { e: 'blood', x: e3.x, y: e3.y - 40, big: 1 });
              evPush(g, { e: 'banner', k: 'buddyDown' });
              evPush(g, { e: 'sfx', n: 'sfx_meow' });
            }
            break;
          }
        }
      }
    }
  }

  // act III finish line -> Act III part two: the road home is a river, then
  // an ocean (v11: wired up — game/boat.js's PTBoat/Surf existed complete on
  // disk since v8 but were never reachable; see the v11 changelog entry for
  // why). Bike ride ends here, but instead of jumping straight to the evac
  // timer this now hands off to the PT-boat rail section (main.js chains
  // PTBoat -> Surf -> back here once both are clear).
  if (g.rideOn && !g.over && !g.heliEvac && !g.riverStarted) {
    const lead = alivePlayers(g)[0];
    if (lead && lead.x >= CFG.sections.rideEnd) {
      g.riverStarted = true;
      evPush(g, { e: 'engine', on: 0 });
      evPush(g, { e: 'rail', k: 'ptboat' });
    }
  }
  // victory sequence: evac after the river/surf rails clear (main.js sets
  // g.heliEvac once Surf reports done — see the 'rail' done-handling there)
  if (g.heliEvac) {
    g.heliEvac.t -= dt;
    if (g.heliEvac.t <= 0 && !g.over && !g.parleyStarted) {
      // v11: Act IV — the LZ ambush (game/boss2.js's ParleyBoss, same story
      // as the boat rails: complete on disk since v9, never reachable). The
      // chopper's about to land and Chancellor Grimtail crashes the evac.
      // Real victory now only fires once that fight is won — main.js's
      // 'rail' done-handling declares it directly for a won, non-dead
      // ParleyBoss, the same way it already does g.score/endGame(false) for
      // the other rail sections.
      g.parleyStarted = true;
      g.heliEvac = null;
      evPush(g, { e: 'rail', k: 'parley' });
    }
  }
}

function hostileTo(g, e2) {
  if (e2.side === 'alien') return true;
  if (e2.side === 'pow' || e2.side === 'buddy') return false; // friendlies, never targets
  return !g.invasion; // cat grunts become allies post-invasion
}

function applyPickup(g, p, kind) {
  if (kind === 'gatling') { p.weap = 'gatling'; p.ammo = CFG.gatlingAmmo; evPush(g, { e: 'banner', k: 'gotGatling' }); }
  else if (kind === 'raygun') { p.weap = 'raygun'; p.ammo = CFG.raygunAmmo; evPush(g, { e: 'banner', k: 'gotRaygun' }); evPush(g, { e: 'sfx', n: 'sfx_raygun' }); }
  else if (kind === 'flame') { p.weap = 'flame'; p.ammo = CFG.flameAmmo; evPush(g, { e: 'banner', k: 'gotFlame' }); evPush(g, { e: 'sfx', n: 'sfx_flame' }); }
  // Was +100 here and a second, unreachable `else if (kind === 'tuna')` below
  // that added +300 -- dead because this branch returns first. Folded the
  // intended total into the one live branch.
  else if (kind === 'tuna') { p.hp = Math.min(CFG.hpMax, p.hp + 2); g.score += 400; evPush(g, { e: 'banner', k: 'gotHealth' }); evPush(g, { e: 'sfx', n: 'sfx_purr' }); return; }
  else if (kind === 'grenades') { p.gren += 3; evPush(g, { e: 'banner', k: 'gotGrenades' }); }
  else if (kind === 'cheese') {
    p.cheese += 1; evPush(g, { e: 'banner', k: 'gotCheese' });
    if (!g.banners.cheeseHint && g.invasion) { g.banners.cheeseHint = true; evPush(g, { e: 'hint', k: 'cheeseHint' }); }
  }
  else if (kind === 'life') { p.lives++; evPush(g, { e: 'banner', k: 'gotLife' }); }
  evPush(g, { e: 'sfx', n: 'sfx_meow' });
}

// v13 (Dylan: "you either poison or blow up their cheese that they're stealing"
// and "show a rat alien burning to death being covered in molten cheese").
// A cheese cache caught in a blast or a flame doesn't just vanish -- it goes up,
// throwing MOLTEN cheese over everything nearby. Rats caught in the splash are
// coated and burn down rather than dying instantly, which is the beat he asked
// for. Reuses the v13 fire system so the ground keeps burning too.
function meltCheese(g, l) {
  l.t = 0;
  evPush(g, { e: 'boom', x: l.x, y: l.y, big: 1 });
  evPush(g, { e: 'cheesemelt', x: l.x, y: l.y });
  evPush(g, { e: 'sfx', n: 'sfx_explosion' });
  evPush(g, { e: 'shake', m: CFG.shakeBoom });
  for (let q = -1; q <= 1; q++) {
    const fx2 = l.x + q * 40;
    if (g.fires.length < 40) g.fires.push({ id: nextId++, x: fx2, y: groundAt(fx2) - 6, t: 4200, tick: 0, big: 1, cheese: 1 });
  }
  for (const e2 of g.enemies) {
    if (e2.st === 'gone' || e2.k === 'pow' || e2.k === 'buddy' || !hostileTo(g, e2)) continue;
    if (Math.abs(e2.x - l.x) < CFG.cheeseRadius && Math.abs(e2.y - l.y) < 140) {
      // coated: burns down over ~1.6s instead of popping instantly
      e2.molten = 1600;
      evPush(g, { e: 'cheesecoat', x: e2.x, y: e2.y - 40 });
    }
  }
  g.cheeseDestroyed = (g.cheeseDestroyed || 0) + 1;
  g.score += 400;
  evPush(g, { e: 'banner', k: 'cheeseBurned' });
}

function explode(g, x, y, fromPlayer) {
  // any blast within reach of a cheese cache cooks it
  for (const l of g.lures) {
    if (l.t > 0 && Math.abs(l.x - x) < CFG.grenadeRadius && Math.abs(l.y - y) < 200) meltCheese(g, l);
  }
  evPush(g, { e: 'boom', x, y, big: fromPlayer ? 2 : 1 });
  evPush(g, { e: 'sfx', n: 'sfx_explosion' });
  evPush(g, { e: 'shake', m: CFG.shakeBoom + (fromPlayer ? 3 : 0) });
  if (fromPlayer) {
    const R = CFG.grenadeRadius; // as big as it LOOKS
    for (const e2 of g.enemies) {
      if (e2.st === 'gone' || e2.k === 'pow' || !hostileTo(g, e2)) continue;
      if (e2.k === 'boss') {
        // a blast under the open hatch rides the shockwave up into the core
        // 6 meant 53 grenades to kill a 320hp boss while carrying 5 -- the
        // "ride the shockwave into the core" line existed but could never
        // actually be the play. At 30 against 140hp it's five well-placed
        // grenades, so timing the open hatch is a genuine alternative to
        // parking under the hull and holding fire.
        if (e2.open && Math.abs(x - e2.x) < 210 && Math.abs(y - (e2.y - 170)) < 340) {
          e2.hp -= 30; if (e2.hp <= 0) winBoss(g, e2);
        }
        continue;
      }
      if (Math.abs(e2.x - x) < R && Math.abs(e2.y - y) < R) {
        e2.hp -= 6; if (e2.hp <= 0) killEnemy(g, e2, 1);
      }
    }
    for (const cr of g.crates) {
      if (cr.hp > 0 && Math.abs(cr.x - x) < R) { cr.hp = 0; g.pickups.push({ id: nextId++, x: cr.x, y: CFG.groundY - 20, kind: cr.kind, t: 15000 }); }
    }
    // shrapnel fan: flat, fast fragments that tag whoever thought they were safe
    for (let i = 0; i < CFG.shrapnelN; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const vx2 = dir * CFG.shrapnelSpd * (0.55 + g.rng() * 0.65);
      const vy2 = -(40 + g.rng() * 240); // low arcs that rain back down
      const b2 = fireBullet(g, x, y - 14, vx2, vy2, 8, 1);
      if (b2) b2.t = CFG.shrapnelLife + g.rng() * 260;
    }
    evPush(g, { e: 'sfx', n: 'sfx_shrapnel' });
  } else {
    for (const p of g.players) {
      if (p.st === 'alive' && p.invulnT <= 0 && Math.abs(p.x - x) < 90 && Math.abs(p.y - y) < 110) hurtPlayer(g, p, 'boom', 2);
    }
  }
}

function triggerInvasion(g) {
  // NO aliens yet. A lone VC cat duels you, both guns run dry, THEN the sky
  // flashes green and we cut into the film. Aliens only exist after the movie.
  g.standoff = 1; g.checkpoint = SEC.invasion;
  g.camLock = g.cam + W; // hold the shot for the duel
  const cx = g.cam;
  const duel = en('gruntVC', cx + 940, CFG.groundY, { face: -1 });
  duel.duel = 1; duel.hp = 999; // he survives the exchange — he's Charlie
  g.enemies.push(duel);
  g.invT = 2600; // exchange fire for a beat
}

export function spawnTunnelSkirmish(g, x0) {
  // fresh out of the tunnel, blinking in the light — a few more VC to drop
  for (let i = 0; i < 3; i++) {
    g.enemies.push(en('gruntVC', x0 + 260 + i * 130 + (g.rng() * 50), CFG.groundY, { face: -1 }));
  }
}

function startBoss(g) {
  g.banners.boss = true; g.checkpoint = SEC.boss; g.camLock = SEC.boss + W;
  const b = en('boss', SEC.boss + W * 0.72, -120); // descends to hover — a warship, not a beached whale
  g.boss = b; g.enemies.push(b);
  evPush(g, { e: 'banner', k: 'bossWarning' });
  evPush(g, { e: 'sfx', n: 'sfx_ufo' });
  evPush(g, { e: 'hum', on: 1 });
}

function winBoss(g, b) {
  b.st = 'gone'; g.boss = null; g.bossDone = true; g.score += 5000;
  for (let i = 0; i < 6; i++) evPush(g, { e: 'boom', x: b.x - 120 + i * 48, y: b.y - 320 + (i % 3) * 100, big: 1 });
  evPush(g, { e: 'sfx', n: 'sfx_explosion' });
  evPush(g, { e: 'shake', m: 14 });
  evPush(g, { e: 'hum', on: 0 });
  g.rideT = 2600; // the road home: mount up
}

function stepEnemy(g, e2, dt, dts) {
  e2.t -= dt; e2.fireCd -= dt;
  const ap = alivePlayers(g);
  const near = (x) => ap.length ? ap.reduce((a, p) => Math.abs(p.x - x) < Math.abs(a.x - x) ? p : a) : null;

  switch (e2.k) {
    case 'pow': {
      if (e2.st === 'freed') { e2.x += 60 * dts; if (e2.t <= 0) e2.st = 'gone'; }
      return;
    }
    case 'gruntUS': case 'gruntVC': {
      if (e2.st === 'drag') { // hauling Pvt. Mittens to the tunnel
        e2.x += 175 * dts; e2.face = 1;
        if (e2.x >= 920) e2.st = 'gone';
        return;
      }
      if (e2.st === 'emerge') { if (e2.t <= 0) e2.st = 'walk'; return; }
      if (e2.duel) { // the standoff duelist: fires until dry, then just stares
        const p0 = near(e2.x);
        if (p0) e2.face = p0.x > e2.x ? 1 : -1;
        if (g.duelClick || g.invasion) { e2.tell = 0; return; } // out of ammo / now an ally
        if (e2.fireCd <= 0 && !e2.tell) e2.tell = CFG.aimTellMs;
        if (e2.tell > 0) {
          e2.tell -= dt;
          if (e2.tell <= 0) {
            e2.tell = 0; e2.fireCd = CFG.gruntFireCd * 0.8 + (g.rng() * 400);
            fireBullet(g, e2.x + e2.face * 26, e2.y - 52, e2.face * CFG.gruntBulletSpd, 0, 1, 0);
            evPush(g, { e: 'muzzle', x: e2.x + e2.face * 28, y: e2.y - 52, up: 0, f: e2.face });
            evPush(g, { e: 'sfx', n: 'sfx_shot' });
          }
        }
        return;
      }
      // target: pre-invasion players + rival grunts; post-invasion aliens
      let tx = null, shootPlayer = !g.invasion;
      if (g.invasion) {
        const al = g.enemies.find(q => q.side === 'alien' && q.st !== 'gone' && Math.abs(q.x - e2.x) < 600);
        if (al) tx = al.x; else { e2.st = 'gone'; return; } // allies fall back off-screen when no targets
      } else {
        const rival = g.enemies.find(q => q.st !== 'gone' && (q.k === 'gruntUS' || q.k === 'gruntVC') && q.side !== e2.side && Math.abs(q.x - e2.x) < 500);
        const p = near(e2.x);
        // crossfire chaos: 60% hunt players, else rival grunts
        tx = p && (!rival || (e2.id % 5) < 3) ? p.x : (rival ? rival.x : (p ? p.x : null));
      }
      if (tx === null) return;
      e2.face = tx > e2.x ? 1 : -1;
      const dist = Math.abs(tx - e2.x);
      if (dist > 240 && !e2.tell) e2.x += e2.face * CFG.gruntSpd * dts;
      else if (e2.fireCd <= 0 && !e2.tell) e2.tell = CFG.aimTellMs; // visible aim-up before the shot
      if (e2.tell > 0) {
        e2.tell -= dt;
        if (e2.tell <= 0) {
          e2.tell = 0;
          e2.fireCd = CFG.gruntFireCd + (g.rng() * 500);
          fireBullet(g, e2.x + e2.face * 26, e2.y - 52, e2.face * CFG.gruntBulletSpd, 0, 1, shootPlayer ? 0 : 9);
          evPush(g, { e: 'muzzle', x: e2.x + e2.face * 28, y: e2.y - 52, up: 0, f: e2.face });
          evPush(g, { e: 'sfx', n: 'sfx_shot' });
        }
      }
      e2.y = groundAt(e2.x) === CFG.groundY ? CFG.groundY : e2.y; // grunts don't fall in pits (path around)
      return;
    }
    case 'alien': {
      if (e2.st === 'beam') { // beaming down from the saucers, live on screen
        e2.y += 300 * dts;
        const gy2 = groundAt(e2.x);
        if (e2.y >= gy2) { e2.y = gy2; e2.st = 'walk'; e2.beam = 0; evPush(g, { e: 'boom', x: e2.x, y: e2.y - 10, big: 0 }); }
        return;
      }
      // lure override: cheese is irresistible
      const lure = g.lures.find(l => Math.abs(l.x - e2.x) < CFG.cheeseRadius * 2);
      // targets: player cats AND (post-truce) allied grunt cats — both armies bleed
      let p = near(e2.x);
      if (g.invasion) {
        for (const q of g.enemies) {
          if ((q.k === 'gruntUS' || q.k === 'gruntVC') && q.st !== 'gone' && q.st !== 'drag' &&
              Math.abs(q.x - e2.x) < 700 && // only nearby cats — no cross-map wandering
              (!p || Math.abs(q.x - e2.x) < Math.abs(p.x - e2.x))) p = q;
        }
      }
      const tx = lure ? lure.x : (p ? p.x : null);
      if (tx === null) return;
      e2.face = tx > e2.x ? 1 : -1;
      const dist = Math.abs(tx - e2.x);
      const speed = (lure ? CFG.alienSpd * 1.8 : CFG.alienSpd) * (e2.fast ? 3.2 : 1);
      // v11 (Dylan: "the rats aren't formidable enemies, theyre barely firing
      // back"): the old 260px firing range meant a ranged player (gatling,
      // rifle, raygun — all much longer reach) killed most of these before
      // they ever got close enough to shoot back at all. Pushed way out so
      // they open fire from well offscreen-adjacent range, same as a real
      // threat, and fire noticeably more often once engaged.
      const FIRE_RANGE = e2.flyer ? 900 : 620;
      if (dist > (lure ? 20 : FIRE_RANGE)) e2.x += e2.face * speed * dts;
      else if (lure) { /* nibbling — helpless */ }
      else if (e2.fireCd <= 0 && !e2.tell) e2.tell = CFG.aimTellMs; // charging coils glow first
      if (e2.tell > 0 && !lure) {
        e2.tell -= dt;
        if (e2.tell <= 0) {
          e2.tell = 0;
          e2.fireCd = CFG.alienFireCd * 0.65 + g.rng() * 350;
          const py = p ? p.y - 50 : e2.y - 50;
          const dy = (py - (e2.y - 46)) * 0.8;
          fireBullet(g, e2.x + e2.face * 24, e2.y - 46, e2.face * CFG.rayBulletSpd, dy, 6, 0);
          evPush(g, { e: 'sfx', n: 'sfx_laser' });
        }
      }
      // v11: flying variant — "some should be flying on their own crafts"
      // (Dylan). Hovers at altitude on a little grav-platform instead of
      // walking the ground, otherwise the exact same fire logic above.
      if (e2.flyer) {
        e2.hoverY = e2.hoverY || (180 + (e2.id % 5) * 26);
        e2.y = e2.hoverY + Math.sin(g.t / 500 + e2.id) * 16;
        return;
      }
      // zigzag hop
      if (e2.t <= 0) { e2.t = 900 + g.rng() * 600; e2.vy = -260; }
      e2.vy += CFG.gravity * 0.7 * dts; e2.y += e2.vy * dts;
      const gy = groundAt(e2.x);
      if (e2.y >= gy) { e2.y = gy; e2.vy = 0; }
      if (e2.y > H + 150) { e2.st = 'gone'; }
      return;
    }
    case 'ufo': {
      const p = near(e2.x);
      const tx = p ? p.x : e2.x - 100;
      e2.x += Math.sign(tx - e2.x) * Math.min(120, Math.abs(tx - e2.x)) * dts;
      e2.y = CFG.ufoHover + Math.sin(g.t / 400 + e2.id) * 26;
      // tractor beam when overhead
      if (p && Math.abs(p.x - e2.x) < 46 && p.st === 'alive') {
        p.vy -= (CFG.gravity + CFG.ufoPull) * dts; // net upward pull
        if (p.y < e2.y + 60) { hurtPlayer(g, p, 'abduct', 2); if (p.st === 'alive') { p.vy = 380; } } // chewed on and dropped
        e2.beam = 1;
      } else e2.beam = 0;
      return;
    }
    case 'heli': {
      if (e2.st === 'insert') return; // flown by the opening script
      if (e2.st === 'napalm') {       // friendly air support sweep
        e2.x += e2.vx * dts;
        e2.y = 150 + Math.sin(g.t / 240 + e2.id) * 10;
        e2.nT = (e2.nT || 0) - dt;
        if (e2.nT <= 0 && e2.x > g.cam - 60) {
          e2.nT = 320;
          const bx = e2.x - 50, by = groundAt(bx) - 14;
          explode(g, bx, by, 1);
          // v13 (Dylan: "do similar, new fire animation with the napalm").
          // Napalm previously produced one blast and nothing else -- the whole
          // point of napalm is that the ground KEEPS burning. Each canister now
          // lays a wide, long-lived burning patch that damages anything walking
          // through it, reusing the same fire system the flamethrower feeds.
          // Longer and wider than flamethrower residue: this is a wall of fire.
          for (let q = -1; q <= 1; q++) {
            const fx2 = bx + q * 46;
            const near = g.fires.find(f2 => Math.abs(f2.x - fx2) < 30);
            if (near) near.t = Math.max(near.t, 5200);
            else if (g.fires.length < 40) g.fires.push({ id: nextId++, x: fx2, y: groundAt(fx2) - 6, t: 5200, tick: 0, big: 1 });
          }
        }
        if (e2.x > g.cam + W + 480) e2.st = 'gone';
        return;
      }
      // hostile strafing pass (unused in the current script, kept for later acts)
      e2.x += e2.vx * dts;
      e2.y = 160 + Math.sin(g.t / 300) * 12;
      if (e2.fireCd <= 0) {
        e2.fireCd = 260;
        fireBullet(g, e2.x, e2.y + 40, -60, 480, 1, 0);
      }
      if (e2.x < g.cam - 300) { e2.vx = 240; }
      if (e2.vx > 0 && e2.x > g.cam + W + 320) { e2.vx = -220; }
      return;
    }
    case 'buddy': {
      const p = near(e2.x);
      if (!p) return;
      // catch-up teleport if left far behind (companion convention)
      if (Math.abs(p.x - e2.x) > 760) { e2.x = p.x - 90; }
      const tx = p.x - 64 - (e2.sq || 0) * 34;
      if (Math.abs(tx - e2.x) > 26) {
        const dir = tx > e2.x ? 1 : -1;
        const nx = e2.x + dir * 185 * dts;
        if (groundAt(nx) === CFG.groundY) { e2.x = nx; e2.face = dir; e2.moving = 1; } else e2.moving = 0;
      } else e2.moving = 0;
      const foe = g.enemies.find(q => q.st !== 'gone' && q.k !== 'pow' && q.k !== 'buddy' && q.st !== 'drag' && hostileTo(g, q) &&
        Math.abs(q.x - e2.x) < 520 && Math.abs(q.y - e2.y) < 220);
      if (foe) {
        e2.face = foe.x > e2.x ? 1 : -1;
        if (e2.fireCd <= 0) {
          e2.fireCd = 950 + g.rng() * 300;
          fireBullet(g, e2.x + e2.face * 26, e2.y - 52, e2.face * CFG.gruntBulletSpd, 0, 1, 8);
          evPush(g, { e: 'muzzle', x: e2.x + e2.face * 28, y: e2.y - 52, up: 0, f: e2.face });
          evPush(g, { e: 'sfx', n: 'sfx_shot' });
        }
      }
      return;
    }
    case 'boss': {
      stepBoss(g, e2, dt, dts);
      return;
    }
  }
}

function stepBoss(g, b, dt, dts) {
  const arena = CFG.sections.boss;
  const hoverY = CFG.groundY - 130; // ship bottom hovers well above the dirt
  if (b.st === 'enter') {
    b.y = Math.min(b.y + 150 * dts, hoverY);
    if (b.y >= hoverY) { b.st = 'idle'; b.atkT = 1600; }
    return;
  }
  b.ph = b.hp > CFG.bossHp * 0.66 ? 1 : b.hp > CFG.bossHp * 0.33 ? 2 : 3;
  b.x = arena + W * 0.72 + Math.sin(g.t / 900) * 40;
  b.y = hoverY + Math.sin(g.t / 620) * 14;
  b.atkT -= dt;
  if (b.open > 0) { b.open -= dt; }
  if (b.atkT <= 0) {
    b.open = 2400; // the hull hatch irises open while it attacks — that's your window
    if (!g.banners.core) { g.banners.core = true; evPush(g, { e: 'banner', k: 'coreExposed' }); }
    const ap = alivePlayers(g);
    const p = ap.length ? ap[(g.rng() * ap.length) | 0] : null;
    if (b.ph === 1) { // death ray sweep: telegraphed vertical beam
      b.atkT = 3400 - 300;
      evPush(g, { e: 'ray', x: p ? p.x : b.x - 300 });
      evPush(g, { e: 'sfx', n: 'sfx_laser' });
      const rx = p ? p.x : b.x - 300;
      fireBullet(g, rx, -40, 0, 900, 7, 0);
    } else if (b.ph === 2) { // tractor + drop troopers
      b.atkT = 3800;
      evPush(g, { e: 'sfx', n: 'sfx_ufo' });
      for (let i = 0; i < 2; i++) {
        const e2 = en('alien', b.x - 160 - i * 90, 120);
        e2.vy = 30; g.enemies.push(e2);
      }
    } else { // gouda cannon volley (explosive shells — no snacks left behind)
      b.atkT = 3000;
      evPush(g, { e: 'sfx', n: 'sfx_explosion' });
      for (let i = 0; i < 3; i++) {
        fireBullet(g, b.x - 60, b.y - 200, -(220 + i * 120 + g.rng() * 80), -350 - g.rng() * 120, 5, 0);
      }
    }
  }
}

// ---------- snapshots ----------
const R = (n) => Math.round(n);
export function serialize(g) {
  return {
    t: R(g.t), cam: R(g.cam), sec: g.sec, inv: g.invasion ? 1 : 0,
    over: g.over ? 1 : 0, won: g.won ? 1 : 0,
    score: g.score, pows: g.pows,
    pl: g.players.map(p => [p.pid, p.hero, R(p.x), R(p.y), p.face, p.st, p.lives, p.weap, p.ammo, p.gren, p.cheese, R(p.invulnT), p.aimUp ? 1 : 0, R(p.runT), p.deaths, p.hp, p.crouch ? 1 : 0, p.mode === 'bike' ? 1 : 0, p.fireFlashT > 0 ? 1 : 0,
      // v13 index 19: death cause. deathKind was set on the player but never
      // serialized, so the renderer could not tell a punji-spike death from any
      // other and played the same spin-and-fall ragdoll for all of them.
      p.st === 'dead' ? (p.deathKind === 'trap' ? 1 : p.deathKind === 'pit' ? 2 : 0) : 0,
      R(p.respT)]),
    en: g.enemies.filter(e2 => e2.st !== 'gone' && e2.x > g.cam - 200 && e2.x < g.cam + W + 400)
      .map(e2 => [e2.id, e2.k, R(e2.x), R(e2.y), e2.face, e2.st, e2.hp, (e2.beam || e2.tell > 0) ? 1 : 0, e2.open > 0 ? 1 : 0, e2.ph || 0, e2.flyer ? 1 : 0]),
    // v13: index 4 is the bullet's travel angle. Every projectile used to be
    // drawn as an axis-aligned horizontal dash regardless of where it was
    // actually going, so firing up (hold W) sent horizontal tracers climbing
    // the screen sideways -- Dylan caught this in a screenshot. The renderer
    // needs the velocity direction, and the wire format only carried x/y/kind,
    // so the angle is computed here (rounded to 1/100 rad, ~0.6 deg, which is
    // finer than a 4px-tall dash can show) rather than shipping two more floats.
    bl: g.bullets.filter(b => b.on).map(b => [R(b.x), R(b.y), b.k, b.from, Math.round(Math.atan2(b.vy, b.vx) * 100) / 100,
      // v13 index 5: normalised age 0..1, only meaningful for flame (k=10).
      // The renderer grows and cools each tongue of flame over its life so it
      // dissolves instead of ending on a hard edge.
      b.k === 10 ? Math.round((1 - Math.max(0, Math.min(1, b.t / CFG.flameLife))) * 100) / 100 : 0]),
    pk: g.pickups.map(pk => [R(pk.x), R(pk.y), pk.kind]),
    lu: g.lures.map(l => [R(l.x), R(l.y)]),
    fi: g.fires.map(f => [R(f.x), R(f.y), R(f.t), f.big ? 1 : 0]),
    tr: g.traps.map(t2 => t2.armed ? 1 : 0),
    cr: g.crates.map(c2 => c2.hp),
    boss: g.boss ? { hp: g.boss.hp, max: CFG.bossHp } : null,
  };
}

// Full state save for host refresh resume (superset; sim-restorable)
export function checkpointState(g) {
  return {
    seed: g.seed, t: g.t, cam: g.cam, camLock: g.camLock, sec: g.sec, invasion: g.invasion,
    score: g.score, pows: g.pows, checkpoint: g.checkpoint,
    players: g.players, enemies: g.enemies.filter(e2 => e2.st !== 'gone'),
    pickups: g.pickups, lures: g.lures, fires: g.fires,
    waves: g.waves.map(w2 => ({ x: w2.x, done: w2.done, alive: w2.alive })),
    traps: g.traps, crates: g.crates, bossDone: g.bossDone,
    banners: g.banners,
  };
}
export function restoreState(snap, seats) {
  const g = makeGame(snap.seed, seats);
  Object.assign(g, {
    t: snap.t, cam: snap.cam, camLock: snap.camLock, sec: snap.sec, invasion: snap.invasion,
    score: snap.score, pows: snap.pows, checkpoint: snap.checkpoint,
    pickups: snap.pickups || [], lures: snap.lures || [], fires: snap.fires || [],
    traps: snap.traps, crates: snap.crates, bossDone: snap.bossDone, banners: snap.banners,
  });
  g.enemies = (snap.enemies || []).map(e2 => ({ ...e2 }));
  g.boss = g.enemies.find(e2 => e2.k === 'boss') || null;
  for (const w2 of g.waves) {
    const saved = (snap.waves || []).find(s => s.x === w2.x);
    if (saved) { w2.done = saved.done; w2.alive = saved.alive; }
  }
  // remap players by pid where possible
  for (const sp of snap.players || []) {
    const p = g.players.find(q => q.pid === sp.pid);
    if (p) Object.assign(p, sp);
  }
  nextId = Math.max(nextId, ...g.enemies.map(e2 => e2.id + 1), 1000);
  return g;
}
