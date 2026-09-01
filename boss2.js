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
import { drawMuzzleBurst } from './render.js';

const GY = 640;
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

export class ParleyBoss extends RailBase {
  constructor() {
    super(999999); // no clock — ends on win or death, not a timer
    this.phase = 'talk'; // talk -> reveal -> laugh -> fight -> (shield down, same phase, this.shieldUp flips)
    this.px = W / 2;
    this.gunCd = 0;
    this.bossHp = 105; this.bossHpMax = 105; // v13.5: the finale was the SHORTEST fight (~19s); +50% pass
    this.shieldUp = true;
    this.pylons = PYLONS0.map(o => ({ ...o, hp: 4, alive: true, t: o.off, exposed: false })); // v13.5: 3 -> 4, longer finale
    this.bx = BX0; this.by = BY0;
    this.flyState = 'hover'; this.flyT = 0; this.flySide = 1; this.passY = BY0;
    this.bolts = []; // boss plasma bolts -> player
    this.sparks = []; // shield-spark FX (armored hit, or shield-dome hit)
    this.atkT = 2200;
    this.tellT = 0; this.tellTX = 0;
    this._fired = new Set();
    this.started = false;
    this.laughPulse = 0;
  }

  runScript(t) {
    // v13.4: the parley CONVERSATION is a film now (VIDEO_URLS.parley) -- the
    // ship descending, the hold-your-fire, Grimtail in his dome. Dylan: "the
    // whole conversation... wouldn't it be better if that was a cut scene?
    // Yes, make it that." So the in-game script is just the double-cross:
    // 20.8 seconds of banners (10 of them over deliberately ignored input, per
    // the pacing review) is now a 6-second betrayal straight into the fight.
    const lines = [
      [700, () => { this.phase = 'reveal'; this.ev({ e: 'banner', k: 'chancellorReveal' }); this.ev({ e: 'sfx', n: 'sfx_laser' }); this.ev({ e: 'shake', m: 8 }); }],
      [2400, () => { this.phase = 'laugh'; this.laughPulse = 2200; this.ev({ e: 'sfx', n: 'sfx_ufo' }); }],
      [6000, () => { this.phase = 'fight'; this.ev({ e: 'hint', k: 'parleyControls' }); this.ev({ e: 'music', n: 'music_invasion' }); }],
    ];
    for (const [tt, fn] of lines) {
      if (t >= tt && !this._fired.has(tt)) { this._fired.add(tt); fn(); }
    }
  }

