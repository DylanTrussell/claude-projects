// Act III, part two: the road home was never a road — it's a river, then an ocean.
//  PTBoat — dodge the river banks, bow-gun the gunboats, depth-charge the mines,
//           until a raider torpedo finally puts a hole below the waterline.
//  Surf   — the boat's gone. You're on boards, riding the wave face, shooting
//           alien raiders and rats that surface right under you, out to the LZ.
// Same modal pattern as DoorGun/Skyraider: step(bits,dt,p) / render(ctx,now) / done.
import { CFG, C, PAL, W, H, BRANCHES } from './config.js';
import { IMG } from './assets.js';
import { RailBase } from './rails.js';
import { drawMuzzleBurst } from './render.js'; // v11.2: shared "real fire" burst, replaces the flat circle

const GY = 640;

// v13.13 -- THE SCANNER SHIP. It comes in low, takes your bow-gun fire and
// goes into the river ahead of you. It always goes down; you are already
// shooting, so there is no skill gate on it. This used to also be a
// player-steered fork (over the wreck's fin into the jungle, or around it to
// the surf) — the jungle route's cutscene never held up, so that choice is
// gone and the section always ends in the surf-out, same as before v13.11.
const DIVE_IN   = 1400;   // the ship comes down
const LANES_AT   = 2600;  // BRANCHES: the two lanes past it are readable from here
const COMMIT     = 5200;  // the reactor lets go (BRANCHES: your lane locks in)
const FORK_END   = 6600;  // cut to the film you earned
const RAMP_Y     = 250;   // the wreck sits up-river; BRANCHES: steer above this line to take it
const RAMP_BAND  = 130;   // BRANCHES: how close to RAMP_Y counts as hitting it

function aabb(ax, ay, bx, by, r) { return Math.abs(ax - bx) < r && Math.abs(ay - by) < r; }

// v14.3 co-op: Charlie's rounds are hot orange, Whiskers' stay pale yellow,
// so each player can follow their own stream in a busy river.
const P2_TRACER = '#ff8a2a';
// his aim, shown not told: a short cheese-coloured sight line off the barrel
// and a ring reticle where the stream is heading.
function drawP2Aim(ctx, m, aim, fireT, now) {
  const ca = Math.cos(aim), sa = Math.sin(aim);
  ctx.save();
  ctx.globalAlpha = 0.55 + 0.2 * Math.sin(now / 160);
  ctx.strokeStyle = PAL.cheese; ctx.lineWidth = 2;
  ctx.setLineDash([10, 9]); ctx.lineDashOffset = -(now / 30) % 19;
  ctx.beginPath(); ctx.moveTo(m.x + ca * 24, m.y + sa * 24); ctx.lineTo(m.x + ca * 250, m.y + sa * 250); ctx.stroke();
  ctx.setLineDash([]);
  const rx = m.x + ca * 300, ry = m.y + sa * 300;
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = PAL.outline; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(rx, ry, 15, 0, 7); ctx.stroke();
  ctx.strokeStyle = PAL.cheese; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(rx, ry, 15, 0, 7); ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const t2 = i * Math.PI / 2 + now / 900;
    ctx.beginPath(); ctx.moveTo(rx + Math.cos(t2) * 9, ry + Math.sin(t2) * 9); ctx.lineTo(rx + Math.cos(t2) * 22, ry + Math.sin(t2) * 22); ctx.stroke();
  }
  ctx.restore();
  if (fireT > 0) drawMuzzleBurst(ctx, m.x, m.y, aim, fireT / 70);
}

// v14.3 co-op: a hit on one cat's OWN body (Surf, and Grimtail in boss2.js).
// Each player pays from their own hp/lives; the section only fails once both
// are out. T carries that body's i-frame timer (the rail itself for P1).
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

// v13.4, rebuilt from scratch (Dylan: "it doesn't look like water. It just
// looks like a boat with some cut-off water bullshit... Make it look realistic
// and awesome. Don't have any cut-off, lazy feathering with lines in it. It
// should look like waves and shimmering water.") The old version was a flat
// gradient with 14 dashed lines. This one builds an actual river:
//   - dusk sky with a low sun and a far-bank jungle silhouette
//   - water in PERSPECTIVE: swell bands that widen and speed up toward the
//     camera, each a continuous sinusoidal ribbon (no cut-off segments)
//   - crest highlights and foam flecks riding the swells
//   - a shimmering sun-glint column that flickers on the chop
//   - fast dark foreground streaks for speed
function drawWater(ctx, scroll, tint, now) {
  now = now || 0;
  const HOR = H * 0.26;
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, HOR);
  sky.addColorStop(0, '#5c4a3a'); sky.addColorStop(1, '#8a6a48');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, HOR);
  // low sun + glow
  const sunX = W * 0.68;
  const sg = ctx.createRadialGradient(sunX, HOR - 26, 4, sunX, HOR - 26, 130);
  sg.addColorStop(0, 'rgba(255,225,170,0.95)'); sg.addColorStop(0.25, 'rgba(255,190,120,0.4)'); sg.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sunX, HOR - 26, 130, 0, 7); ctx.fill();
  // far-bank jungle silhouette, two parallax rows
  for (const [spd, hgt, col] of [[6, 26, '#2c3a22'], [11, 38, '#1f2c18']]) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, HOR);
    for (let x = 0; x <= W; x += 24) {
      const n = Math.sin((x + scroll * spd) * 0.013) + Math.sin((x + scroll * spd) * 0.037 + 2);
      ctx.lineTo(x, HOR - hgt * 0.4 - n * hgt * 0.3);
    }
    ctx.lineTo(W, HOR); ctx.closePath(); ctx.fill();
  }
  // water body
  const grd = ctx.createLinearGradient(0, HOR, 0, H);
  grd.addColorStop(0, '#5c6e5a');                       // sky reflection at the horizon
  grd.addColorStop(0.22, tint || '#2a6f6b');
  grd.addColorStop(1, '#12333a');
  ctx.fillStyle = grd; ctx.fillRect(0, HOR, W, H - HOR);
  // swell bands in perspective: near bands are taller, faster, more displaced
  for (let b2 = 0; b2 < 6; b2++) {
    const k = b2 / 5;                                    // 0 far .. 1 near
    const yBase = HOR + 14 + Math.pow(k, 1.6) * (H - HOR - 20);
    const amp = 2 + k * 13;
    const wl = 190 - k * 60;                             // wavelength tightens slightly
    const phase = scroll * (26 + k * 150) + now / (900 - k * 550) * wl;
    ctx.beginPath();
    ctx.moveTo(-20, yBase);
    for (let x = -20; x <= W + 20; x += 16) {
      const yv = Math.sin((x + phase) / wl * Math.PI * 2) * amp
               + Math.sin((x + phase * 1.7) / (wl * 0.43) * Math.PI * 2) * amp * 0.35;
      ctx.lineTo(x, yBase + yv);
    }
    ctx.lineTo(W + 20, H + 40); ctx.lineTo(-20, H + 40); ctx.closePath();
    ctx.fillStyle = `rgba(10,30,34,${(0.10 + k * 0.10).toFixed(2)})`;   // trough shading
    ctx.fill();
    // crest highlight: stroke the same ribbon's top edge
    ctx.beginPath();
    for (let x = -20; x <= W + 20; x += 16) {
      const yv = Math.sin((x + phase) / wl * Math.PI * 2) * amp
               + Math.sin((x + phase * 1.7) / (wl * 0.43) * Math.PI * 2) * amp * 0.35;
      if (x === -20) ctx.moveTo(x, yBase + yv - 1.5); else ctx.lineTo(x, yBase + yv - 1.5);
    }
    ctx.strokeStyle = `rgba(190,225,215,${(0.10 + k * 0.14).toFixed(2)})`;
    ctx.lineWidth = 1.5 + k * 1.5;
    ctx.stroke();
    // foam flecks on the near crests
    if (k > 0.4) {
      ctx.fillStyle = `rgba(225,240,235,${(0.18 + k * 0.2).toFixed(2)})`;
      for (let i = 0; i < 7; i++) {
        const fx = ((i * 197 + phase * 1.3) % (W + 60)) - 30;
        const fy = yBase + Math.sin((fx + phase) / wl * Math.PI * 2) * amp - 2;
        ctx.fillRect(fx, fy, 5 + k * 6, 2);
      }
    }
  }
  // sun-glint column: shimmering dashes under the sun, dense near the horizon
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const gk = i / 26;
    const gy = HOR + 6 + Math.pow(gk, 1.5) * (H - HOR) * 0.75;
    const spread = 40 + gk * 260;
    const gx = sunX + Math.sin(i * 13.7 + now / (240 + i * 17)) * spread * 0.5;
    const tw = 0.25 + 0.75 * Math.abs(Math.sin(now / (160 + i * 23) + i * 2.6));
    ctx.fillStyle = `rgba(255,220,160,${(0.05 + 0.13 * tw * (1 - gk * 0.5)).toFixed(3)})`;
    ctx.fillRect(gx - (8 + gk * 26) / 2, gy, 8 + gk * 26, 1.5 + gk * 1.5);
  }
  ctx.restore();
  // foreground rush: fast dark streaks closest to camera
  ctx.strokeStyle = 'rgba(8,24,28,0.35)'; ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const fx = W - ((scroll * 480 + i * 300) % (W + 340)) + 170;
    const fy = H - 60 + (i % 3) * 20;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 120, fy + 4); ctx.stroke();
  }
}

