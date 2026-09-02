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
    this.pylons = PYLONS0.map(o => ({ ...o, hp: 4, alive: true, t: o.off, exposed: false, flash: 0 })); // v13.5: 3 -> 4, longer finale
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
              py.hp--; py.flash = 220; this.ev({ e: 'sfx', n: 'sfx_meow' });
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
              // v13.9: long enough to actually watch him lose. The ship comes
              // apart, and then he drags himself out of his own wreckage --
              // which is the ending Dylan wanted to see before committing to it.
              this.doneT = 3400; this.wonT = 0;
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

    if (this.hullHit > 0) this.hullHit -= dt;
    // pylon armored/exposed pulse
    for (const py of this.pylons) {
      if (!py.alive) continue;
      py.t += dt;
      if (py.flash > 0) py.flash -= dt;   // v13.9: the node's own hit reaction
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
    // No separate floating chancellor sprite. The laugh pulse shakes the whole
    // ship, and the dome glows brighter while he speaks.
    // v13.9 -- the trophy wall, behind him, visible through the talk beats.
    // Rows of captured cat tags on chains under one green lamp. It says what he
    // has been doing to your side without a line of dialogue, and it is the
    // reason the parley goes the way it does. Fades back once shooting starts
    // so it never competes with the fight for attention.
    const wall = IMG.grim_trophy_wall;
    if (wall) {
      const talk = this.phase !== 'fight';
      const wk = talk ? 1 : 0.28;
      const wh = 300, ww = wh * (wall.width / wall.height);
      ctx.save();
      ctx.globalAlpha = 0.85 * wk * Math.min(1, this.t / 1400);
      ctx.drawImage(wall, this.bx - ww / 2, this.by - wh * 0.95, ww, wh);
      // the lamp above the tags breathes
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.20 * wk * (0.7 + 0.3 * Math.sin(now / 520));
      const lg = ctx.createRadialGradient(this.bx, this.by - wh * 0.78, 0, this.bx, this.by - wh * 0.78, ww * 0.5);
      lg.addColorStop(0, 'rgba(150,255,150,0.9)');
      lg.addColorStop(1, 'rgba(150,255,150,0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(this.bx, this.by - wh * 0.78, ww * 0.5, 0, 7); ctx.fill();
      ctx.restore();
    }
    const ship = IMG.chancellor_ship;
    const bossPulse = this.laughPulse > 0 ? Math.sin(now / 60) * 6 : 0;
    if (ship) {
      const sh = 430, sw = sh * (ship.width / ship.height);
      const shx = this.bx - sw * 0.5 + bossPulse * 0.4, shy = this.by - sh * 0.60 + shipYOff;
      ctx.drawImage(ship, shx, shy, sw, sh);
      // v13.7 DAMAGE READ. A white hit-flash stamped onto the ship's OWN
      // pixels (source-atop through an offscreen pass, the same technique the
      // grunts use) plus a rising angry-red heat as the hull is worn down --
      // so the flagship stops being the one thing in the game that soaks
      // fire without reacting.
      const hk = Math.max(0, (this.hullHit || 0) / 260);
      const dmg = this.hullDmg || 0;
      if (hk > 0 || dmg > 0) {
        if (!this._hullCv || this._hullCv.width !== ship.width) {
          this._hullCv = document.createElement('canvas');
          this._hullCv.width = ship.width; this._hullCv.height = ship.height;
        }
        const hc = this._hullCv.getContext('2d');
        hc.clearRect(0, 0, ship.width, ship.height);
        hc.drawImage(ship, 0, 0);
        hc.globalCompositeOperation = 'source-atop';
        // heat first, then the flash on top of it
        if (dmg > 0) {
          hc.fillStyle = `rgba(255,${Math.round(90 - 60 * dmg)},${Math.round(60 - 40 * dmg)},${(0.30 * dmg * (0.7 + 0.3 * Math.sin(now / 220))).toFixed(3)})`;
          hc.fillRect(0, 0, ship.width, ship.height);
        }
        if (hk > 0) {
          hc.fillStyle = `rgba(255,255,255,${(0.85 * hk).toFixed(3)})`;
          hc.fillRect(0, 0, ship.width, ship.height);
        }
        hc.globalCompositeOperation = 'source-over';
        ctx.drawImage(this._hullCv, shx, shy, sw, sh);
        // and it bleeds light from the wounds as it degrades
        if (dmg > 0.25) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 3; i++) {
            const wx = shx + sw * (0.34 + i * 0.19), wy = shy + sh * (0.46 + (i % 2) * 0.12);
            const fl = (0.5 + 0.5 * Math.sin(now / (140 + i * 60) + i)) * dmg;
            const wg = ctx.createRadialGradient(wx, wy, 0, wx, wy, 46 * dmg + 14);
            wg.addColorStop(0, `rgba(255,210,120,${(0.55 * fl).toFixed(2)})`);
            wg.addColorStop(0.5, `rgba(255,110,50,${(0.30 * fl).toFixed(2)})`);
            wg.addColorStop(1, 'rgba(255,60,20,0)');
            ctx.fillStyle = wg;
            ctx.beginPath(); ctx.arc(wx, wy, 46 * dmg + 14, 0, 7); ctx.fill();
          }
          ctx.restore();
        }
      }
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

    // v13.7 SHIELD NODES, redesigned (Dylan, with a screenshot: "the little
    // coloured things that light up on the side that you shoot do not match
    // the spacecraft at all. Design the hell out of these things."). They were
    // grey hexagons with a flat blue dot -- generic UI buttons stuck onto a
    // Giger-style biomechanical hull. The flagship is pink fleshy ribbing,
    // chrome conduits and warm gold, so the nodes are now built from the SAME
    // vocabulary: a fleshy pink sheath, chrome ribs wrapping it, a gold collar,
    // and a core that cycles through the ship's own palette instead of sitting
    // on one colour. Armoured = clenched shut and dim; exposed = iris opens,
    // the core flares and the whole node breathes.
    for (const py of this.pylons) {
      if (!py.alive) continue;
      const px2 = this.bx + py.dx, py2 = this.by + py.dy;
      const ex = py.exposed;
      const beat = 0.5 + 0.5 * Math.sin(now / (ex ? 90 : 420) + py.off);
      // the core cycles the flagship's palette: gold -> rose -> chrome-cyan
      const cyc = (now / 1500 + py.off) % 3;
      const PAL3 = [[255, 214, 96], [255, 150, 190], [150, 220, 255]];
      const c0 = PAL3[Math.floor(cyc)], c1 = PAL3[(Math.floor(cyc) + 1) % 3];
      const f = cyc % 1;
      const cr = Math.round(c0[0] + (c1[0] - c0[0]) * f);
      const cg = Math.round(c0[1] + (c1[1] - c0[1]) * f);
      const cb = Math.round(c0[2] + (c1[2] - c0[2]) * f);

      // living conduit back to the hull -- thick, fleshy, with a chrome core
      const mx = (px2 + this.bx) / 2 + Math.sin(now / 180 + py.off) * 14;
      const myy = (py2 + this.by) / 2;
      ctx.strokeStyle = `rgba(206,138,158,${ex ? 0.5 : 0.75})`;
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(px2, py2); ctx.quadraticCurveTo(mx, myy, this.bx, this.by); ctx.stroke();
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${ex ? 0.85 : 0.35})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(px2, py2); ctx.quadraticCurveTo(mx, myy, this.bx, this.by); ctx.stroke();

      ctx.save();
      ctx.translate(px2, py2);
      ctx.rotate(now / 2600 + py.off);           // slow, heavy -- it has mass
      const R = (ex ? 30 : 23) + beat * (ex ? 3 : 1);

      // v13.9: the node is real art now. v13.7 hand-drew a fleshy sheath, chrome
      // ribs, a gold collar and an iris in canvas; the drawn sprite is that same
      // description done properly, in three states. Dormant is clenched shut,
      // waking is the iris cracking open, live is the eye wide and hot -- which
      // maps exactly onto armoured / just-hit / exposed.
      const nimg = ex ? (IMG.grim_node_live || IMG.grim_node_waking)
                 : (py.flash > 0 ? (IMG.grim_node_waking || IMG.grim_node_dormant)
                                 : IMG.grim_node_dormant);
      if (nimg) {
        const nh = R * 2.35, nw = nh * (nimg.width / nimg.height);
        // it breathes: exposed nodes swell on the beat, armoured ones barely move
        const sc2 = 1 + beat * (ex ? 0.07 : 0.02);
        if (py.flash > 0) ctx.filter = 'brightness(1.9) saturate(1.4)';
        ctx.drawImage(nimg, -nw * sc2 / 2, -nh * sc2 / 2, nw * sc2, nh * sc2);
        ctx.filter = 'none';
        // the core throws light on the hull around it, in the ship's own palette
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.5);
        core.addColorStop(0, `rgba(255,255,240,${(ex ? 0.5 : 0.12) * (0.7 + 0.3 * beat)})`);
        core.addColorStop(0.4, `rgba(${cr},${cg},${cb},${(ex ? 0.45 : 0.1) * (0.7 + 0.3 * beat)})`);
        core.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(0, 0, R * 1.5, 0, 7); ctx.fill();
        ctx.restore();
      } else {
        // fallback: the v13.7 drawn node, if the chunk has not landed yet
        const flesh = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.15, 0, 0, R);
        flesh.addColorStop(0, '#e6aebb'); flesh.addColorStop(0.6, '#c47f95'); flesh.addColorStop(1, '#8d5468');
        ctx.fillStyle = flesh;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
        ctx.strokeStyle = '#3a2530'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.strokeStyle = `rgba(214,170,84,${ex ? 0.95 : 0.6})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, 7); ctx.stroke();
      }
      ctx.restore();

      // hp pips, on a dark plate so they read against the hull
      const pw2 = 4 * 12 + 6;
      ctx.fillStyle = 'rgba(18,14,20,0.55)';
      ctx.fillRect(px2 - pw2 / 2, py2 - (ex ? 42 : 34) - 3, pw2, 11);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i < py.hp ? `rgb(${cr},${cg},${cb})` : 'rgba(243,233,200,0.18)';
        ctx.fillRect(px2 - pw2 / 2 + 5 + i * 12, py2 - (ex ? 42 : 34), 8, 5);
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
      // v13.9 -- Charlie is at the parley too. Standing rule: after the truce
      // this is a two-cat war, and the finale had Whiskers facing the
      // Chancellor alone. He holds the left flank, firing on his own cadence,
      // slightly behind so he never crowds the player's read of his own cat.
      const ci = IMG.charlie_ship;
      if (ci) {
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

    // v13.9 -- THE ENDING. He does not simply pop and cut to a tally. The ship
    // comes apart for a couple of seconds, and then the Chancellor drags
    // himself out of his own wreckage on his elbows, trailing green blood,
    // still crawling as the screen goes. Dylan wanted to see this one before
    // deciding whether it belongs in the game, so it is in, and it is cheap to
    // pull back out: delete this block.
    if (this.won) {
      const wt = this.wonT || 0;
      // v13.9.1 -- the wreckage-crawl sprite is PULLED. Canon Grimtail
      // (chancellor_boss) is a grey rat in an orange and gold papal robe under
      // a spiked crown. The sprite that landed here was a brown rat in a blue
      // naval admiral's coat and a tricorn hat -- my prompt said "admiral",
      // which I invented; the game never said that. Wrong colour, wrong
      // garment, wrong genre. Re-enable this block once the art matches:
      //   const ci = IMG.grimtail_crawl;  ...draw at gx, gy with the trail...
      // Until then the ending is the hull tearing itself apart, which is what
      // it was before and reads correctly.
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