  step(bits, dt, p) {
    if (this.done) return;
    this.stepCommon(dt, p);
    const dts = dt / 1000;
    if (!this.started) { this.started = true; this.ev({ e: 'music', n: 'music_ratpatrol' }); }
    this.runScript(this.t);
    this.laughPulse = Math.max(0, this.laughPulse - dt);

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
        if (this.flyT > 3400) { this.flyState = 'exit'; this.flyT = 0; }
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
          this.passGun = 260;
          this.bolts.push({ x: this.bx, y: this.by + 60, vx: this.flySide * 120, vy: 560, tx: null });
          this.ev({ e: 'sfx', n: 'sfx_laser' });
        }
        if ((this.flySide > 0 && this.bx > W - 330) || (this.flySide < 0 && this.bx < 330)) {
          this.flyState = 'hover'; this.flyT = 0;
        }
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
          const px2 = this.bx + py.dx, py2 = this.by + py.dy;
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
        if (!hitSomething && aabb(s.x, s.y, this.bx, this.by, 190)) {
          s.t = 0;
          if (this.shieldUp) {
            this.sparks.push({ x: s.x, y: this.by + 40, t: 0 });
          } else {
            this.bossHp -= 4;
            this.ev({ e: 'hit', x: s.x, y: s.y });
            this.sparks.push({ x: s.x, y: this.by, t: 0, good: 1 });
            if (this.bossHp <= 0 && !this.won) {
              this.won = true;
              for (let i = 0; i < 6; i++) this.boom(this.bx - 130 + i * 46, this.by - 60 + (i % 3) * 70, 1);
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
          this.bolts.push({ x: this.bx, y: this.by + 60, vx: 0, vy: 620, tx: this.tellTX });
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
    // v13.4 (Dylan: "why is the rat floating next to the spaceship? It makes
    // no sense. He should be in it."). One drawing now: the Dune flagship with
    // Grimtail visible ON HIS THRONE inside the lit dome baked into the art.
    // No separate floating chancellor sprite. The laugh pulse shakes the whole
    // ship, and the dome glows brighter while he speaks.
    const ship = IMG.chancellor_ship;
    const bossPulse = this.laughPulse > 0 ? Math.sin(now / 60) * 6 : 0;
    if (ship) {
      const sh = 430, sw = sh * (ship.width / ship.height);
      ctx.drawImage(ship, this.bx - sw * 0.5 + bossPulse * 0.4, this.by - sh * 0.60 + shipYOff, sw, sh);
      // dome glow: his voice, shown not told -- pulses while he laughs/talks
      const domeX = this.bx + sw * 0.10, domeY = this.by - sh * 0.36 + shipYOff;
      const talk = this.phase !== 'fight' ? 0.5 + 0.5 * Math.sin(now / 190) : 0.25;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(domeX, domeY, 6, domeX, domeY, 90);
      gr.addColorStop(0, `rgba(255,205,110,${(0.30 * talk + 0.10).toFixed(2)})`);
      gr.addColorStop(1, 'rgba(255,160,40,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(domeX, domeY, 90, 0, 7); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = '#8a6a3a';
      ctx.beginPath(); ctx.ellipse(this.bx, this.by - 90 + shipYOff, 220, 90, 0, 0, 7); ctx.fill();
    }

    // reveal-phase plasma cannon flash on the hull
    if (this.phase === 'reveal' || this.phase === 'laugh' || this.phase === 'fight') {
      ctx.fillStyle = 'rgba(140,255,180,0.85)';
      ctx.beginPath(); ctx.arc(this.bx + 70, this.by + 40, 10, 0, 7); ctx.fill();
    }

    // shield dome (only while up)
    if (this.shieldUp) {
      const pulse = 0.12 + 0.05 * Math.sin(now / 220);
      ctx.strokeStyle = `rgba(90,170,255,${pulse + 0.12})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.bx, this.by, 190, 0, 7); ctx.stroke();
      ctx.fillStyle = `rgba(90,170,255,${pulse * 0.3})`;
      ctx.beginPath(); ctx.arc(this.bx, this.by, 190, 0, 7); ctx.fill();
    }

    // pylons: shield emitter PODS -- chrome housing, energy core, and a live
    // tether arcing back to the hull, so they read as part of the machine
    // rather than floating circles
    for (const py of this.pylons) {
      if (!py.alive) continue;
      const px2 = this.bx + py.dx, py2 = this.by + py.dy;
      // tether to the hull
      ctx.strokeStyle = `rgba(120,190,255,${py.exposed ? 0.15 : 0.4})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(px2, py2);
      ctx.quadraticCurveTo((px2 + this.bx) / 2 + Math.sin(now / 180 + py.off) * 14, (py2 + this.by) / 2, this.bx, this.by);
      ctx.stroke();
      // housing: a hexagonal chrome pod
      ctx.save();
      ctx.translate(px2, py2); ctx.rotate(now / 900 + py.off);
      ctx.fillStyle = '#5a5f6a'; ctx.strokeStyle = '#23252b'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let hx2 = 0; hx2 < 6; hx2++) {
        const ha = hx2 * Math.PI / 3;
        const hr = py.exposed ? 26 : 21;
        if (hx2 === 0) ctx.moveTo(Math.cos(ha) * hr, Math.sin(ha) * hr);
        else ctx.lineTo(Math.cos(ha) * hr, Math.sin(ha) * hr);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      // the core
      const glow = py.exposed ? 1 : 0.35;
      ctx.fillStyle = py.exposed ? `rgba(255,240,140,${0.75 + 0.25 * Math.sin(now / 40)})` : `rgba(90,170,255,${glow})`;
      ctx.beginPath(); ctx.arc(px2, py2, py.exposed ? 15 : 10, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(20,20,24,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px2, py2, py.exposed ? 15 : 10, 0, 7); ctx.stroke();
      // hp pips (4 since v13.5)
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i < py.hp ? '#f3e9c8' : 'rgba(243,233,200,0.2)';
        ctx.fillRect(px2 - 21 + i * 12, py2 - (py.exposed ? 34 : 28), 8, 5);
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
      ctx.beginPath(); ctx.arc(this.bx, this.by + 60, 16, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#ff54d8';
    for (const b of this.bolts) { ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, 7); ctx.fill(); }

    // v13.5 (Dylan's screenshot: "I don't know what this thing on the bottom
    // is that I'm shooting from. It makes no sense.") It was a khaki rectangle
    // with a circle for a head -- the comment claimed no hero art was loaded
    // here, but hero_us_up ships in the BASE bundle and has been available the
    // whole time. The real cat now stands there, gun up, rocking with recoil.
    if (this.phase === 'fight' || this.phase === 'laugh' || this.phase === 'reveal') {
      const hi = IMG.hero_us_up || IMG.hero_us;
      if (hi) {
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
  let tx = rail.bx;
  if (rail.shieldUp) {
    const live = rail.pylons.find(py => py.alive);
    if (live) tx = rail.bx + live.dx;
  }
  if (rail.px < tx - 8) b |= C.R; else if (rail.px > tx + 8) b |= C.L;
  return b;
}