// ============================ PT BOAT ============================
export class PTBoat extends RailBase {
  constructor() {
    super(78000, 42);           // v13.5: 78s ceiling; good bot lands 48 over the full run           // v13.5 +50% (Dylan); quota scaled -- bot manages ~34-40 in this span
    this.py = 340;              // position across the river (near bank <-> far bank)
    this.gunCd = 0; this.chargeCd = 0; this.charges = 6;
    this.mines = []; this.depth = []; this.started = false;
    this.wake = 0;
    this.flyby = null; this.flybySpawned = false; // boss_ship_1 background tension beat, see below
    this.fork = null;           // the wreck sequence that ends the section
    this.route = null;          // always 'surf' once the section ends
  }
  // v14.3 co-op: Charlie rides the fuel drum on the tow line and mans his own
  // AK with his own aim (UP/DOWN swings the barrel, FIRE shoots). The boat is
  // one shared hull, so damage stays pooled through RailBase.hurt.
  p2Muzzle(bob) {
    const c = this.c2, tilt = c.aim * 0.35, pvx = 92, pvy = this.py + 112 + (bob || 0);
    const ox = 62, oy = -35;                       // the painted AK muzzle, from the drum's base
    return { x: pvx + ox * Math.cos(tilt) - oy * Math.sin(tilt), y: pvy + ox * Math.sin(tilt) + oy * Math.cos(tilt), tilt };
  }
  step(bits, dt, p, bits2, p2) {
    if (this.done) return;
    this.stepCommon(dt, p);
    if (p2) this._p2 = p2;
    const q2 = this._p2;
    // P1 ran dry but Charlie still has lives: he leaves the drum and takes the wheel
    const helmP2 = !!(q2 && q2.st !== 'out' && p.st === 'out');
    if (helmP2) bits = bits2 || 0;
    const gun2 = !!(q2 && q2.st !== 'out' && !helmP2);
    const dts = dt / 1000;
    this.scroll += dts;
    this.gunCd -= dt; this.chargeCd -= dt;
    this.wake += dts;
    if (!this.started) { this.started = true; this.ev({ e: 'banner', k: 'actRiver' }); this.ev({ e: 'hint', k: 'riverControls' }); this.ev({ e: 'engine', on: true }); }

    // steer across the river width, dodging mines and gunboat lanes
    if (bits & C.UP) this.py -= 300 * dts;
    if (bits & C.DOWN) this.py += 300 * dts;
    this.py = Math.max(140, Math.min(560, this.py));

    // spawn: floating mines, rat gunboats, alien raider speedboats, the odd surfacing diver
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 750 + Math.random() * 750;
      const r = Math.random();
      if (r < 0.35) this.mines.push({ x: W + 80, y: 160 + Math.random() * 400, hp: 1, ph: Math.random() * 6 });
      else if (r < 0.65) this.foes.push({ k: 'gunboat', x: W + 100, y: 200 + Math.random() * 300, hp: 3, cd: 1100 + Math.random() * 500 });
      else if (r < 0.88) this.foes.push({ k: 'raider', x: W + 120, y: 220 + Math.random() * 280, hp: 2, ph: Math.random() * 6 });
      else this.foes.push({ k: 'diver', x: W + 60, y: this.py + (Math.random() - 0.5) * 160, hp: 1, t: 0, up: false });
    }

    // bow gun: J
    if ((bits & C.FIRE) && this.gunCd <= 0) {
      this.gunCd = 105; this.fireT = 70;
      this.ev({ e: 'sfx', n: 'sfx_shot' });
      this.shots.push({ x: 300, y: this.py - 8, vx: 900, vy: 0, t: 1000 });
    }
    if (gun2) {
      const c = this.c2 || (this.c2 = { aim: -0.25, gunCd: 0, fireT: 0 });
      c.gunCd -= dt; c.fireT -= dt;
      if (bits2 & C.UP) c.aim -= 1.7 * dts;
      if (bits2 & C.DOWN) c.aim += 1.7 * dts;
      c.aim = Math.max(-0.75, Math.min(0.5, c.aim));
      if ((bits2 & C.FIRE) && c.gunCd <= 0) {
        c.gunCd = 115; c.fireT = 70;
        this.ev({ e: 'sfx', n: 'sfx_shot' });
        const m = this.p2Muzzle(), a = c.aim;
        this.shots.push({ x: m.x, y: m.y, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, t: 1150, p2: 1 });
      }
    }
    // v13.5: diver torpedoes carry vy but this line never integrated it, so
    // every aimed enemy shot flew dead flat regardless of aim
    for (const s of this.shots) { s.x += s.vx * dts; s.y += (s.vy || 0) * dts; s.t -= dt; }
    this.shots = this.shots.filter(s => s.t > 0);

