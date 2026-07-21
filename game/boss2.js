// Act IV — THE LZ AMBUSH. The chopper's inbound, the LZ goes quiet, and
// Chancellor Grimtail descends "to talk." He doesn't mean it. A scripted
// in-engine cinematic (no video — cheaper, and lets the shield-spark beat
// land exactly on the dialogue) flows straight into a discover-the-mechanic
// boss fight: 3 shield pylons orbit him, each pulsing armored/exposed on its
// own clock. Bullets do nothing to the Chancellor OR an armored pylon except
// spark blue — only a pylon hit during its bright "exposed" flash counts.
// Kill all 3 and the shield collapses for good; he's enraged and open.
//
// Art (chancellor_boss, chancellor_ship) lives in the 'boss2' CDN chunk
// (chunks.js) — painterly Jodorowsky's-Dune / Chris Foss style, deliberately
// NOT STYLE FORMULA v1 (this reads as an otherworldly mothership-tier foe,
// not a ground-level pixel-art enemy). Falls back to procedural shapes if
// the chunk hasn't loaded, same pattern as boat.js.
import { C, PAL, W, H } from './config.js';
import { IMG } from './assets.js';
import { RailBase } from './rails.js';

const GY = 640;
const BX = 900, BY = 260; // Chancellor's fixed hover position, screen space
const PYLONS0 = [
  { dx: -190, dy: -100, per: 2400, off: 0 },
  { dx: 200, dy: -60, per: 2400, off: 900 },
  { dx: 10, dy: 170, per: 2400, off: 1700 },
];
const EXPOSE_MS = 700; // window per cycle a pylon can actually be hurt

function aabb(ax, ay, bx, by, r) { return Math.abs(ax - bx) < r && Math.abs(ay - by) < r; }

export class ParleyBoss extends RailBase {
  constructor() {
    super(999999); // no clock — ends on win or death, not a timer
    this.phase = 'talk'; // talk -> reveal -> laugh -> fight -> (shield down, same phase, this.shieldUp flips)
    this.px = W / 2;
    this.gunCd = 0;
    this.bossHp = 70; this.bossHpMax = 70;
    this.shieldUp = true;
    this.pylons = PYLONS0.map(o => ({ ...o, hp: 3, alive: true, t: o.off, exposed: false }));
    this.bolts = []; // boss plasma bolts -> player
    this.sparks = []; // shield-spark FX (armored hit, or shield-dome hit)
    this.atkT = 2200;
    this.tellT = 0; this.tellTX = 0;
    this._fired = new Set();
    this.started = false;
    this.laughPulse = 0;
  }

  runScript(t) {
    const lines = [
      [400, () => this.ev({ e: 'banner', k: 'parleyApproach' })],
      [2700, () => this.ev({ e: 'banner', k: 'chancellorGreet' })],
      [5200, () => this.ev({ e: 'banner', k: 'chancellorOffer' })],
      [7500, () => this.ev({ e: 'banner', k: 'heroSuspicious' })],
      [9500, () => { this.phase = 'reveal'; this.ev({ e: 'banner', k: 'chancellorReveal' }); this.ev({ e: 'sfx', n: 'sfx_laser' }); this.ev({ e: 'shake', m: 8 }); }],
      [10600, () => { this.ineffective = true; this.ev({ e: 'banner', k: 'heroFireBack' }); this.ev({ e: 'sfx', n: 'sfx_shot' }); }],
      [13600, () => { this.ev({ e: 'banner', k: 'shieldNoEffect' }); }],
      [15800, () => { this.phase = 'laugh'; this.laughPulse = 2200; this.ev({ e: 'banner', k: 'chancellorLaugh' }); this.ev({ e: 'sfx', n: 'sfx_ufo' }); }],
      [18400, () => { this.ev({ e: 'banner', k: 'chancellorTaunt' }); }],
      [20800, () => { this.phase = 'fight'; this.ev({ e: 'banner', k: 'findWeakness' }); this.ev({ e: 'hint', k: 'parleyControls' }); this.ev({ e: 'music', n: 'music_invasion' }); }],
    ];
    for (const [tt, fn] of lines) {
      if (t >= tt && !this._fired.has(tt)) { this._fired.add(tt); fn(); }
    }
  }

