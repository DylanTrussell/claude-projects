// Act IV — THE LZ AMBUSH. The chopper's inbound, the LZ goes quiet, and
// Chancellor Grimtail descends "to talk." He doesn't mean it. A scripted
// in-engine cinematic (no video — cheaper, and lets the shield-spark beat
// land exactly on the dialogue) flows straight into a discover-the-mechanic
// boss fight: 3 shield pylons orbit him, each pulsing armored/exposed on its
// own clock. Bullets do nothing to the Chancellor OR an armored pylon except
// spark blue — only a pylon hit during its bright "exposed" flash counts.
// Kill all 3 and the shield collapses for good; he's enraged and open.
// v14.5: the nodes are seated in hull housings on struts (health = rim lamps
// and cracks, no floating bars), the old shield circle is gone, the missile
// attack is a six-rocket volley you can shoot down, a marked bomb carpet with
// a gap joins the rotation, and he squeaks when he speaks or lands a hit.
//
// Art (chancellor_boss, chancellor_ship) lives in the 'boss2' CDN chunk
// (chunks.js) — painterly Jodorowsky's-Dune / Chris Foss style, deliberately
// NOT STYLE FORMULA v1 (this reads as an otherworldly mothership-tier foe,
// not a ground-level pixel-art enemy). Falls back to procedural shapes if
// the chunk hasn't loaded, same pattern as boat.js.
import { C, CFG, PAL, W, H } from './config.js';
import { IMG } from './assets.js';
import { RailBase } from './rails.js';
import { drawMuzzleBurst, pixBlob, pixFlame } from './render.js';

const GY = 640;
// v14.5 (Dylan: "instead of two rockets, just shoot six, one after the other,
// overwhelm you... you can shoot the rockets"). The volley: a readable wind-up
// (bay hatches open, the loaded noses show), then SIX rockets alternating out
// of the two bays a beat apart. Every rocket aims where its cat is standing at
// the instant it leaves the rack, so standing still and shooting up kills the
// ones coming at you, and moving makes the rest land behind you.
const VOLLEY_N = 6, VOLLEY_WIND = 650, VOLLEY_GAP = 185;
const BARRAGE_N = 9, BARRAGE_WIND = 700, BARRAGE_GAP = 85;
const BAY_DX = 150, BAY_DY = 30;