    // depth charge: K — lobs forward, arcs into the water, radius blast on mines/divers
    if ((bits & C.GREN) && !(this.prevBits & C.GREN)) {
      if (this.charges > 0 && this.chargeCd <= 0) {
        this.charges--; this.chargeCd = 650;
        this.depth.push({ x: 300, y: this.py, vx: 460, vy: -160, t: 0 });
        this.ev({ e: 'sfx', n: 'sfx_meow' });
      } else if (this.charges <= 0) this.ev({ e: 'banner', k: 'chargesOut' });
    }
    for (const dcn of this.depth) {
      dcn.t += dt; dcn.x += dcn.vx * dts; dcn.y += dcn.vy * dts; dcn.vy += 780 * dts;
      if (dcn.t > 900) { // detonates on timer — reads as a depth charge sinking then blowing
        dcn.dead = true;
        this.boom(dcn.x, dcn.y, 1);
        for (const m of this.mines) if (aabb(m.x, m.y, dcn.x, dcn.y, 130)) m.hp = 0;
        for (const f of this.foes) if (f.k === 'diver' && aabb(f.x, f.y, dcn.x, dcn.y, 130)) f.hp = 0;
      }
    }
    this.depth = this.depth.filter(dcn => !dcn.dead && dcn.t < 900);

    // mines: bob in place, ram = hurt
    for (const m of this.mines) {
      m.x -= 170 * dts; m.ph += dts * 2;
      m.y += Math.sin(m.ph) * 12 * dts;
      if (aabb(m.x, m.y, 260, this.py, 56)) { m.hp = 0; this.boom(m.x, m.y, 1); this.hurt(p, 2); }
      for (const s of this.shots) if (s.t > 0 && aabb(s.x, s.y, m.x, m.y, 40)) { m.hp = 0; s.t = 0; this.boom(m.x, m.y, 0); }
    }
    this.mines = this.mines.filter(m => m.hp > 0 && m.x > -80);

    // foes
    for (const f of this.foes) {
      if (f.k === 'gunboat') {
        f.x -= 150 * dts; f.cd -= dt;
        if (f.cd <= 0 && f.x > 260 && f.x < W) { f.cd = 950; this.shots.push({ x: f.x, y: f.y, vx: -640, vy: 0, t: 1200, foe: true }); this.ev({ e: 'sfx', n: 'sfx_laser' }); }
      } else if (f.k === 'raider') {
        f.x -= 260 * dts; f.ph += dts * 3;
        f.y += Math.sin(f.ph) * 60 * dts;
        if (aabb(f.x, f.y, 260, this.py, 60)) { f.hp = 0; this.boom(f.x, f.y, 0); this.hurt(p, 1); }
      } else if (f.k === 'diver') {
        // v13.5 (Dylan: "You got completely rid of the scuba rats. I think
        // there's some kind of place for them. You just have to make them more
        // menacing and have them actually do something.") They were never
        // gone -- they just did NOTHING but drift and ram. Now the periscope-up
        // window means a TORPEDO: slow, aimed, visible wake, dodgeable, and
        // exactly what a depth charge is for.
        f.t += dt; f.x -= 130 * dts;
        f.up = (f.t % 1400) < 700; // periscopes up to shoot, ducks back under
        f.cd = (f.cd || 900) - dt;
        if (f.up && f.cd <= 0 && f.x > 300 && f.x < W) {
          f.cd = 1700 + Math.random() * 600;
          const dy = this.py - f.y;
          this.shots.push({ x: f.x, y: f.y, vx: -420, vy: Math.max(-140, Math.min(140, dy * 0.6)), t: 2400, foe: true, torp: true });
          this.ev({ e: 'sfx', n: 'sfx_reload' });
        }
        if (f.up && aabb(f.x, f.y, 260, this.py, 54)) { f.hp = 0; this.boom(f.x, f.y, 0); this.hurt(p, 1); }
      }
      for (const s of this.shots) {
        if (s.foe || s.t <= 0) continue;
        const hy = f.k === 'gunboat' ? f.y : f.y;
        if (aabb(s.x, s.y, f.x, hy, 44)) {
          if (f.k === 'diver' && !f.up) continue; // submerged — can't be hit topside
          f.hp--; s.t = 0;
          if (s.p2) this.p2Hits = (this.p2Hits || 0) + 1;
          if (f.hp <= 0) { this.kills++; if (s.p2) this.p2Kills = (this.p2Kills || 0) + 1; this.boom(f.x, f.y - 10, f.k !== 'diver'); this.ev({ e: 'fpsKill' }); }
        }
      }
    }
    this.foes = this.foes.filter(f => f.hp > 0 && f.x > -140);
    // enemy tracers heading back at the boat
    for (const s of this.shots) if (s.foe && aabb(s.x, s.y, 260, this.py, 46)) { s.t = 0; this.hurt(p, 1); }
    this.shots = this.shots.filter(s => s.t > 0);

    // boss_ship_1 (the bulbous purple/checkered Dune-style flagship, generated in v9,
    // never placed): a slow, silent, non-interactive silhouette crossing high overhead —
    // "sighted, not yet a fight" tension per the standing backlog recommendation. Purely
    // atmospheric — no collision, no combat — it just tells the player something much
    // bigger than a gunboat is out there.
    // v13.5 (Dylan: "The spaceship is still showing up on some frames in the
    // water level, which is weird. You can do a flyby.") The old version was a
    // 48-second half-transparent crawl -- slow enough to read as a rendering
    // glitch rather than an event. Now it is a deliberate 11s cinematic pass:
    // sweep in from the right, a menacing dwell mid-sky, then punch off the
    // left edge, banking through the turn, with its shadow crossing the water.
    if (!this.flybySpawned && this.t > 17000) {
      this.flybySpawned = true;
      this.flyby = { t: 0 };
      this.ev({ e: 'sfx', n: 'sfx_ufo' });
    }
    if (this.flyby) {
      this.flyby.t += dt;
      if (this.flyby.t > 7500) this.flyby = null;
    }