  step(bits, dt, p) {
    if (this.done) return;
    this.stepCommon(dt);
    const dts = dt / 1000;
    if (!this.started) { this.started = true; this.ev({ e: 'music', n: 'music_ratpatrol' }); }
    this.runScript(this.t);
    this.laughPulse = Math.max(0, this.laughPulse - dt);

    // ---- cinematic-only auto-fire: the squad unloads on him during 'reveal', to no effect ----
    if (this.phase === 'reveal' && this.ineffective) {
      this.gunCd -= dt;
      if (this.gunCd <= 0) {
        this.gunCd = 90;
        this.sparks.push({ x: BX + (Math.random() - 0.5) * 200, y: BY + (Math.random() - 0.5) * 140, t: 0 });
      }
    }

    // ---- player controls: locked until the fight actually starts ----
    if (this.phase === 'fight') {
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

    // shots travel + resolve
    if (this.shots) {
      for (const s of this.shots) { s.y += s.vy * dts; s.t -= dt; }
      for (const s of this.shots) {
        if (s.t <= 0) continue;
        // pylons first
        let hitSomething = false;
        for (const py of this.pylons) {
          if (!py.alive) continue;
          const px2 = BX + py.dx, py2 = BY + py.dy;
          if (aabb(s.x, s.y, px2, py2, 46)) {
            hitSomething = true; s.t = 0;
            if (py.exposed) {
              py.hp--; this.ev({ e: 'sfx', n: 'sfx_meow' });
              this.sparks.push({ x: px2, y: py2, t: 0, good: 1 });
              if (py.hp <= 0) {
                py.alive = false;
                this.ev({ e: 'boom', x: px2, y: py2, big: 0 });
              }
            } else {
              this.sparks.push({ x: px2, y: py2, t: 0 });
            }
            break;
          }
        }
        // boss / shield dome
        if (!hitSomething && aabb(s.x, s.y, BX, BY, 190)) {
          s.t = 0;
          if (this.shieldUp) {
            this.sparks.push({ x: s.x, y: BY + 40, t: 0 });
          } else {
            this.bossHp -= 4;
            this.ev({ e: 'hit', x: s.x, y: s.y });
            this.sparks.push({ x: s.x, y: BY, t: 0, good: 1 });
            if (this.bossHp <= 0 && !this.won) {
              this.won = true;
              for (let i = 0; i < 6; i++) this.boom(BX - 130 + i * 46, BY - 60 + (i % 3) * 70, 1);
              this.ev({ e: 'sfx', n: 'sfx_explosion' });
              this.ev({ e: 'shake', m: 16 });
              this.ev({ e: 'banner', k: 'chancellorDown' });
              this.kills = 50; // main.js does g.score += kills*100 — parity with the mothership's 5000
              this.doneT = 2400;
            }
          }
        }
      }
      this.shots = this.shots.filter(s => s.t > 0 && s.y > -60);
    }

    // shield collapses once all 3 pylons are down
    if (this.shieldUp && this.phase === 'fight' && this.pylons.every(py => !py.alive)) {
      this.shieldUp = false;
      this.ev({ e: 'banner', k: 'shieldDown' });
      this.ev({ e: 'sfx', n: 'sfx_explosion' });
      this.ev({ e: 'shake', m: 12 });
      this.atkT = 900; // enraged — faster next volley
    }

    // pylon armored/exposed pulse
    for (const py of this.pylons) {
      if (!py.alive) continue;
      py.t += dt;
      const ph = py.t % py.per;
      py.exposed = ph < EXPOSE_MS;
    }

    // ---- boss plasma bolts (telegraphed) ----
    if (this.phase === 'fight' || this.phase === 'laugh') {
      this.atkT -= dt;
      if (this.tellT > 0) {
        this.tellT -= dt;
        if (this.tellT <= 0) {
          this.tellT = 0;
          this.bolts.push({ x: BX, y: BY + 60, vx: 0, vy: 620, tx: this.tellTX });
          this.ev({ e: 'sfx', n: 'sfx_laser' });
        }
      } else if (this.atkT <= 0 && this.phase === 'fight') {
        this.atkT = this.shieldUp ? (1900 + Math.random() * 900) : (1050 + Math.random() * 500);
        this.tellT = 380; this.tellTX = this.px;
      }
    }
    for (const b of this.bolts) {
      // home in gently on the telegraphed x so a stationary dodge still works
      b.x += (b.tx - b.x) * Math.min(1, dts * 2.2);
      b.y += b.vy * dts;
      if (b.y > GY - 40 && b.y < GY + 20 && !b.spent) {
        if (Math.abs(b.x - this.px) < 54) { b.spent = true; this.hurt(p, 1); }
        if (b.y > GY + 10) b.spent = true;
      }
    }
    this.bolts = this.bolts.filter(b => !b.spent && b.y < H + 40);

    for (const sp of this.sparks) sp.t += dt;
    this.sparks = this.sparks.filter(sp => sp.t < 260);

    if (this.doneT !== undefined) {
      this.doneT -= dt;
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
    const ship = IMG.chancellor_ship;
    if (ship) {
      const sh = 340, sw = sh * (ship.width / ship.height);
      ctx.drawImage(ship, BX - sw * 0.42, BY - sh * 0.62 + shipYOff - 40, sw, sh);
    } else {
      ctx.fillStyle = '#8a6a3a';
      ctx.beginPath(); ctx.ellipse(BX, BY - 90 + shipYOff, 220, 90, 0, 0, 7); ctx.fill();
    }

    // the Chancellor himself, foreground
    const boss = IMG.chancellor_boss;
    const bossPulse = this.laughPulse > 0 ? Math.sin(now / 60) * 6 : 0;
    if (boss) {
      const bh = 300, bw = bh * (boss.width / boss.height);
      ctx.drawImage(boss, BX - bw * 0.5, BY - bh * 0.42 + shipYOff * 0.3 + bossPulse * 0.2, bw, bh);
    } else {
      ctx.fillStyle = '#b5702c';
      ctx.fillRect(BX - 70, BY - 140 + shipYOff * 0.3, 140, 220);
    }

    // reveal-phase plasma gun flash near his hand
    if (this.phase === 'reveal' || this.phase === 'laugh' || this.phase === 'fight') {
      ctx.fillStyle = 'rgba(140,255,180,0.85)';
      ctx.beginPath(); ctx.arc(BX + 70, BY + 40, 10, 0, 7); ctx.fill();
    }

    // shield dome (only while up)
    if (this.shieldUp) {
      const pulse = 0.12 + 0.05 * Math.sin(now / 220);
      ctx.strokeStyle = `rgba(90,170,255,${pulse + 0.12})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(BX, BY, 190, 0, 7); ctx.stroke();
      ctx.fillStyle = `rgba(90,170,255,${pulse * 0.3})`;
      ctx.beginPath(); ctx.arc(BX, BY, 190, 0, 7); ctx.fill();
    }

    // pylons
    for (const py of this.pylons) {
      if (!py.alive) continue;
      const px2 = BX + py.dx, py2 = BY + py.dy;
      const glow = py.exposed ? 1 : 0.32;
      ctx.fillStyle = py.exposed ? `rgba(255,240,140,${0.7 + 0.3 * Math.sin(now / 40)})` : `rgba(90,170,255,${glow})`;
      ctx.beginPath(); ctx.arc(px2, py2, py.exposed ? 22 : 16, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(20,20,24,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px2, py2, py.exposed ? 22 : 16, 0, 7); ctx.stroke();
      // hp pips
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < py.hp ? '#f3e9c8' : 'rgba(243,233,200,0.2)';
        ctx.fillRect(px2 - 15 + i * 12, py2 - (py.exposed ? 34 : 28), 8, 5);
      }
    }

    // shield sparks
    for (const sp of this.sparks) {
      const k = sp.t / 260;
      ctx.fillStyle = sp.good ? `rgba(140,255,59,${(1 - k) * 0.9})` : `rgba(90,170,255,${(1 - k) * 0.9})`;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 6 + k * 22, 0, 7); ctx.fill();
    }

    // player shots
    ctx.strokeStyle = PAL.tracer; ctx.lineWidth = 4;
    if (this.shots) for (const s of this.shots) { ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y + 26); ctx.stroke(); }

    // boss bolts + telegraph
    if (this.tellT > 0) {
      ctx.fillStyle = `rgba(255,80,220,${0.5 + 0.4 * Math.sin(now / 30)})`;
      ctx.beginPath(); ctx.arc(BX, BY + 60, 16, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#ff54d8';
    for (const b of this.bolts) { ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, 7); ctx.fill(); }

    // player dodge marker (foreground, small — no hero art loaded in this module)
    if (this.phase === 'fight' || this.phase === 'laugh' || this.phase === 'reveal') {
      ctx.fillStyle = PAL.khaki;
      ctx.fillRect(this.px - 16, GY - 60, 32, 60);
      ctx.fillStyle = PAL.outline;
      ctx.beginPath(); ctx.arc(this.px, GY - 68, 14, 0, 7); ctx.fill();
    }

    this.drawBooms(ctx);
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

// ---------- headless autopilot (test harness only) ----------
export function parleyBot(rail) {
  if (rail.phase !== 'fight') return 0;
  let b = C.FIRE;
  // camp under ONE live pylon (stable target — don't jitter between targets
  // every frame, or the bot never dwells under any single pylon long enough
  // to catch its exposed window) until it's dead, then the shield, then the
  // boss center once it's down.
  let tx = BX;
  if (rail.shieldUp) {
    const live = rail.pylons.find(py => py.alive);
    if (live) tx = BX + live.dx;
  }
  if (rail.px < tx - 8) b |= C.R; else if (rail.px > tx + 8) b |= C.L;
  return b;
}