// ---- pixel-art rocket, painted once into a 28x13 bitmap and drawn scaled with
// smoothing off so every edge stays hard at any heading ----
let ROCKET_CV = null;
function rocketSprite() {
  if (ROCKET_CV || typeof document === 'undefined') return ROCKET_CV;
  const cv = document.createElement('canvas'); cv.width = 28; cv.height = 13;
  const g = cv.getContext('2d'); if (!g) return null;
  const px = (c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  // fins (rear, top and bottom), red with a dark edge
  px('#120c14', 2, 0, 6, 1); px('#120c14', 2, 12, 6, 1);
  px('#c8372d', 3, 1, 5, 3); px('#c8372d', 3, 9, 5, 3);
  px('#ff6a4a', 4, 1, 3, 1); px('#7a1c18', 3, 11, 5, 1);
  // body: gunmetal tube, lit from above
  px('#120c14', 5, 3, 18, 7);
  px('#4a4452', 6, 4, 16, 5);
  px('#7c7488', 6, 4, 16, 1);
  px('#2a2530', 6, 8, 16, 1);
  // the flesh band, the ship's own pink
  px('#e07a9a', 10, 4, 2, 5); px('#ffb4c8', 10, 4, 2, 1); px('#8d4058', 10, 8, 2, 1);
  // brass collar behind the warhead
  px('#d6a24a', 19, 4, 2, 5); px('#ffe08a', 19, 4, 2, 1);
  // cheese warhead, tapering to a point
  px('#120c14', 22, 3, 3, 7); px('#120c14', 25, 4, 1, 5); px('#120c14', 26, 5, 1, 3); px('#120c14', 27, 6, 1, 1);
  px('#ffcf3a', 22, 4, 3, 5); px('#ffcf3a', 25, 5, 1, 3); px('#ffcf3a', 26, 6, 1, 1);
  px('#fff08a', 22, 4, 3, 1); px('#c8901c', 22, 8, 3, 1);
  px('#c8901c', 23, 6, 1, 1);                        // a cheese hole
  // nozzle
  px('#1a1418', 3, 5, 3, 3); px('#5a3a2a', 4, 6, 1, 1);
  ROCKET_CV = cv;
  return cv;
}
// a white silhouette of a sprite, for hit flashes (ctx.filter is not safe on Safari)
const WHITE = new Map();
function whiteOf(img) {
  if (!img || typeof document === 'undefined') return null;
  let cv = WHITE.get(img);
  if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const g = cv.getContext('2d'); if (!g) return null;
  g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, img.width, img.height);
  WHITE.set(img, cv);
  return cv;
}
// deterministic crack shapes per node (unit radius), so they do not jitter
function cracksFor(seed) {
  let a = (seed * 2654435761) >>> 0;
  const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const out = [];
  for (let i = 0; i < 4; i++) {
    const th = i * 1.7 + rnd() * 0.9;
    const pts = [[Math.cos(th) * 0.15, Math.sin(th) * 0.15]];
    let r = 0.15, ang = th;
    while (r < 0.95) { r += 0.18 + rnd() * 0.12; ang += (rnd() - 0.5) * 0.9; pts.push([Math.cos(ang) * r, Math.sin(ang) * r]); }
    out.push(pts);
  }
  return out;
}
// a hard-edged pixel disc on the 4px grid (pixBlob is an octagon; housings want round)
function pixDisc(ctx, x, y, r) {
  const q = 4; x = Math.round(x / q) * q; y = Math.round(y / q) * q;
  for (let dy = -r; dy < r; dy += q) {
    const m = dy + q / 2, hw = Math.round(Math.sqrt(Math.max(0, r * r - m * m)) / q) * q;
    if (hw > 0) ctx.fillRect(x - hw, y + dy, hw * 2, q);
  }
}
// cheap hash noise for render-only flicker (never touches Math.random)
function hn(n) { n = (n * 374761393) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
// v13.5 (Dylan: "he should be flying from the left, from the right, flying
// off-screen, flying on-screen. It's just not dynamic enough."). The fixed
// hover is gone: the flagship now FLIES -- hover at one flank, power off the
// edge, then a fast strafing pass back across at a new height, and settle on
// the other flank. Everything that referenced the fixed point (pylons, shield,
// bolts, hit tests, dome glow) rides the animated position instead.
const BX0 = 900, BY0 = 260; // initial hover, screen space
const PYLONS0 = [
  { dx: -190, dy: -100, per: 2400, off: 0 },
  { dx: 200, dy: -60, per: 2400, off: 900 },
  { dx: 10, dy: 170, per: 2400, off: 1700 },
];
const EXPOSE_MS = 700; // window per cycle a pylon can actually be hurt

function aabb(ax, ay, bx, by, r) { return Math.abs(ax - bx) < r && Math.abs(ay - by) < r; }

// v14.3 co-op: Charlie's rounds burn orange, Whiskers' stay pale yellow.
const P2_TRACER = '#ff8a2a';
// a hit on one cat's own body: own hp, own lives, the fight is only lost when
// both cats are out (same rule as Surf in boat.js)
function bodyHurt(rail, q, amt, T, other, bx, by) {
  if (!q || q.st === 'out' || T.hurtT > 0) return;
  q.hp -= amt; T.hurtT = 900; rail.flashT = 130; rail.shake = Math.max(rail.shake, 12);
  rail.ev({ e: 'fpsHurt' }); rail.ev({ e: 'sfx', n: 'sfx_explosion' });
  if (q.hp > 0) return;
  q.deaths = (q.deaths || 0) + 1; q.lives--; q.hp = CFG.hpMax; T.hurtT = 2200;
  rail.boom(bx, by, 1); rail.shake = 22;
  if (q.lives <= 0) { q.lives = 0; q.st = 'out'; }
  if (q.st === 'out' && (!other || other.st === 'out')) { rail.dead = true; rail.done = true; }
}

export class ParleyBoss extends RailBase {
  constructor() {
    super(999999); // no clock — ends on win or death, not a timer
    this.phase = 'talk'; // talk -> reveal -> laugh -> fight -> (shield down, same phase, this.shieldUp flips)
    this.px = W / 2;
    this.gunCd = 0;
    this.bossHp = 105; this.bossHpMax = 105; // v13.5: the finale was the SHORTEST fight (~19s); +50% pass
    this.shieldUp = true;
    this.pylons = PYLONS0.map((o, i) => ({ ...o, hp: 4, alive: true, t: o.off, exposed: false, flash: 0, cracks: cracksFor(i + 3) })); // v13.5: 3 -> 4, longer finale
    this.bx = BX0; this.by = BY0;
    this.flyState = 'hover'; this.flyT = 0; this.flySide = 1; this.passY = BY0;
    this.bolts = []; // boss plasma bolts -> player
    this.sparks = []; // shield-spark FX (armored hit, or shield-dome hit)
    this.atkT = 2200;
    this.tellT = 0; this.tellTX = 0;
    this._fired = new Set();
    this.started = false;
    this.laughPulse = 0;
    this.atk = null;      // the attack in progress: laser | volley | barrage
    this.lastAtk = '';
    this.pops = [];       // rockets shot down: small pixel fireballs
    this.smoke = [];      // rocket exhaust puffs, outlive their rocket
    this.rocketsShot = 0; this.rocketsFired = 0;
    this.tauntCd = 0; this.fightT = 0; this.shieldHit = 0;
    this._rid = 0;
  }

  // v14.5: he laughs at you when he lands one. A squeak burst (main.js plays
  // it) and the ship rocks with the dome flaring, no text.
  taunt(n) {
    if (this.tauntCd > 0 || this.won) return;
    this.tauntCd = 2600; this.laughPulse = 1100;
    this.ev({ e: 'squeak', n });
  }
  rocketDir(x, tx) {
    if (Math.abs(tx - x) > 160) return tx > x ? 1 : -1;
    return x < W / 2 ? 1 : -1;
  }
  endAtk() {
    this.atk = null; this.tellT = 0;
    // breathing room after every attack; less of it once he is enraged
    this.atkT = this.shieldUp ? (1500 + Math.random() * 800) : (900 + Math.random() * 500);
  }
  puff(x, y, n) {
    for (let i = 0; i < n; i++) this.smoke.push({ x: x + (i - 1) * 9, y: y + (i % 2) * 6, t: -i * 40, T: 640, s: 1.6 });
  }

  runScript(t) {
    // v13.4: the parley CONVERSATION is a film now (VIDEO_URLS.parley) -- the
    // ship descending, the hold-your-fire, Grimtail in his dome. Dylan: "the
    // whole conversation... wouldn't it be better if that was a cut scene?
    // Yes, make it that." So the in-game script is just the double-cross:
    // 20.8 seconds of banners (10 of them over deliberately ignored input, per
    // the pacing review) is now a 6-second betrayal straight into the fight.
    const lines = [
      [700, () => { this.phase = 'reveal'; this.ev({ e: 'sfx', n: 'sfx_laser' }); this.ev({ e: 'shake', m: 8 }); this.ev({ e: 'squeak', n: 3 }); }],
      [2400, () => { this.phase = 'laugh'; this.laughPulse = 2200; this.ev({ e: 'sfx', n: 'sfx_ufo' }); this.ev({ e: 'squeak', n: 5 }); }],
      [6000, () => { this.phase = 'fight'; this.ev({ e: 'hint', k: 'parleyControls' }); this.ev({ e: 'music', n: 'music_invasion' }); }],
    ];
    for (const [tt, fn] of lines) {
      if (t >= tt && !this._fired.has(tt)) { this._fired.add(tt); fn(); }
    }
  }

  // ---- v14.3 co-op: Charlie, who already held the left flank as scenery, is
  // P2 -- his own ground position (L/R), his own AK fire straight up (FIRE),
  // his own hits and lives. Grimtail's laser and missiles pick either cat.
  ensureC2() {
    if (!this.c2) this.c2 = { x: Math.max(70, this.px - 190), gunCd: 0, fireT: 0, hurtT: 0 };
    return this.c2;
  }
  coopJoin(q) { super.coopJoin(q); this.ensureC2(); }
  coopRevive(q) {
    super.coopRevive(q);
    if (q === this._p2) this.ensureC2().hurtT = 2200; else this.hurtT = 2200;
  }
  hurt(p, amt) {
    const q2 = this._p2;
    const h0 = p ? p.hp + p.lives * 1000 : 0;
    if (!q2) super.hurt(p, amt);                      // solo: one body
    else if (p === q2) { const c = this.ensureC2(); bodyHurt(this, q2, amt, c, this._p, c.x, GY - 50); }
    else bodyHurt(this, p, amt, this, q2, this.px, GY - 50);
    if (p && this.phase === 'fight' && p.hp + p.lives * 1000 < h0) this.taunt(p.hp === CFG.hpMax ? 4 : 2);
  }
  // where Grimtail aims: Whiskers solo; in co-op whichever cat he picks
  aimX(on1, on2) {
    if (on1 && on2) return Math.random() < 0.5 ? this.px : this.c2.x;
    return on2 ? this.c2.x : this.px;
  }
  step(bits, dt, p, bits2, p2) {
    if (this.done) return;
    this.stepCommon(dt, p);
    if (p2) this._p2 = p2;
    const q2 = this._p2, co = !!q2;
    const on1 = !co || p.st !== 'out';                // solo: always true
    const c = co ? this.ensureC2() : null;
    const on2 = co && q2.st !== 'out';
    bits2 = bits2 || 0;
    if (c) { c.gunCd -= dt; c.fireT -= dt; c.hurtT -= dt; }
    const dts = dt / 1000;
    if (!this.started) { this.started = true; this.ev({ e: 'music', n: 'music_ratpatrol' }); }
    this.runScript(this.t);
    this.laughPulse = Math.max(0, this.laughPulse - dt);
    this.tauntCd -= dt;
    if (this.shieldHit > 0) this.shieldHit -= dt;
    if (this.phase === 'fight') this.fightT += dt;

    // ---- cinematic-only auto-fire: the squad unloads on him during 'reveal', to no effect ----
    if (this.phase === 'reveal' && this.ineffective) {
      this.gunCd -= dt;
      if (this.gunCd <= 0) {
        this.gunCd = 90;
        this.sparks.push({ x: this.bx + (Math.random() - 0.5) * 200, y: this.by + (Math.random() - 0.5) * 140, t: 0 });
      }
    }

    // ---- the flagship flies (fight phase only; it holds still to talk) ----
    if (this.phase === 'fight') {
      this.flyT += dt;
      const OFF = 460;                                   // how far past the edge it exits
      if (this.flyState === 'hover') {
        // settle on the current flank with a live bob -- the main shooting window
        const tx = this.flySide > 0 ? W - 330 : 330;
        this.bx += (tx - this.bx) * Math.min(1, dts * 2.4);
        this.by = BY0 + Math.sin(this.t / 700) * 26;
        // never peel off mid-attack: a volley or barrage finishes from the flank it started on
        if (this.flyT > 3400 && !this.atk && !(this.tellT > 0)) { this.flyState = 'exit'; this.flyT = 0; }
      } else if (this.flyState === 'exit') {
        // power off the near edge
        this.bx += this.flySide * (900 * dts) * (1 + this.flyT / 600);
        if (this.bx < -OFF || this.bx > W + OFF) {
          this.flyState = 'pass'; this.flyT = 0;
          this.flySide = -this.flySide;                  // come back from the other side
          this.bx = this.flySide > 0 ? -OFF : W + OFF;
          this.passY = 180 + Math.random() * 240;        // new altitude every pass
          this.ev({ e: 'sfx', n: 'sfx_ufo' });
        }
      } else if (this.flyState === 'pass') {
        // the strafing run: fast sweep across, raining bolts
        this.bx += this.flySide * 780 * dts;
        this.by += (this.passY - this.by) * Math.min(1, dts * 3);
        this.passGun = (this.passGun || 0) - dt;
        if (this.passGun <= 0 && this.bx > 120 && this.bx < W - 120) {
          this.passGun = 340;
          // v13.14: bombs off the belly, tumbling, not bolts
          this.bolts.push({ k: 'bomb', x: this.bx, y: this.by + 70, vx: this.flySide * 160, vy: 80, t: 0, ang: 0, spin: this.flySide * 4 });
          this.ev({ e: 'sfx', n: 'sfx_shot' });
        }
        if ((this.flySide > 0 && this.bx > W - 330) || (this.flySide < 0 && this.bx < 330)) {
          this.flyState = 'hover'; this.flyT = 0;
        }
      }
    }

    // ---- player controls: locked until the fight actually starts ----
    if (this.phase === 'fight' && on1) {
      if (bits & C.L) this.px -= 420 * dts;
      if (bits & C.R) this.px += 420 * dts;
      this.px = Math.max(90, Math.min(W - 90, this.px));
      this.gunCd -= dt;
      if ((bits & C.FIRE) && this.gunCd <= 0) {
        this.gunCd = 150; this.fireT = 70;
        this.ev({ e: 'sfx', n: 'sfx_shot' });
        this.shots.push({ x: this.px, y: GY - 30, vx: 0, vy: -1050, t: 1000 });
      }
    }
    if (this.phase === 'fight' && on2) {
      if (bits2 & C.L) c.x -= 420 * dts;
      if (bits2 & C.R) c.x += 420 * dts;
      c.x = Math.max(70, Math.min(W - 90, c.x));
      if ((bits2 & C.FIRE) && c.gunCd <= 0) {
        c.gunCd = 150; c.fireT = 70;
        this.ev({ e: 'sfx', n: 'sfx_shot' });
        // straight up off the AK's muzzle (u 0.96 / v 0.03 of charlie_ship.png)
        this.shots.push({ x: c.x + 35, y: GY - 80, vx: 0, vy: -1050, t: 1000, p2: 1 });
      }
    }

    // shots travel + resolve
    if (this.shots) {
      for (const s of this.shots) { s.y += s.vy * dts; s.t -= dt; }
      for (const s of this.shots) {
        if (s.t <= 0) continue;
        // v14.5: rockets are in front of everything -- one round brings one down
        let hitSomething = false;
        for (const b of this.bolts) {
          if (b.k !== 'missile' || b.spent) continue;
          if (Math.abs(s.x - b.x) < 20 && s.y < b.y + 26 && s.y + 26 > b.y - 22) {
            b.spent = true; s.t = 0; hitSomething = true;
            this.rocketsShot++;
            if (s.p2) { this.p2Hits = (this.p2Hits || 0) + 1; this.ev({ e: 'fpsKill', by: 'p2' }); }
            else this.ev({ e: 'fpsKill' });             // main.js: +150 points
            this.ev({ e: 'sfx', n: 'sfx_shrapnel' });
            this.pops.push({ x: b.x, y: b.y, t: 0, seed: this._rid++ * 97, vx: b.vx * 0.25, vy: b.vy * 0.25 });
            this.shake = Math.max(this.shake, 3);
            break;
          }
        }
        if (hitSomething) continue;
        // pylons first
        for (const py of this.pylons) {
          if (!py.alive) continue;
          const px2 = this.bx + py.dx, py2 = this.by + py.dy;
          if (aabb(s.x, s.y, px2, py2, 46)) {
            hitSomething = true; s.t = 0;
            if (py.exposed) {
              py.hp--; py.flash = 220; this.ev({ e: 'sfx', n: 'sfx_meow' });
              if (s.p2) this.p2Hits = (this.p2Hits || 0) + 1;
              // v13.7 (Dylan: "the spaceship should be glowing and changing
              // colours when it's taking damage") -- and the standing rule
              // that everything visibly reacts to every hit.
              this.hullHit = 260; this.hullDmg = Math.min(1, (this.hullDmg || 0) + 0.14);
              this.sparks.push({ x: px2, y: py2, t: 0, good: 1 });
              if (py.hp <= 0) {
                py.alive = false;
                this.ev({ e: 'boom', x: px2, y: py2, big: 0 });
              }
            } else {
              py.flash = 120;            // armoured: it still flinches, it just holds
              this.sparks.push({ x: px2, y: py2, t: 0 });
            }
            break;
          }
        }
        // boss / shield dome
        if (!hitSomething && aabb(s.x, s.y, this.bx, this.by, 190)) {
          s.t = 0;
          if (this.shieldUp) {
            // the shield shows itself only where it is struck: a blue scan
            // shimmer across the hull's own pixels (render), plus the splinter burst
            this.sparks.push({ x: s.x, y: Math.min(s.y, this.by + 60), t: 0 });
            this.shieldHit = 240;
          } else {
            this.bossHp -= 4;
            if (s.p2) this.p2Hits = (this.p2Hits || 0) + 1;
            this.ev({ e: 'hit', x: s.x, y: s.y });
            this.sparks.push({ x: s.x, y: this.by, t: 0, good: 1 });
            if (this.bossHp <= 0 && !this.won) {
              this.won = true;
              for (let i = 0; i < 6; i++) this.boom(this.bx - 130 + i * 46, this.by - 60 + (i % 3) * 70, 1);
              this.ev({ e: 'sfx', n: 'sfx_explosion' });
              this.ev({ e: 'shake', m: 16 });
              this.ev({ e: 'banner', k: 'chancellorDown' });
              this.kills = 50; // main.js does g.score += kills*100 — parity with the mothership's 5000
              // v13.9: long enough to actually watch him lose. The ship comes
              // apart, and then he drags himself out of his own wreckage --
              // which is the ending Dylan wanted to see before committing to it.
              this.doneT = 5200; this.wonT = 0;
            }
          }
        }
      }
      this.shots = this.shots.filter(s => s.t > 0 && s.y > -60);
    }

    // shield collapses once all 3 pylons are down
    if (this.shieldUp && this.phase === 'fight' && this.pylons.every(py => !py.alive)) {
      this.shieldUp = false;
      this.ev({ e: 'sfx', n: 'sfx_explosion' });
      this.ev({ e: 'shake', m: 12 });
      this.ev({ e: 'squeak', n: 4 });       // and he screams about it
      this.laughPulse = 900;
      this.atkT = 900; // enraged — faster next volley
    }

    if (this.hullHit > 0) this.hullHit -= dt;
    // pylon armored/exposed pulse
    for (const py of this.pylons) {
      if (!py.alive) continue;
      py.t += dt;
      if (py.flash > 0) py.flash -= dt;   // v13.9: the node's own hit reaction
      const ph = py.t % py.per;
      py.exposed = ph < EXPOSE_MS;
      py.warn = ph > py.per - 380;          // the iris is about to open
    }

    // ---- Grimtail's guns (v13.14, reworked v14.5) ----
    //  VOLLEY    six rockets, alternating bays, a beat apart, each aimed at
    //            where its cat stands as it launches. Every one can be shot.
    //  LASER     a thin pink aiming line from the belly emitter to the dirt,
    //            then the beam itself -- sidestep while the line is up
    //  BARRAGE   the belly opens and carpets the ground left to right, with
    //            the landing spots marked and one gap left near each cat
    //  BOMBS     still dropped from the belly on every strafing pass (above)
    if (this.phase === 'fight') {
      this.atkT -= dt;
      const A = this.atk;
      if (A) {
        A.t += dt;
        if (A.k === 'laser') {
          this.tellT = Math.max(0, 620 - A.t); this.tellKind = 'laser'; this.tellTX = A.tx;
          if (A.t >= 620) {
            this.beam = { x: A.tx, t: 0, T: 420 };
            this.ev({ e: 'sfx', n: 'sfx_laser' }); this.ev({ e: 'shake', m: 6 });
            this.endAtk();
          }
        } else if (A.k === 'volley') {
          while (A.n < VOLLEY_N && A.t >= VOLLEY_WIND + A.n * VOLLEY_GAP) {
            const s = A.n % 2 ? 1 : -1;
            // co-op: the rockets alternate between the two cats
            let tx = this.px;
            if (on1 && on2) tx = (A.n % 2) ? c.x + 35 : this.px;
            else if (on2) tx = c.x + 35;
            tx += (Math.random() - 0.5) * 70;
            // kicked up out of the bay leaning the way it will roll over, so the
            // arc stays tight and on screen
            const dir = this.rocketDir(this.bx + s * BAY_DX, tx), vx0 = dir * 170;
            this.bolts.push({ k: 'missile', id: this._rid++, x: this.bx + s * BAY_DX, y: this.by + BAY_DY, vx: vx0, vy: -200, sp: 300, ang: Math.atan2(-200, vx0), tx, t: 0, puffT: 0, dir });
            this.rocketsFired++;
            this.puff(this.bx + s * BAY_DX, this.by + BAY_DY, 3);
            this.ev({ e: 'sfx', n: 'sfx_shot' });
            A.n++;
          }
          if (A.n >= VOLLEY_N) this.endAtk();
        } else if (A.k === 'barrage') {
          while (A.n < A.tg.length && A.t >= BARRAGE_WIND + A.n * BARRAGE_GAP) {
            const tx = A.tg[A.n];
            const x0 = this.bx, y0 = this.by + 70, vy0 = 60;
            // time to fall to the dirt, then the sideways speed that lands it on its mark
            const dy = (GY - 10) - y0, tf = (-vy0 + Math.sqrt(vy0 * vy0 + 4 * 450 * dy)) / 900;
            this.bolts.push({ k: 'bomb', x: x0, y: y0, vx: (tx - x0) / tf, vy: vy0, t: 0, ang: 0, spin: (tx > x0 ? 1 : -1) * 5 });
            if (A.n % 2 === 0) this.ev({ e: 'sfx', n: 'sfx_shot' });
            A.n++;
          }
          if (A.n >= A.tg.length) this.endAtk();
        }
      } else if (!(this.tellT > 0) && this.atkT <= 0 && this.flyState === 'hover') {
        const r = Math.random();
        let k = r < 0.32 ? 'laser' : r < (this.shieldUp ? 0.8 : 0.74) ? 'volley' : 'barrage';
        if (k === 'barrage' && this.lastAtk === 'barrage') k = 'volley';
        this.lastAtk = k;
        const aim = co ? this.aimX(on1, on2) : this.px;
        if (k === 'laser') this.atk = { k, t: 0, tx: aim };
        else if (k === 'volley') { this.atk = { k, t: 0, n: 0 }; this.ev({ e: 'sfx', n: 'sfx_click' }); }
        else {
          // the carpet: marks every ~95px across the flank, minus a gap near each live cat
          const holes = [];
          for (const x of [on1 ? this.px : null, on2 ? c.x + 35 : null]) {
            if (x === null) continue;
            const off = (Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * 120);
            holes.push(Math.max(110, Math.min(W - 110, x + off)));
          }
          const tg = [];
          for (let x = 60; x <= W - 60; x += 95) if (holes.every(h => Math.abs(x - h) > 150)) tg.push(x);
          // sweep from the side the ship is on
          if (this.bx > W / 2) tg.reverse();
          this.atk = { k, t: 0, n: 0, tg: tg.slice(0, Math.max(BARRAGE_N, tg.length)), holes };
          this.ev({ e: 'sfx', n: 'sfx_ufo' });
        }
      }
    } else if (this.phase === 'laugh') this.atkT -= dt;
    if (this.beam) {
      this.beam.t += dt;
      if (on1 && this.beam.t > 120 && this.beam.t < 360 && !this.beam.hit && Math.abs(this.beam.x - this.px) < 40) { this.beam.hit = 1; this.hurt(p, 1); }
      if (on2 && this.beam.t > 120 && this.beam.t < 360 && !this.beam.hit2 && Math.abs(this.beam.x - c.x) < 40) { this.beam.hit2 = 1; this.hurt(q2, 1); }
      if (this.beam.t >= this.beam.T) this.beam = null;
    }
    for (const b of this.bolts) {
      if (b.spent) continue;
      b.t += dt;
      if (b.k === 'missile') {
        // boost out of the bay, then turn (rate-limited, so it can be outrun)
        // onto the spot it was aimed at, accelerating as it comes down
        const want = Math.atan2((GY - 4) - b.y, b.tx - b.x);
        if (b.t > 150) {
          let da = want - b.ang;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          // the big over-the-top turn always rolls toward its target (or toward
          // mid-screen for one dropping straight down), never out past the edge
          if (!b.locked) {
            if (Math.abs(da) < 0.5) b.locked = true;
            else if (b.dir > 0 && da < 0) da += Math.PI * 2;
            else if (b.dir < 0 && da > 0) da -= Math.PI * 2;
          }
          const turn = 4.0 * dts;
          b.ang += Math.max(-turn, Math.min(turn, da));
        }
        b.sp = Math.min(600, b.sp + 420 * dts);
        b.vx = Math.cos(b.ang) * b.sp; b.vy = Math.sin(b.ang) * b.sp;
        b.x += b.vx * dts; b.y += b.vy * dts;
        b.puffT -= dt;
        if (b.puffT <= 0) { b.puffT = 38; this.smoke.push({ x: b.x - Math.cos(b.ang) * 26, y: b.y - Math.sin(b.ang) * 26, t: 0, T: 560, s: 1 }); }
        let hitCat = false;
        if (b.y > GY - 110) {
          if (on1 && Math.abs(b.x - this.px) < 26) hitCat = true;
          if (on2 && Math.abs(b.x - c.x - 10) < 26) hitCat = true;
        }
        if ((b.y >= GY - 12 || hitCat) && !b.spent) {
          b.spent = true; this.boom(b.x, Math.min(b.y, GY - 20), 0);
          if (on1 && Math.abs(b.x - this.px) < 62) this.hurt(p, 1);
          if (on2 && Math.abs(b.x - c.x - 10) < 62) this.hurt(q2, 1);
        }
      } else { // bomb
        b.vy += 900 * dts; b.x += b.vx * dts; b.y += b.vy * dts; b.ang += b.spin * dts;
        if (b.y >= GY - 10 && !b.spent) {
          b.spent = true; this.boom(b.x, GY - 16, 0);
          if (on1 && Math.abs(b.x - this.px) < 84) this.hurt(p, 1);
          if (on2 && Math.abs(b.x - c.x) < 84) this.hurt(q2, 1);
        }
      }
    }
    this.bolts = this.bolts.filter(b => !b.spent && b.y < H + 40 && b.x > -160 && b.x < W + 160);
    for (const q of this.smoke) q.t += dt;
    this.smoke = this.smoke.filter(q => q.t < q.T);
    for (const q of this.pops) q.t += dt;
    this.pops = this.pops.filter(q => q.t < 420);

    for (const sp of this.sparks) sp.t += dt;
    this.sparks = this.sparks.filter(sp => sp.t < 260);

    if (this.doneT !== undefined) {
      this.doneT -= dt;
      this.wonT = (this.wonT || 0) + dt;
      // secondary detonations while the hull tears itself apart
      if (this.wonT < 2600 && Math.random() < dt / 260) {
        this.boom(this.bx - 150 + Math.random() * 300, this.by - 90 + Math.random() * 150, Math.random() < 0.4);
      }
      if (this.doneT <= 0) this.done = true;
    }
    this.prevBits = bits;
  }

  render(ctx, now) {
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save(); ctx.translate(sx, 0);
    this.drawSky(ctx, 30);
    // dusk wash
    ctx.fillStyle = 'rgba(60,20,50,0.28)'; ctx.fillRect(0, 0, W, H);

    // the flagship, hovering behind him
    const introK = Math.min(1, this.t / 2200);
    const ease = 1 - Math.pow(1 - introK, 3);
    const shipYOff = (1 - ease) * 260;
    // v13.4 (Dylan: "why is the rat floating next to the spaceship? It makes
    // no sense. He should be in it."). One drawing now: the Dune flagship with
    // Grimtail visible ON HIS THRONE inside the lit dome baked into the art.
    // v13.9 -- the trophy wall, behind him, visible through the talk beats.
    // v14.5 (Dylan: "there's a weird artifact behind it"): it used to stay at
    // a quarter opacity for the whole fight, a ghost panel plus a big green
    // lamp halo riding along behind a flying ship. It is a talk-beat prop, so
    // it now fades all the way out as the shooting starts.
    const wall = IMG.grim_trophy_wall;
    const wk = this.phase !== 'fight' ? 1 : Math.max(0, 1 - this.fightT / 700);
    if (wall && wk > 0) {
      const wh = 300, ww = wh * (wall.width / wall.height);
      ctx.save();
      ctx.globalAlpha = 0.85 * wk * Math.min(1, this.t / 1400);
      ctx.drawImage(wall, this.bx - ww / 2, this.by - wh * 0.95, ww, wh);
      // the lamp above the tags breathes
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.20 * wk * (0.7 + 0.3 * Math.sin(now / 520));
      const lg = ctx.createRadialGradient(this.bx, this.by - wh * 0.78, 0, this.bx, this.by - wh * 0.78, ww * 0.3);
      lg.addColorStop(0, 'rgba(150,255,150,0.9)');
      lg.addColorStop(1, 'rgba(150,255,150,0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(this.bx, this.by - wh * 0.78, ww * 0.3, 0, 7); ctx.fill();
      ctx.restore();
    }
    const ship = IMG.chancellor_ship;
    const bossPulse = this.laughPulse > 0 ? Math.sin(now / 60) * 6 : 0;
    const ox = this.bx + bossPulse * 0.4, oy = this.by + shipYOff;   // everything bolted to the hull rides this
    if (ship) {
      const sh = 430, sw = sh * (ship.width / ship.height);
      const shx = ox - sw * 0.5, shy = this.by - sh * 0.60 + shipYOff;
      // v13.7 DAMAGE READ, v14.5 fix: the tinted copy used to be drawn ON TOP
      // of the plain ship, so every soft edge pixel was laid down twice and the
      // heat tint rode out onto the doubled fringe: the pale pink outline Dylan
      // saw. Now the hull is drawn exactly once, either plain or as the one
      // composited copy (heat, hit flash, shield shimmer, all source-atop so
      // nothing ever spills past the art's own alpha).
      const hk = Math.max(0, (this.hullHit || 0) / 260);
      const dmg = this.hullDmg || 0;
      const shk = Math.max(0, this.shieldHit / 240);
      const sweepPh = (now % 2600) / 700;                       // a slow scan down the hull while shielded
      const sweep = this.shieldUp && this.phase === 'fight' && sweepPh < 1;
      let hull = ship;
      if ((hk > 0 || dmg > 0 || shk > 0 || sweep) && typeof document !== 'undefined') {
        if (!this._hullCv || this._hullCv.width !== ship.width) {
          this._hullCv = document.createElement('canvas');
          this._hullCv.width = ship.width; this._hullCv.height = ship.height;
        }
        const hc = this._hullCv.getContext('2d');
        const SW = ship.width, SH = ship.height;
        hc.globalCompositeOperation = 'source-over';
        hc.clearRect(0, 0, SW, SH);
        hc.drawImage(ship, 0, 0);
        hc.globalCompositeOperation = 'source-atop';
        if (dmg > 0) {
          hc.fillStyle = `rgba(255,${Math.round(90 - 60 * dmg)},${Math.round(60 - 40 * dmg)},${(0.30 * dmg * (0.7 + 0.3 * Math.sin(now / 220))).toFixed(3)})`;
          hc.fillRect(0, 0, SW, SH);
        }
        // the shield: hard scanlines in the art's own silhouette, never a bubble
        if (shk > 0 || sweep) {
          const band = SH / 14;
          if (shk > 0) {
            hc.fillStyle = `rgba(110,190,255,${(0.28 * shk).toFixed(3)})`;
            hc.fillRect(0, 0, SW, SH);
            hc.fillStyle = `rgba(170,225,255,${(0.35 * shk).toFixed(3)})`;
            for (let y = (now / 6) % 8; y < SH; y += 8) hc.fillRect(0, Math.floor(y), SW, 3);
          }
          if (sweep) {
            hc.fillStyle = 'rgba(120,200,255,0.16)';
            hc.fillRect(0, Math.floor(sweepPh * SH - band), SW, Math.ceil(band));
            hc.fillStyle = 'rgba(200,240,255,0.22)';
            hc.fillRect(0, Math.floor(sweepPh * SH), SW, 4);
          }
        }
        if (hk > 0) {
          hc.fillStyle = `rgba(255,255,255,${(0.85 * hk).toFixed(3)})`;
          hc.fillRect(0, 0, SW, SH);
        }
        hc.globalCompositeOperation = 'source-over';
        hull = this._hullCv;
      }
      ctx.drawImage(hull, shx, shy, sw, sh);
      // it burns from the wounds as it degrades: hard pixel flames, not glow discs
      if (dmg > 0.25) {
        for (let i = 0; i < 3; i++) {
          const wx = shx + sw * (0.34 + i * 0.19), wy = shy + sh * (0.46 + (i % 2) * 0.12);
          const k = ((now / (420 + i * 90)) + i * 0.37) % 1;
          pixFlame(ctx, wx, wy - k * 10, 5 + 9 * dmg, k * 0.7, now / 3 + i * 50);
        }
      }
      // dome glow: his voice, shown not told -- pulses while he laughs/talks/taunts
      const domeX = ox + sw * 0.10, domeY = this.by - sh * 0.36 + shipYOff;
      const talk = this.phase !== 'fight' || this.laughPulse > 0 ? 0.5 + 0.5 * Math.sin(now / 90) : 0.25;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(domeX, domeY, 6, domeX, domeY, 70);
      gr.addColorStop(0, `rgba(255,205,110,${(0.30 * talk + 0.10).toFixed(2)})`);
      gr.addColorStop(1, 'rgba(255,160,40,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(domeX, domeY, 70, 0, 7); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = '#8a6a3a';
      ctx.beginPath(); ctx.ellipse(ox, oy - 90, 220, 90, 0, 0, 7); ctx.fill();
    }

    // v14.5: the old fixed shield circle (a 190px ring + translucent fill
    // around the whole ship) is gone -- that was the "weird artifact behind
    // it". The shield now only shows on the hull itself (above) and in the
    // energy the pylons pump into it (below).

    // belly emitter: the laser's muzzle, cold until it charges
    if (this.phase === 'fight') {
      const ch = this.tellT > 0 && this.tellKind === 'laser' ? 1 - this.tellT / 620 : this.beam ? 1 : 0;
      ctx.fillStyle = '#1c151e'; pixBlob(ctx, ox, oy + 60, 9);
      ctx.fillStyle = ch > 0 ? (Math.floor(now / 50) % 2 ? '#ff54d8' : '#ffd0f4') : '#5a2a4a';
      pixBlob(ctx, ox, oy + 60, 4 + ch * 4);
    }

    this.drawNodes(ctx, now, ox, oy);

    // shield sparks -- v13.14: a burst of radiating splinters with a hot
    // centre, not a growing disc
    for (const sp of this.sparks) {
      const k = sp.t / 260;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = sp.good ? `rgba(140,255,59,${((1 - k) * 0.9).toFixed(2)})` : `rgba(90,170,255,${((1 - k) * 0.9).toFixed(2)})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + sp.x * 0.01;
        const r0 = 4 + k * 26, r1 = r0 + 6 + (i % 2) * 6;
        ctx.beginPath(); ctx.moveTo(sp.x + Math.cos(a) * r0, sp.y + Math.sin(a) * r0); ctx.lineTo(sp.x + Math.cos(a) * r1, sp.y + Math.sin(a) * r1); ctx.stroke();
      }
      ctx.fillStyle = `rgba(255,255,255,${((1 - k) * 0.7).toFixed(2)})`;
      pixBlob(ctx, sp.x, sp.y, 3 + (1 - k) * 4);
      ctx.restore();
    }

    // player shots
    ctx.lineWidth = 4;
    if (this.shots) for (const s of this.shots) { ctx.strokeStyle = s.p2 ? P2_TRACER : PAL.tracer; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y + 26); ctx.stroke(); }

    this.drawAttacks(ctx, now, ox, oy);

    // v13.5 (Dylan's screenshot: "I don't know what this thing on the bottom
    // is that I'm shooting from. It makes no sense.") It was a khaki rectangle
    // with a circle for a head -- the comment claimed no hero art was loaded
    // here, but hero_us_up ships in the BASE bundle and has been available the
    // whole time. The real cat now stands there, gun up, rocking with recoil.
    if (this.phase === 'fight' || this.phase === 'laugh' || this.phase === 'reveal') {
      // v13.9 -- Charlie is at the parley too. Standing rule: after the truce
      // this is a two-cat war, and the finale had Whiskers facing the
      // Chancellor alone. He holds the left flank, firing on his own cadence,
      // slightly behind so he never crowds the player's read of his own cat.
      const ci = IMG.charlie_ship;
      const co = !!(this._p2 && this.c2);
      const on1 = !co || !(this._p && this._p.st === 'out');
      if (co) {
        if (this._p2.st !== 'out') this.drawCharlieP2(ctx, now, ci);
      } else if (ci) {
        const chh = 92, chw = chh * (ci.width / ci.height);
        const cx2 = Math.max(70, this.px - 190);
        const cfire = (now % 900) < 90 && this.phase === 'fight';
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.drawImage(ci, cx2 - chw / 2, GY - chh + (cfire ? 3 : 0), chw, chh);
        ctx.restore();
        if (cfire) drawMuzzleBurst(ctx, cx2 + 6, GY - chh - 4, -Math.PI / 2, 0.8);
      }
      const hi = IMG.hero_us_up || IMG.hero_us;
      if (!on1) { /* co-op: Whiskers is out of lives until Charlie brings him back */ }
      else if (hi) {
        const hh = 104, hw = hh * (hi.width / hi.height);
        const rk = Math.max(0, this.fireT || 0) / 70;
        ctx.save();
        if (rk > 0) { ctx.translate(this.px, GY); ctx.rotate(rk * 0.05); ctx.translate(-this.px, -GY); }
        ctx.drawImage(hi, this.px - hw / 2, GY - hh + rk * 3, hw, hh);
        ctx.restore();
        if (rk > 0.2) drawMuzzleBurst(ctx, this.px + 8, GY - hh - 6, -Math.PI / 2, rk);
      } else {
        ctx.fillStyle = PAL.khaki;
        ctx.fillRect(this.px - 16, GY - 60, 32, 60);
      }
    }

    this.drawBooms(ctx);

    // v13.9 -- THE ENDING. He does not simply pop and cut to a tally. The ship
    // comes apart for a couple of seconds, and then the Chancellor drags
    // himself out of his own wreckage on his elbows, trailing green blood,
    // still crawling as the screen goes. Dylan wanted to see this one before
    // deciding whether it belongs in the game, so it is in, and it is cheap to
    // pull back out: delete this block.
    if (this.won) {
      const wt = this.wonT || 0;
      // v13.12 -- RESTORED. The v2 sprite is canon Grimtail: grey rat, orange
      // and gold robe, spiked crown. The version pulled in v13.9.1 was a brown
      // rat in a blue admiral's coat, which was my prompt's invention.
      const ci = IMG.grimtail_crawl;
      if (ci && wt > 2200) {
        const k = Math.min(1, (wt - 2200) / 900);         // fade up out of the smoke
        const crawl = Math.min(1, (wt - 2200) / 3000);    // and he keeps moving
        const gh = 190, gw = gh * (ci.width / ci.height);
        ctx.save();
        ctx.globalAlpha = k;
        const gx = this.bx + 120 - crawl * 240;           // dragging toward the player
        const gy = GY - gh * 0.62 + Math.sin(wt / 220) * 3;   // the effort of it
        ctx.drawImage(ci, gx - gw / 2, gy, gw, gh);
        ctx.restore();
        // the trail he leaves behind him
        ctx.save();
        ctx.globalAlpha = k * 0.5;
        ctx.fillStyle = 'rgba(120,230,60,0.7)';
        for (let i = 0; i < 7; i++) {
          const tx = gx + gw * 0.34 + i * 26 + crawl * 40;
          ctx.beginPath(); ctx.ellipse(tx, GY - 14 + (i % 2) * 4, 13 - i, 4, 0, 0, 7); ctx.fill();
        }
        ctx.restore();
      }
      // the fires left burning in the debris field
      ctx.save();
      for (let i = 0; i < 7; i++) {
        const ph = ((now / 620) + i * 0.4) % 1;
        ctx.globalAlpha = 0.5 * (1 - ph) * Math.min(1, wt / 800);
        ctx.fillStyle = i % 2 ? '#ff9a3c' : '#8CFF3B';
        const fx2 = this.bx - 190 + i * 56;
        ctx.beginPath(); ctx.arc(fx2, GY - 20 - ph * 90, 9 + ph * 15, 0, 7); ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (this.hurtT > 0) { ctx.fillStyle = `rgba(160,20,10,${Math.min(0.4, this.hurtT / 1200)})`; ctx.fillRect(0, 0, W, H); }

    // letterbox during the scripted talk beats
    if (this.phase !== 'fight') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, 64); ctx.fillRect(0, H - 64, W, 64);
    }
    ctx.restore();

    // boss HP bar — only once the shield is down and he's actually hurtable
    if (!this.shieldUp) {
      const bw2 = 420, bx2 = W / 2 - bw2 / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx2 - 3, 78, bw2 + 6, 16);
      ctx.fillStyle = '#c8372d'; ctx.fillRect(bx2, 81, bw2 * Math.max(0, this.bossHp / this.bossHpMax), 10);
      ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#f3e9c8';
      ctx.fillText('CHANCELLOR GRIMTAIL', W / 2, 74);
    }
  }
}

// v14.3 co-op: P2's Charlie, standing where the player put him. Recoil on
// each round, blinks while his i-frames run, cheese chevron over his hat.
ParleyBoss.prototype.drawCharlieP2 = function (ctx, now, ci) {
  const c = this.c2;
  const rk = Math.max(0, c.fireT) / 70;
  const blink = c.hurtT > 0 && Math.floor(now / 70) % 2 === 0;
  const chh = 92, chw = ci ? chh * (ci.width / ci.height) : 40;
  if (!blink) {
    ctx.save();
    if (rk > 0) { ctx.translate(c.x, GY); ctx.rotate(-rk * 0.05); ctx.translate(-c.x, -GY); }
    if (ci) ctx.drawImage(ci, c.x - chw / 2, GY - chh + rk * 3, chw, chh);
    else { ctx.fillStyle = '#2b2b26'; ctx.fillRect(c.x - 16, GY - 60, 32, 60); }
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = PAL.cheese; ctx.strokeStyle = PAL.outline; ctx.lineWidth = 3;
  const my = GY - chh - 22 + Math.sin(now / 200) * 3;
  ctx.beginPath(); ctx.moveTo(c.x - 11, my - 9); ctx.lineTo(c.x + 11, my - 9); ctx.lineTo(c.x, my + 4); ctx.closePath();
  ctx.stroke(); ctx.fill();
  ctx.restore();
  if (rk > 0.2) drawMuzzleBurst(ctx, c.x + 35, GY - chh + 2, -Math.PI / 2, rk);
};

// v14.5 SHIELD NODES, seated (Dylan: "parts you can hit need to blend in with
// the ship better"). Each node now sits in a blocky iron housing with a brass
// rim, on a strut that runs back into the hull with a flesh cable wound round
// it, and pumps visible energy down that strut into the shield. No floating HP
// bar: the four rim lamps on the housing go dark one per hit, the shell cracks
// a little more each time (light leaks out through the cracks when it opens),
// and its glow dims as it dies. Readable states: dormant (shut, dim), waking
// (lamps blink, iris cracks open), live (eye wide, hot glow, gold brackets).
ParleyBoss.prototype.drawNodes = function (ctx, now, ox, oy) {
  const hullBeat = 0.5 + 0.5 * Math.sin(now / 700);   // shared with the hull's lights
  // pass 1: struts, behind every node
  for (const py of this.pylons) {
    const nx = ox + py.dx, ny = oy + py.dy;
    const ax = ox + py.dx * 0.42, ay = oy + py.dy * 0.42;
    const ang = Math.atan2(ny - ay, nx - ax), L = Math.hypot(nx - ax, ny - ay);
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
    ctx.fillStyle = '#140d14'; ctx.fillRect(0, -8, L, 16);
    ctx.fillStyle = '#463d4c'; ctx.fillRect(0, -6, L, 12);
    ctx.fillStyle = '#7a6f84'; ctx.fillRect(0, -6, L, 3);
    ctx.fillStyle = '#2a2230'; ctx.fillRect(0, 3, L, 3);
    // the flesh cable wound round it, the ship's own pink
    for (let u = 0; u < L - 4; u += 5) {
      const y = Math.round(Math.sin(u / 9 + now / (py.alive ? 300 : 900) + py.off) * 6);
      ctx.fillStyle = '#7a3448'; ctx.fillRect(u, y - 3, 5, 6);
      ctx.fillStyle = '#c4708a'; ctx.fillRect(u, y - 2, 5, 3);
      ctx.fillStyle = '#f0a8bc'; ctx.fillRect(u, y - 2, 5, 1);
    }
    for (const f of [0.3, 0.68]) {               // brass clamps
      ctx.fillStyle = '#140d14'; ctx.fillRect(L * f - 5, -11, 10, 22);
      ctx.fillStyle = '#c8963c'; ctx.fillRect(L * f - 4, -10, 8, 20);
      ctx.fillStyle = '#ffe08a'; ctx.fillRect(L * f - 4, -10, 8, 3);
    }
    // energy pumped down the strut into the shield
    if (py.alive && this.shieldUp) {
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const u = (now / 520 + k / 3 + py.off * 0.001) % 1;
        ctx.fillStyle = py.exposed ? '#fff0b0' : '#7ab8ff';
        ctx.fillRect(Math.round(L * (1 - u)) - 3, -3, 6, 6);
      }
    }
    ctx.restore();
    // flange where the strut enters the hull
    ctx.fillStyle = '#140d14'; pixBlob(ctx, ax, ay, 12);
    ctx.fillStyle = '#463d4c'; pixBlob(ctx, ax, ay, 8);
    ctx.fillStyle = '#c8963c'; ctx.fillRect(Math.round(ax) - 2, Math.round(ay) - 2, 4, 4);
  }
  // pass 2: housings and nodes
  for (const py of this.pylons) {
    const nx = ox + py.dx, ny = oy + py.dy;
    const R = 26;
    ctx.fillStyle = '#120c14'; pixDisc(ctx, nx, ny, R * 1.44);
    ctx.fillStyle = '#8a6430'; pixDisc(ctx, nx, ny, R * 1.32);
    ctx.fillStyle = '#3a3040'; pixDisc(ctx, nx, ny, R * 1.2);
    ctx.fillStyle = '#1e1622'; pixDisc(ctx, nx, ny, R * 1.0);
    if (!py.alive) {
      // blown out: a scorched empty socket, embers, a thin smoke column
      ctx.fillStyle = '#0a0608'; pixDisc(ctx, nx, ny, R * 0.85);
      for (let i = 0; i < 5; i++) {
        const h = hn(Math.floor(now / 110) * 7 + i * 13 + py.off);
        ctx.fillStyle = h > 0.5 ? '#ff8a1e' : '#d8401c';
        ctx.fillRect(Math.round(nx - R * 0.5 + hn(i + py.off) * R) & ~3, Math.round(ny - R * 0.4 + h * R * 0.8) & ~3, 4, 4);
      }
      for (let i = 0; i < 3; i++) {
        const ph = (now / 1400 + i / 3) % 1;
        ctx.globalAlpha = ph < 0.4 ? 0.4 : ph < 0.75 ? 0.25 : 0.12;
        ctx.fillStyle = ph < 0.4 ? '#6a6058' : '#4a4440';
        pixBlob(ctx, nx + Math.sin(ph * 5 + i) * 6, ny - 10 - ph * 70, 5 + ph * 10);
      }
      ctx.globalAlpha = 1;
      continue;
    }
    const ex = py.exposed, warn = py.warn && !ex;
    const hpK = py.hp / 4;
    const beat = 0.5 + 0.5 * Math.sin(now / (ex ? 90 : 420) + py.off);
    const blink = Math.floor(now / 70) % 2 === 0;
    // rim lamps: the node's health, set into its own housing
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2;
      const lx = Math.round(nx + Math.cos(a) * R * 1.22), ly = Math.round(ny + Math.sin(a) * R * 1.22);
      ctx.fillStyle = '#120c14'; ctx.fillRect(lx - 5, ly - 5, 10, 10);
      ctx.fillStyle = k < py.hp ? (ex ? '#fff2b0' : warn ? (blink ? '#fff2b0' : '#ff7aa0') : '#d85a84') : '#3a1218';
      ctx.fillRect(lx - 3, ly - 3, 6, 6);
    }
    const nimg = ex ? (IMG.grim_node_live || IMG.grim_node_waking)
               : (warn || py.flash > 0) ? (IMG.grim_node_waking || IMG.grim_node_dormant)
               : IMG.grim_node_dormant;
    if (nimg) {
      const sc2 = 1 + beat * (ex ? 0.06 : 0.015);
      const nh = R * 2.2 * sc2, nw = nh * (nimg.width / nimg.height);
      ctx.drawImage(nimg, nx - nw / 2, ny - nh / 2, nw, nh);
      // every hit lands visibly: the whole node blanks white
      if (py.flash > 0) {
        const wimg = whiteOf(nimg);
        if (wimg) {
          ctx.globalAlpha = Math.min(1, py.flash / 160) * 0.9;
          ctx.drawImage(wimg, nx - nw / 2, ny - nh / 2, nw, nh);
          ctx.globalAlpha = 1;
        }
      }
    } else {
      ctx.fillStyle = ex ? '#e6aebb' : '#8d5468'; pixBlob(ctx, nx, ny, R);
      if (py.flash > 0) { ctx.fillStyle = '#ffffff'; pixBlob(ctx, nx, ny, R * 0.8); }
    }
    // cracks, one more per hit; light leaks through them when it opens
    const lost = 4 - py.hp;
    for (let i = 0; i < lost; i++) {
      const pts = py.cracks[i];
      ctx.beginPath(); ctx.moveTo(nx + pts[0][0] * R, ny + pts[0][1] * R);
      for (const [cx, cy] of pts) ctx.lineTo(nx + cx * R, ny + cy * R);
      ctx.strokeStyle = '#1a0d12'; ctx.lineWidth = 3; ctx.stroke();
      if (ex || warn) { ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
    // the glow, in step with the hull's lights, dimmer as it dies
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gk = (ex ? 0.55 : warn ? 0.3 : 0.08 + 0.06 * hullBeat) * (0.45 + 0.55 * hpK) * (0.75 + 0.25 * beat);
    const gR = R * (ex ? 2.1 : 1.6);
    const core = ctx.createRadialGradient(nx, ny, 0, nx, ny, gR);
    core.addColorStop(0, ex ? `rgba(255,244,210,${gk.toFixed(3)})` : `rgba(255,170,200,${gk.toFixed(3)})`);
    core.addColorStop(0.45, ex ? `rgba(255,170,90,${(gk * 0.6).toFixed(3)})` : `rgba(220,110,150,${(gk * 0.5).toFixed(3)})`);
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(nx, ny, gR, 0, 7); ctx.fill();
    ctx.restore();
    // live: gold target brackets snap round the housing
    if (ex && blink) {
      const d = Math.round(R * 1.6);
      ctx.fillStyle = '#fff2b0';
      for (const [sx2, sy2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const bx2 = Math.round(nx + sx2 * d), by2 = Math.round(ny + sy2 * d);
        ctx.fillRect(sx2 < 0 ? bx2 : bx2 - 10, by2 - 1, 10, 3);
        ctx.fillRect(bx2 - 1, sy2 < 0 ? by2 : by2 - 10, 3, 10);
      }
    }
    // on its last hit point it smokes and spits sparks
    if (py.hp === 1) {
      const ph = (now / 900 + py.off * 0.001) % 1;
      ctx.globalAlpha = ph < 0.5 ? 0.35 : 0.18; ctx.fillStyle = '#5a524c';
      pixBlob(ctx, nx + 8, ny - R - ph * 40, 5 + ph * 8);
      ctx.globalAlpha = 1;
      if (hn(Math.floor(now / 90) + py.off) > 0.7) { ctx.fillStyle = '#ffe08a'; ctx.fillRect(Math.round(nx - 12 + hn(now | 0) * 24) & ~3, Math.round(ny - R) & ~3, 4, 4); }
    }
  }
};

// v14.5 the guns, drawn: tells, beam, rockets (pixel sprite, hard flame,
// chunky smoke), bombs, and the little fireballs of rockets shot down.
ParleyBoss.prototype.drawAttacks = function (ctx, now, ox, oy) {
  const A = this.atk;
  const fight = this.phase === 'fight';
  // the two missile bays, part of the hull: closed plates until a volley
  if (fight) {
    const vol = A && A.k === 'volley' ? A : null;
    for (const s of [-1, 1]) {
      const bx = Math.round(ox + s * BAY_DX), by = Math.round(oy + BAY_DY);
      ctx.fillStyle = '#120c14'; ctx.fillRect(bx - 18, by - 12, 36, 24);
      ctx.fillStyle = '#1e1622'; ctx.fillRect(bx - 16, by - 10, 32, 20);
      const open = vol ? Math.min(1, vol.t / 300) : 0;
      if (vol) {
        // the loaded noses, one gone per launch from this side
        const left = s < 0 ? 3 - Math.ceil(vol.n / 2) : 3 - Math.floor(vol.n / 2);
        for (let i = 0; i < left; i++) {
          ctx.fillStyle = '#ffcf3a'; ctx.fillRect(bx - 12 + i * 9, by - 4, 6, 8);
          ctx.fillStyle = '#fff08a'; ctx.fillRect(bx - 12 + i * 9, by - 4, 6, 2);
        }
      }
      // hatch slides back
      const hw = Math.round(32 * (1 - open));
      ctx.fillStyle = '#463d4c'; ctx.fillRect(bx - 16, by - 10, hw, 20);
      ctx.fillStyle = '#7a6f84'; ctx.fillRect(bx - 16, by - 10, hw, 3);
      ctx.fillStyle = '#c8963c'; ctx.fillRect(bx - 18, by - 14, 36, 3);
      // warning lamp: blinks faster as the first launch nears
      const hot = vol && vol.t < VOLLEY_WIND + VOLLEY_N * VOLLEY_GAP;
      const rate = vol ? Math.max(40, 140 - vol.t / 6) : 0;
      ctx.fillStyle = hot && Math.floor(now / rate) % 2 === 0 ? '#ff3a2a' : '#4a1612';
      ctx.fillRect(bx - 3, by - 22, 6, 6);
    }
    // barrage: the belly hatch glows and every landing spot is marked on the dirt
    if (A && A.k === 'barrage') {
      const blink = Math.floor(now / 90) % 2 === 0;
      ctx.fillStyle = blink ? '#ff8a1e' : '#d8401c'; pixBlob(ctx, ox, oy + 70, 8);
      for (let i = A.n; i < A.tg.length; i++) {
        const x = Math.round(A.tg[i]);
        ctx.fillStyle = blink ? '#ff3a2a' : '#a01c14';
        ctx.fillRect(x - 8, GY - 12, 16, 4); ctx.fillRect(x - 4, GY - 8, 8, 4);
      }
    }
  }
  if (this.tellT > 0 && this.tellKind === 'laser') {   // aiming line from the belly emitter
    const pulse = 0.5 + 0.4 * Math.sin(now / 30);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,80,220,${(0.35 + 0.3 * pulse).toFixed(2)})`; ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = -now / 12;
    ctx.beginPath(); ctx.moveTo(ox, oy + 60); ctx.lineTo(this.tellTX, GY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,80,220,${pulse.toFixed(2)})`;
    pixBlob(ctx, this.tellTX, GY - 4, 8 + 6 * pulse);
    ctx.restore();
  }
  if (this.beam) { // the laser: a hot core inside a pink bloom, flaring in and dying out
    const bk = this.beam.t / this.beam.T;
    const wdt = bk < 0.25 ? bk / 0.25 : bk > 0.7 ? (1 - bk) / 0.3 : 1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,70,210,${(0.55 * wdt).toFixed(2)})`; ctx.lineWidth = 34 * wdt + 0.1;
    ctx.beginPath(); ctx.moveTo(ox, oy + 60); ctx.lineTo(this.beam.x, GY); ctx.stroke();
    ctx.strokeStyle = `rgba(255,235,250,${(0.95 * wdt).toFixed(2)})`; ctx.lineWidth = 9 * wdt + 0.1;
    ctx.beginPath(); ctx.moveTo(ox, oy + 60); ctx.lineTo(this.beam.x, GY); ctx.stroke();
    const gl = ctx.createRadialGradient(this.beam.x, GY - 6, 0, this.beam.x, GY - 6, 90 * wdt + 1);
    gl.addColorStop(0, 'rgba(255,240,250,0.9)'); gl.addColorStop(0.4, 'rgba(255,90,220,0.5)'); gl.addColorStop(1, 'rgba(255,90,220,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(this.beam.x, GY - 6, 90 * wdt + 1, 0, 7); ctx.fill();
    ctx.restore();
  }
  // rocket smoke: chunky pixel puffs, stepped opacity, no soft discs
  for (const q of this.smoke) {
    const k = q.t / q.T;
    if (k < 0) continue;
    ctx.globalAlpha = k < 0.3 ? 0.55 : k < 0.65 ? 0.34 : 0.16;
    ctx.fillStyle = k < 0.25 ? '#e8e0cc' : k < 0.6 ? '#b4ac9c' : '#7c766c';
    pixBlob(ctx, q.x, q.y - k * 14, (4 + k * 10) * q.s);
  }
  ctx.globalAlpha = 1;
  const spr = rocketSprite();
  const STEP = Math.PI / 16;
  for (const b of this.bolts) {
    if (b.k === 'missile') {
      // where it is going: a small blinking tick on the dirt
      if (Math.floor(now / 110 + b.id) % 2 === 0) { ctx.fillStyle = '#ff3a2a'; ctx.fillRect(Math.round(b.tx) - 6, GY - 6, 12, 3); }
      const cx = Math.cos(b.ang), cy = Math.sin(b.ang);
      const fl = hn(Math.floor(now / 45) * 31 + b.id * 131);
      const len = 1 + fl * 0.8;
      // exhaust: hard Metal Slug fire, flickering length
      ctx.fillStyle = '#d8401c'; pixBlob(ctx, b.x - cx * (30 + 12 * len), b.y - cy * (30 + 12 * len), 4 + fl * 3);
      ctx.fillStyle = '#ff8a1e'; pixBlob(ctx, b.x - cx * (24 + 6 * len), b.y - cy * (24 + 6 * len), 7);
      ctx.fillStyle = '#ffd23c'; pixBlob(ctx, b.x - cx * 20, b.y - cy * 20, 6);
      ctx.fillStyle = '#fff6c8'; pixBlob(ctx, b.x - cx * 17, b.y - cy * 17, 3);
      if (spr) {
        ctx.save(); ctx.translate(Math.round(b.x), Math.round(b.y)); ctx.rotate(Math.round(b.ang / STEP) * STEP);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(spr, -28, -13, 56, 26);
        ctx.restore();
      } else {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.ang);
        ctx.fillStyle = PAL.cheese; ctx.fillRect(-20, -6, 40, 12);
        ctx.restore();
      }
    } else { // bomb: a squat dark cylinder with a pink band and a stub fin, tumbling
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.ang);
      ctx.fillStyle = '#2b2a30'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 8, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = PAL.outline; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ff54d8'; ctx.fillRect(-3, -4, 6, 8);
      ctx.fillStyle = '#3d3c44'; ctx.fillRect(-19, -5, 7, 10);
      ctx.restore();
    }
  }
  // rockets shot out of the sky: a small hard fireball and flying scrap
  for (const q of this.pops) {
    const k = q.t / 420, tt = q.t / 1000;
    const x = q.x + q.vx * tt, y = q.y + q.vy * tt;
    pixFlame(ctx, x, y, 10 + k * 10, k, q.seed + now / 4);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + q.seed;
      const d = 6 + k * 46;
      ctx.fillStyle = i % 2 ? '#4a4452' : '#ffcf3a';
      ctx.fillRect(Math.round(x + Math.cos(a) * d) & ~1, Math.round(y + Math.sin(a) * d + k * k * 40) & ~1, 4, 4);
    }
  }
};

// ---------- headless autopilot (test harness only) ----------
export function parleyBot(rail) {
  if (rail.phase !== 'fight') return 0;
  let b = C.FIRE;
  // camp under ONE live pylon (stable target — don't jitter between targets
  // every frame, or the bot never dwells under any single pylon long enough
  // to catch its exposed window) until it's dead, then the shield, then the
  // boss center once it's down.
  let tx = rail.bx;
  if (rail.shieldUp) {
    const live = rail.pylons.find(py => py.alive);
    if (live) tx = rail.bx + live.dx;
  }
  if (rail.px < tx - 8) b |= C.R; else if (rail.px > tx + 8) b |= C.L;
  return b;
}