    // v13.13 -- THE WRECK. See the constants at the top of this file.
    if (!this.fork && this.ended()) {
      this.fork = { t: 0 };
      this.ev({ e: 'sfx', n: 'sfx_ufo' });
    }
    if (this.fork) {
      this.fork.t += dt;
      const k = this.fork.t;
      // free movement while the ship comes down, just for feel — it no
      // longer decides anything
      if (k < COMMIT) {
        if (bits & C.UP) this.py -= 300 * dts;
        if (bits & C.DOWN) this.py += 300 * dts;
        this.py = Math.max(140, Math.min(560, this.py));
      }
      if (k > DIVE_IN && !this.fork.down) {
        this.fork.down = 1;
        this.shake = 20;
        this.ev({ e: 'sfx', n: 'sfx_explosion' });
        this.ev({ e: 'shake' });
      }
      // lock the lane in once, at the commit point, so the outcome cannot
      // flicker on the last frame. Only the BRANCHES build has a ramp lane.
      if (k > COMMIT && this.fork.ramp === undefined) {
        this.fork.ramp = BRANCHES && Math.abs(this.py - RAMP_Y) < RAMP_BAND ? 1 : 0;
        this.shake = 26;
        this.ev({ e: 'sfx', n: 'sfx_explosion' });
        this.ev({ e: 'shake' });
      }
      if (k > FORK_END) {
        this.done = true;
        this.route = this.fork.ramp ? 'jungle' : 'surf';   // main.js reads this
      }
      this.prevBits = bits;
      return;
    }
    this.prevBits = bits;
  }

  render(ctx, now) {
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save(); ctx.translate(sx, 0);
    drawWater(ctx, this.scroll, '#2a6f6b', now);
    // boss_ship_1 -- the flyby. v13.14 (Dylan: "the spaceship flying over the
    // boat level looks awful... it swoops in low"). It was 250px tall parked
    // at the horizon for a 3.5s dwell, flying backwards. Now it is one
    // continuous pass at altitude: half the size, high in the sky band, nose
    // first, banking through, with its shadow racing over the water far below
    // and a contrail behind it. It crosses; it does not hover.
    if (this.flyby) {
      const k = Math.min(1, this.flyby.t / 7500);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const fx = -360 + ((W + 260) - (-360)) * e;
      const fy = 62 + Math.sin(k * Math.PI) * 14 + Math.sin(now / 900) * 3;
      const tilt = -0.07 + 0.14 * e;
      const img = IMG.boss_ship_1;
      const fh = 118, fw = img ? fh * (img.width / img.height) : fh * 1.5;
      // the shadow, far below on the swells -- the height read
      ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = '#06100e';
      ctx.beginPath(); ctx.ellipse(fx - 90, 330 + Math.sin(now / 500) * 4, fw * 0.28, 9, 0, 0, 7); ctx.fill();
      ctx.restore();
      // engine glow and the contrail it leaves
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const tr = ctx.createLinearGradient(fx - fw * 0.4, 0, fx - fw * 0.4 - 420, 0);
      tr.addColorStop(0, 'rgba(210,230,220,0.28)'); tr.addColorStop(1, 'rgba(210,230,220,0)');
      ctx.fillStyle = tr; ctx.fillRect(fx - fw * 0.4 - 420, fy - 7, 420, 14);
      for (let i = 0; i < 3; i++) {
        const gx2 = fx - fw * 0.42, gy2 = fy + (i - 1) * 12;
        const gl = ctx.createRadialGradient(gx2, gy2, 0, gx2, gy2, 16);
        gl.addColorStop(0, 'rgba(200,255,170,0.7)'); gl.addColorStop(1, 'rgba(120,255,90,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(gx2, gy2, 16, 0, 7); ctx.fill();
      }
      ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.96; ctx.translate(fx, fy); ctx.rotate(tilt);
      if (img) ctx.drawImage(img, -fw / 2, -fh / 2, fw, fh);
      else { ctx.fillStyle = '#2a2233'; ctx.beginPath(); ctx.ellipse(0, 0, fw / 2, fh / 2.6, 0, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    // mines
    for (const m of this.mines) {
      const img = IMG.river_mine;
      if (img) { const h2 = 46, w2 = h2 * (img.width / img.height); ctx.drawImage(img, m.x - w2 / 2, m.y - h2 / 2, w2, h2); }
      else { ctx.fillStyle = '#20201c'; ctx.beginPath(); ctx.arc(m.x, m.y, 20, 0, 7); ctx.fill(); ctx.fillStyle = PAL.redAccent; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; ctx.fillRect(m.x + Math.cos(a) * 20 - 2, m.y + Math.sin(a) * 20 - 2, 5, 5); } }
    }
    // foes
    for (const f of this.foes) {
      let img = f.k === 'gunboat' ? IMG.rat_gunboat : f.k === 'raider' ? IMG.alien_raider_boat : (f.up ? IMG.rat_diver : null);
      if (img) { const h2 = f.k === 'diver' ? 58 : 76; const w2 = h2 * (img.width / img.height); ctx.drawImage(img, f.x - w2 / 2, f.y - h2 / 2, w2, h2); }
      else if (f.k !== 'diver' || f.up) {
        ctx.fillStyle = f.k === 'raider' ? PAL.teal : PAL.mud1;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, 44, 20, 0, 0, 7); ctx.fill();
      }
    }
    // depth charges
    ctx.fillStyle = PAL.khakiDark;
    for (const dcn of this.depth) { ctx.beginPath(); ctx.arc(dcn.x, dcn.y, 9, 0, 7); ctx.fill(); }
    // tracers -- torpedoes get a body and a bubble wake so the diver threat reads
    for (const s of this.shots) {
      if (s.torp) {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy || 0, s.vx));
        ctx.fillStyle = PAL.outline; ctx.fillRect(-16, -4, 32, 8);
        ctx.fillStyle = PAL.acid; ctx.fillRect(-16, -2, 6, 4); // glowing motor
        ctx.restore();
        ctx.fillStyle = 'rgba(220,240,235,0.55)';
        for (let bi2 = 0; bi2 < 3; bi2++) {
          const bx2 = s.x - 22 - bi2 * 14 - (now / 40 + bi2 * 17) % 12;
          ctx.beginPath(); ctx.arc(bx2, s.y - 3 + Math.sin(now / 90 + bi2 * 2.1) * 4, 3 - bi2 * 0.6, 0, 7); ctx.fill();
        }
        continue;
      }
      ctx.strokeStyle = s.foe ? PAL.ray : s.p2 ? P2_TRACER : PAL.tracer; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); ctx.stroke();
    }
    // v13.9 -- Charlie came down the river too, riding a fuel drum off the
    // boat's quarter. Same standing rule as the surf and the parley: after the
    // truce he is in the scene, not waiting offscreen for the next cutscene.
    const cdi = IMG.charlie_tank;
    const q2 = this._p2, gun2 = !!(q2 && q2.st !== 'out' && this.c2 && !(this._p && this._p.st === 'out'));
    if (cdi && !this.kill) {
      const cb = Math.sin(now / 300 + 2.2) * 7;
      const dh = 96, dw = dh * (cdi.width / cdi.height);
      ctx.save();
      ctx.globalAlpha = 0.95;
      if (gun2) { // co-op: he leans into his aim, pivoting on the drum
        const m = this.p2Muzzle(cb);
        ctx.translate(92, this.py + 112 + cb); ctx.rotate(m.tilt); ctx.translate(-92, -(this.py + 112 + cb));
      }
      ctx.drawImage(cdi, 92 - dw / 2, this.py + 96 - dh / 2 + cb, dw, dh);
      ctx.restore();
      if (gun2) drawP2Aim(ctx, this.p2Muzzle(cb), this.c2.aim, this.c2.fireT, now);
      // his own wake, so he reads as moving with the current and not pasted on
      ctx.strokeStyle = 'rgba(220,240,235,0.35)'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(92 - dw / 2 - i * 16, this.py + 122 + cb + Math.sin(this.wake * 4 + i) * 3);
        ctx.lineTo(92 - dw / 2 - 18 - i * 16, this.py + 126 + cb); ctx.stroke();
      }
    }
    // the boat
    const bi = IMG.ptboat_vehicle;
    const bob = Math.sin(now / 260) * 6;
    if (bi) {
      const bh = 150, bw = bh * (bi.width / bi.height);
      ctx.drawImage(bi, 220 - bw / 2, this.py - bh / 2 + bob, bw, bh);
    } else {
      ctx.fillStyle = PAL.khaki; ctx.fillRect(150, this.py - 30 + bob, 160, 60);
      ctx.fillStyle = PAL.khakiDark; ctx.fillRect(150, this.py - 30 + bob, 160, 14);
    }
    // wake trail
    ctx.strokeStyle = 'rgba(220,240,235,0.5)'; ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(150 - i * 22, this.py + 24 + bob + Math.sin(this.wake * 4 + i) * 4);
      ctx.lineTo(120 - i * 22, this.py + 30 + bob); ctx.stroke();
    }
    if (this.fireT > 0) drawMuzzleBurst(ctx, 300, this.py - 8 + bob, 0, this.fireT / 70); // v11.2: real fire burst
    this.drawBooms(ctx);
    // v13.9 -- scan, lock, burn. Drawn over the boat so the beam lands ON it.
    if (this.fork) this.drawFork(ctx, now);
    if (this.hurtT > 0) { ctx.fillStyle = `rgba(160,20,10,${Math.min(0.4, this.hurtT / 1200)})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(W / 2 - 200, 14, 400, 10);
    ctx.fillStyle = PAL.cheese; ctx.fillRect(W / 2 - 200, 14, 400 * Math.min(1, this.t / this.dur), 10);
    ctx.font = 'bold 20px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = PAL.boom2;
    ctx.fillText('CHARGES ' + '▮'.repeat(this.charges), 24, 86);
  }

  // v13.13 -- THE WRECK, drawn. The ship comes down and settles across the
  // channel, fin up out of the water, before the reactor takes your stern.
  drawFork(ctx, now) {
    const k = this.fork.t;

    // --- the ship coming down ---
    // v13.12: it took your bow gun on the way in, so it arrives already hurt
    // and settles as a burnt-out wreck. Standing rule: everything that takes
    // damage visibly reacts, and this was the one thing in the scene that
    // soaked fire without changing.
    const hull = IMG.alien_scanship_hurt || IMG.alien_scanship;
    const hh = 190, hw = hull ? hh * (hull.width / hull.height) : 380;
    // v13.14: the descent used to run 1.2s PAST the impact, so the diving hull
    // and the settled wreck were on screen together, two ships apart. The hull
    // now flies until the moment the wreck appears, and not one frame after.
    if (k < DIVE_IN) {
      const e = Math.min(1, k / DIVE_IN);
      const sx2 = W + 260 + (620 - (W + 260)) * e;
      const sy2 = 120 + Math.pow(e, 2.2) * (RAMP_Y - 120);
      // fire streaming off it, laid along the path behind it
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 8; i++) {
        const ph = ((now / 180) + i * 0.33) % 1;
        ctx.globalAlpha = 0.5 * (1 - ph) * (0.3 + e);
        ctx.fillStyle = i % 3 === 0 ? '#fff0b0' : i % 3 === 1 ? '#ff9a3c' : '#ff5a1e';
        ctx.beginPath(); ctx.arc(sx2 + 40 + i * 26 + ph * 90, sy2 - 30 - i * 9 - ph * 40, 8 + ph * 16, 0, 7); ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.translate(sx2, sy2);
      ctx.rotate(e * 0.55);                          // nose over as it augers in
      if (hull) ctx.drawImage(hull, -hw / 2, -hh / 2, hw, hh);
      ctx.restore();
      // the smoke it trails
      for (let i = 0; i < 6; i++) {
        const ph = ((now / 260) + i * 0.4) % 1;
        ctx.globalAlpha = 0.45 * (1 - ph) * e;
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath(); ctx.arc(sx2 + 60 + i * 34 + ph * 120, sy2 - 10 - i * 14 - ph * 50, 10 + ph * 22, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // --- the wreck, once it is down: hull in the water, fin up as the ramp ---
    if (k > DIVE_IN) {
      const set = Math.min(1, (k - DIVE_IN) / 900);
      const wy = RAMP_Y;
      // spray on impact
      if (set < 1) {
        ctx.save(); ctx.globalAlpha = (1 - set) * 0.8;
        ctx.fillStyle = 'rgba(220,240,235,0.9)';
        for (let i = 0; i < 16; i++) {
          const a2 = (i / 16) * Math.PI * 2;
          const r2 = 40 + set * 260;
          ctx.beginPath(); ctx.arc(620 + Math.cos(a2) * r2, wy + Math.sin(a2) * r2 * 0.4, 12 * (1 - set), 0, 7); ctx.fill();
        }
        ctx.restore();
      }
      // the half-sunk hull, burnt out now rather than merely damaged
      const dead = IMG.alien_scanship_wreck || hull;
      const dw = dead ? hh * (dead.width / dead.height) : hw;
      ctx.save();
      ctx.globalAlpha = set;
      ctx.translate(620, wy + 28);
      ctx.rotate(0.16);
      if (dead) ctx.drawImage(dead, -dw / 2, -hh / 2, dw, hh * 0.72);
      ctx.restore();
      // (v13.14: the flat pale "fin" wedge that used to be drawn here was the
      // ramp cue for the removed fork -- a beige triangle pasted on the wreck.
      // Gone. The wreck art carries the shape.)
      // fires on the wreck
      for (let i = 0; i < 7; i++) {
        const ph = ((now / 340) + i * 0.4) % 1;
        ctx.globalAlpha = 0.55 * (1 - ph) * set;
        ctx.fillStyle = i % 3 === 0 ? '#8CFF3B' : '#ff9a3c';
        ctx.beginPath(); ctx.arc(600 + i * 34, wy + 30 - ph * 90, 8 + ph * 15, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // --- BRANCHES: the two lanes, while the choice is still open ---
    if (BRANCHES && k > LANES_AT && k < COMMIT) {
      const pulse = 0.45 + 0.3 * Math.sin(now / 190);
      const onRamp = Math.abs(this.py - RAMP_Y) < RAMP_BAND;
      ctx.save();
      ctx.globalAlpha = onRamp ? pulse + 0.25 : pulse * 0.5;
      ctx.strokeStyle = '#FFC93C'; ctx.lineWidth = onRamp ? 5 : 3;
      ctx.setLineDash([26, 18]); ctx.lineDashOffset = -(now / 22) % 44;
      ctx.beginPath(); ctx.moveTo(260, RAMP_Y); ctx.lineTo(540, RAMP_Y); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = onRamp ? pulse * 0.5 : pulse + 0.25;
      ctx.strokeStyle = '#7fd8ff'; ctx.lineWidth = onRamp ? 3 : 5;
      ctx.setLineDash([26, 18]); ctx.lineDashOffset = -(now / 22) % 44;
      ctx.beginPath(); ctx.moveTo(260, 470); ctx.lineTo(760, 470); ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);
    }
    // --- BRANCHES, committed to the ramp: the boat pitches and climbs ---
    if (this.fork.ramp === 1) {
      const j = Math.min(1, (k - COMMIT) / (FORK_END - COMMIT));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * j;
      ctx.fillStyle = 'rgba(255,230,180,0.9)';
      ctx.beginPath(); ctx.ellipse(220 + j * 300, this.py - j * 210, 140, 46, -0.5, 0, 7); ctx.fill();
      ctx.restore();
    }
    // --- the reactor lets go as you draw level ---
    if (k > COMMIT && this.fork.ramp !== 1) {
      const j = Math.min(1, (k - COMMIT) / 500);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g2 = ctx.createRadialGradient(600, RAMP_Y + 20, 0, 600, RAMP_Y + 20, 200 + j * 460);
      g2.addColorStop(0, `rgba(230,255,220,${0.95 * (1 - j * 0.5)})`);
      g2.addColorStop(0.4, `rgba(140,255,90,${0.6 * (1 - j * 0.5)})`);
      g2.addColorStop(1, 'rgba(140,255,90,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(600, RAMP_Y + 20, 200 + j * 460, 0, 7); ctx.fill();
      ctx.restore();
    }

    // white-out into whichever film you earned
    if (k > FORK_END - 800) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (k - (FORK_END - 800)) / 800).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

// ============================ SURF ============================
// The boat's gone. Boards under your feet, wave rolling east toward the LZ.
export class Surf extends RailBase {
  constructor() {
    super(65000, 52);           // v13.5: 65s ceiling; good bot lands 60 over the full run           // v13.5 +50% (Dylan); quota scaled with the longer ride
    this.py = 340; this.dive = 0; this.diveCd = 0;
    this.gunCd = 0; this.started = false;
  }
  // ---- v14.3 co-op: Charlie is P2 on his own board ----
  // The surfing Charlie who used to ride along as scenery IS player two: own
  // lane on the wave (UP/DOWN, a little L/R), own AK (FIRE), own duck-dive
  // (GREN), own hits and lives. Out of lives, his board leaves the wave until
  // the partner brings him back.
  ensureC2() {
    if (!this.c2) this.c2 = { x: 96, y: this.py - 54, dive: 0, diveCd: 0, gunCd: 0, fireT: 0, hurtT: 0, prev: 0 };
    return this.c2;
  }
  coopJoin(q) { super.coopJoin(q); this.ensureC2(); }
  coopRevive(q) {
    super.coopRevive(q);
    if (q === this._p2) { const c = this.ensureC2(); c.hurtT = 2200; c.dive = 0; }
    else this.hurtT = 2200;
  }
  hurt(p, amt) {
    const q2 = this._p2;
    if (!q2) return super.hurt(p, amt);               // solo: unchanged
    if (p === q2) { const c = this.ensureC2(); return bodyHurt(this, q2, amt, c, this._p, c.x, c.y); }
    return bodyHurt(this, p, amt, this, q2, 220, this.py);
  }
  // which cat a raider/diver is after: Whiskers solo, either one in co-op
  pickTarget(on1, on2) { return on1 && on2 ? (Math.random() < 0.5 ? 1 : 2) : on2 ? 2 : 1; }
  targetY(f, on1, on2) {
    if (!f.tgt || (f.tgt === 2 && !on2) || (f.tgt === 1 && !on1)) f.tgt = this.pickTarget(on1, on2);
    return f.tgt === 2 ? this.c2.y : this.py;
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
    const dts = dt / 1000;
    this.scroll += dts;
    this.gunCd -= dt; this.diveCd -= dt; this.dive -= dt;
    if (!this.started) { this.started = true; this.ev({ e: 'banner', k: 'actSurf' }); this.ev({ e: 'hint', k: 'surfControls' }); }

    if (on1) {
      if (bits & C.UP) this.py -= 320 * dts;
      if (bits & C.DOWN) this.py += 320 * dts;
    }
    this.py = Math.max(160, Math.min(540, this.py));

    if (c) {
      c.gunCd -= dt; c.diveCd -= dt; c.dive -= dt; c.fireT -= dt; c.hurtT -= dt;
      if (on2) {
        if (bits2 & C.UP) c.y -= 320 * dts;
        if (bits2 & C.DOWN) c.y += 320 * dts;
        if (bits2 & C.L) c.x -= 200 * dts;
        if (bits2 & C.R) c.x += 200 * dts;
        c.y = Math.max(120, Math.min(500, c.y)); c.x = Math.max(64, Math.min(150, c.x));
        if ((bits2 & C.GREN) && !(c.prev & C.GREN) && c.diveCd <= 0) {
          c.dive = 550; c.diveCd = 1400;
          this.ev({ e: 'sfx', n: 'sfx_meow' });
        }
        if ((bits2 & C.FIRE) && c.gunCd <= 0) {
          c.gunCd = 85; c.fireT = 70;
          this.ev({ e: 'sfx', n: 'sfx_shot' });
          // the AK painted into charlie_surf.png, muzzle at u 0.99 / v 0.53
          this.shots.push({ x: c.x + 72, y: c.y + 3, vx: 1020, vy: 0, t: 900, p2: 1 });
        }
      }
      c.prev = bits2;
    }

    // duck-dive: K — brief invuln + slips under surface threats, short cooldown
    if (on1 && (bits & C.GREN) && !(this.prevBits & C.GREN) && this.diveCd <= 0) {
      this.dive = 550; this.diveCd = 1400;
      this.ev({ e: 'sfx', n: 'sfx_meow' });
    }

    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 680 + Math.random() * 650;
      const r = Math.random();
      if (r < 0.45) this.foes.push({ k: 'raider', x: W + 100, y: 220 + Math.random() * 300, hp: 2, ph: Math.random() * 6 });
      else {
        // co-op: divers and sharks surface under either cat
        const tg = co ? this.pickTarget(on1, on2) : 1, ty = tg === 2 ? c.y : this.py;
        if (r < 0.8) this.foes.push({ k: 'diver', x: W + 60, y: ty + (Math.random() - 0.5) * 180, hp: 1, t: 0, up: false, tgt: co ? tg : undefined });
        else this.foes.push({ k: 'shark', x: W + 90, y: ty, hp: 2, t: 0 }); // alien-rat "shark rig" — a rat riding a robo-fin
      }
    }

    if (on1 && (bits & C.FIRE) && this.gunCd <= 0) {
      // v13.7 (Dylan: "the surfboard cat is still holding a limp pistol and
      // just shooting out of nowhere. Give him back his main machine gun from
      // the game."). surf_hero.png has the pistol painted into the raised arm
      // and cannot be regenerated right now, so the gatling he carries
      // everywhere else (wep_gatling) is drawn OVER that arm and the rounds
      // leave ITS barrel. Machine-gun cadence: 130ms -> 70ms.
      this.gunCd = 70; this.fireT = 70;
      this.ev({ e: 'sfx', n: 'sfx_shot' });
      // v13.4 (Dylan: "he's got a pistol on the surfboard, but it's not
      // firing and recoiling. He's just holding it, and a random bullet's
      // coming out of a random place.") The muzzle of the raised pistol sits
      // at u 0.570 / v 0.027 of surf_hero.png -- measured, not guessed. Rounds
      // leave THAT point, arcing forward-down to the water line, and the
      // recoil timer kicks the whole sprite back for the render.
      this.recoilT = 70;                                  // lighter, faster kick
      // the gatling muzzle, derived from the overlay transform in render()
      this.shots.push({ x: 319, y: this.py - 52, vx: 1020, vy: 0, t: 900 });
    }
    for (const s of this.shots) {
      s.x += s.vx * dts; s.y += (s.vy || 0) * dts; s.t -= dt;
      if (!s.foe && s.vy > 0 && s.y > this.py + 4) s.vy = 0;   // level off at the water line
    }
    this.shots = this.shots.filter(s => s.t > 0);

    for (const f of this.foes) {
      if (f.k === 'raider') {
        f.x -= 230 * dts; f.ph += dts * 3; f.y += Math.sin(f.ph) * 50 * dts;
        // v13.4 (Dylan: "all the enemies on the water level, they're not
        // shooting at you enough. In general, you should be getting shot at
        // more.") Surf raiders now take aimed shots instead of only ramming.
        f.cd = (f.cd || 900) - dt;
        if (f.cd <= 0 && f.x > 280 && f.x < W) {
          f.cd = 1000 + Math.random() * 500;
          const dy = (co ? this.targetY(f, on1, on2) : this.py) - f.y;
          this.shots.push({ x: f.x, y: f.y, vx: -600, vy: Math.max(-260, Math.min(260, dy * 0.9)), t: 1300, foe: true });
          this.ev({ e: 'sfx', n: 'sfx_laser' });
        }
        if (on1 && this.dive <= 0 && aabb(f.x, f.y, 260, this.py, 58)) { f.hp = 0; this.boom(f.x, f.y, 0); this.hurt(p, 1); }
        else if (on2 && c.dive <= 0 && aabb(f.x, f.y, c.x + 30, c.y, 56)) { f.hp = 0; this.boom(f.x, f.y, 0); this.hurt(q2, 1); }
      } else if (f.k === 'diver' || f.k === 'shark') {
        f.t += dt; f.x -= (f.k === 'shark' ? 240 : 140) * dts;
        f.up = f.k === 'shark' ? true : (f.t % 1300) < 650;
        // surfaced divers snap off aimed shots at the surfer -- duck-dive under them
        if (f.k === 'diver') {
          f.cd = (f.cd || 800) - dt;
          if (f.up && f.cd <= 0 && f.x > 280 && f.x < W) {
            f.cd = 1500 + Math.random() * 500;
            const dy = (co ? this.targetY(f, on1, on2) : this.py) - f.y;
            this.shots.push({ x: f.x, y: f.y, vx: -560, vy: Math.max(-200, Math.min(200, dy * 0.8)), t: 1500, foe: true });
            this.ev({ e: 'sfx', n: 'sfx_laser' });
          }
        }
        const canHit = f.up && this.dive <= 0;
        if (on1 && canHit && aabb(f.x, f.y, 260, this.py, 50)) { f.hp = 0; this.boom(f.x, f.y, 0); this.hurt(p, 1); }
        else if (on2 && f.up && c.dive <= 0 && aabb(f.x, f.y, c.x + 30, c.y, 50)) { f.hp = 0; this.boom(f.x, f.y, 0); this.hurt(q2, 1); }
      }
      for (const s of this.shots) {
        if (s.t <= 0 || s.foe) continue;   // their own bolts spawn inside them: never let a raider shoot himself
        if ((f.k === 'diver') && !f.up) continue;
        if (aabb(s.x, s.y, f.x, f.y, 44)) {
          f.hp--; s.t = 0;
          if (s.p2) this.p2Hits = (this.p2Hits || 0) + 1;
          if (f.hp <= 0) { this.kills++; if (s.p2) this.p2Kills = (this.p2Kills || 0) + 1; this.boom(f.x, f.y - 8, f.k === 'shark'); this.ev({ e: 'fpsKill' }); }
        }
      }
    }
    this.foes = this.foes.filter(f => f.hp > 0 && f.x > -140);
    // incoming raider fire connects -- and the duck-dive (K) is the dodge,
    // which finally gives that move a job against ranged fire
    for (const s of this.shots) {
      if (s.foe && on1 && this.dive <= 0 && aabb(s.x, s.y, 220, this.py, 48)) { s.t = 0; this.hurt(p, 1); }
      else if (s.foe && on2 && s.t > 0 && c.dive <= 0 && aabb(s.x, s.y, c.x, c.y, 46)) { s.t = 0; this.hurt(q2, 1); }
    }

    if (this.ended()) { this.done = true; this.ev({ e: 'banner', k: 'surfDone' }); }
    this.prevBits = bits;
  }

  render(ctx, now) {
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save(); ctx.translate(sx, 0);
    drawWater(ctx, this.scroll, '#1e5a72', now);
    // the wave face — a big diagonal swell the whole scene rides on
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.moveTo(0, H); ctx.lineTo(0, 460);
    for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 460 + Math.sin(x * 0.01 + this.scroll * 2) * 22);
    ctx.lineTo(W, H); ctx.fill();
    for (const f of this.foes) {
      let img = f.k === 'raider' ? IMG.alien_raider_boat : f.k === 'shark' ? IMG.rat_shark : (f.up ? IMG.rat_diver : null);
      if (img) { const h2 = f.k === 'raider' ? 74 : 60; const w2 = h2 * (img.width / img.height); ctx.drawImage(img, f.x - w2 / 2, f.y - h2 / 2, w2, h2); }
      else if (f.k !== 'diver' || f.up) {
        ctx.fillStyle = f.k === 'raider' ? PAL.teal : f.k === 'shark' ? PAL.acid : PAL.mud1;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.k === 'shark' ? 50 : 40, 20, 0, 0, 7); ctx.fill();
      }
    }
    for (const s of this.shots) {
      if (s.foe) {         // enemy fire: green bolt on a dark keyline, unmissable
        ctx.fillStyle = PAL.outline; ctx.fillRect(s.x - 12, s.y - 4, 24, 8);
        ctx.fillStyle = PAL.acid; ctx.fillRect(s.x - 10, s.y - 2, 20, 5);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x - 3, s.y - 1, 7, 3);
      } else {
        ctx.strokeStyle = s.p2 ? P2_TRACER : PAL.tracer; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - 34, s.y); ctx.stroke();
      }
    }
    // v13.9 -- Charlie rides the same wave. Standing rule: after the truce this
    // is a two-cat war, and the surf section had Whiskers out here on his own.
    // Drawn first, so he sits behind and slightly up the face on his own board,
    // bobbing on his own phase rather than moving as one unit with the player.
    const ci = IMG.charlie_surf;
    const co = !!(this._p2 && this.c2);
    const on1 = !co || !(this._p && this._p.st === 'out');
    if (co) {
      if (this._p2.st !== 'out') this.drawCharlieP2(ctx, now, ci);
    } else if (ci) {
      const cbob = Math.sin(now / 260 + 1.7) * 6;
      const ch = 104, cw = ch * (ci.width / ci.height);
      ctx.save();
      ctx.globalAlpha = this.dive > 0 ? 0.4 : 0.92;
      ctx.drawImage(ci, 96 - cw / 2, this.py - 54 - ch / 2 + cbob, cw, ch);
      ctx.restore();
    }
    // surfer
    const bob = Math.sin(now / 220) * 5;
    const si = IMG.surf_hero;
    if (!on1) { /* co-op: Whiskers is out of lives and off the wave */ }
    else if (si) {
      const sh = 120, sw = sh * (si.width / si.height);
      ctx.save();
      if (this.dive > 0) ctx.globalAlpha = 0.55;
      // recoil: the whole body rocks back around the board as the pistol kicks
      this.recoilT = Math.max(0, (this.recoilT || 0) - 16.7);
      const rk = (this.recoilT || 0) / 110;
      if (rk > 0) {
        ctx.translate(220, this.py + bob);
        ctx.rotate(-rk * 0.11);
        ctx.translate(-220, -(this.py + bob));
      }
      ctx.drawImage(si, 220 - sw / 2 - rk * 5, this.py - sh / 2 + bob, sw, sh);
      // v13.7: the gatling, gripped at his raised hand (measured at u 0.78 /
      // v 0.20 of surf_hero.png) and angled forward so it covers the painted
      // pistol entirely. Same weapon he carries on foot.
      const gi = IMG.wep_gatling;
      if (gi) {
        const gw = 86, gh = gw * (gi.height / gi.width);
        ctx.save();
        ctx.translate(250 - rk * 5, this.py - 38 + bob);
        ctx.rotate(-0.12 - rk * 0.10);                 // muzzle rises on recoil
        ctx.drawImage(gi, -gw * 0.18, -gh * 0.55, gw, gh);
        ctx.restore();
      }
      ctx.restore();
      if (rk > 0.15) drawMuzzleBurst(ctx, 319 - rk * 5, this.py - 52 + bob, 0.02, rk);
    } else {
      ctx.save(); if (this.dive > 0) ctx.globalAlpha = 0.55;
      ctx.fillStyle = PAL.khaki; ctx.fillRect(190, this.py - 44 + bob, 60, 40);
      ctx.fillStyle = '#f3e9c8'; ctx.fillRect(150, this.py + 4 + bob, 120, 12);
      ctx.restore();
    }
    // v13.5 (Dylan's screenshot: "you're shooting from two different places").
    // This was the OLD burst at (300, py-10), still firing beside the new one
    // at the pistol's actual muzzle. One gun now -- the sprite's own raised
    // pistol, flash and rounds both leaving it. Removed, not moved.
    this.drawBooms(ctx);
    if (this.hurtT > 0) { ctx.fillStyle = `rgba(160,20,10,${Math.min(0.4, this.hurtT / 1200)})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(W / 2 - 200, 14, 400, 10);
    ctx.fillStyle = PAL.cheese; ctx.fillRect(W / 2 - 200, 14, 400 * Math.min(1, this.t / this.dur), 10);
    if (this.diveCd > 0 && this.dive <= 0) { ctx.font = 'bold 16px monospace'; ctx.fillStyle = PAL.hudDim; ctx.textAlign = 'left'; ctx.fillText('DIVE RECHARGING', 24, 86); }
  }

  // v14.3 co-op: P2's Charlie on his own board, where the player put him.
  // Hit = he blinks; ducking = he goes translucent under the face; a cheese
  // chevron over his hat marks whose cat this is.
  drawCharlieP2(ctx, now, ci) {
    const c = this.c2;
    const cbob = Math.sin(now / 260 + 1.7) * 6;
    const blink = c.hurtT > 0 && Math.floor(now / 70) % 2 === 0;
    const kick = Math.max(0, c.fireT) / 70;
    if (!blink) {
      ctx.save();
      ctx.globalAlpha = c.dive > 0 ? 0.4 : 1;
      if (ci) {
        const ch = 104, cw = ch * (ci.width / ci.height);
        ctx.drawImage(ci, c.x - cw / 2 - kick * 4, c.y - ch / 2 + cbob, cw, ch);
      } else {
        ctx.fillStyle = '#2b2b26'; ctx.fillRect(c.x - 22, c.y - 40 + cbob, 44, 50);
        ctx.fillStyle = '#c9a25a'; ctx.fillRect(c.x - 60, c.y + 14 + cbob, 120, 10);
      }
      ctx.restore();
    }
    // P2 chevron
    ctx.save();
    ctx.fillStyle = PAL.cheese; ctx.strokeStyle = PAL.outline; ctx.lineWidth = 3;
    const my = c.y - 74 + cbob + Math.sin(now / 200) * 3;
    ctx.beginPath(); ctx.moveTo(c.x - 11, my - 9); ctx.lineTo(c.x + 11, my - 9); ctx.lineTo(c.x, my + 4); ctx.closePath();
    ctx.stroke(); ctx.fill();
    ctx.restore();
    if (kick > 0.15 && c.dive <= 0) drawMuzzleBurst(ctx, c.x + 72 - kick * 4, c.y + 3 + cbob, 0, kick);
  }
}

// ---------- headless autopilots (test harness only) ----------
export function boatBot(rail, frame) {
  let b = C.FIRE;
  // once the wreck sequence opens, the bot stops weaving. On the BRANCHES
  // build the harness tells it which lane to drive (rail.botRoute, 'ramp' or
  // 'around') so the gate covers both outcomes.
  if (rail.fork) {
    const want = rail.botRoute === 'ramp' ? RAMP_Y : 470;
    if (rail.py > want + 12) b |= C.UP;
    else if (rail.py < want - 12) b |= C.DOWN;
    return b;
  }
  const ph = Math.sin(frame / 44);
  if (ph > 0.3) b |= C.UP; else if (ph < -0.3) b |= C.DOWN;
  if (frame % 240 === 0) b |= C.GREN;
  return b;
}
