// Vehicle rail levels: the whole game changes again, twice.
//  DoorGun  — Charlie mans the Huey's M60 while you fly: mow down rat patrols.
//  Skyraider — you pilot an A-1 over the treeline and napalm it end to end.
// Same modal pattern as the Tunnel: step(bits,dt,p) / render(ctx,now) / done.
import { CFG, C, PAL, W, H } from './config.js';
import { IMG, SHEET, drawImgHit, drawSheet } from './assets.js';
import { drawMuzzleBurst } from './render.js'; // v11.2: shared "real fire" burst, replaces the flat circle every rail gun used to draw

const GY = 640; // rail ground line

// v13.5 (Dylan: "the stuff that's parachuting, it doesn't look like it's
// designed from the same game. So fix that, make it better, make it look
// cooler"). One shared crate, drawn in the game's own language: thick dark
// outlines, flat PAL colours, a stencilled star, panel-seamed olive canopy
// with a torn edge, swinging in its own rig lines.
function drawSupplyCrate(ctx, x, y, now) {
  const sway = Math.sin(now / 420 + x * 0.01) * 9;
  const rock = Math.sin(now / 420 + x * 0.01 + 0.5) * 0.08;
  ctx.save();
  ctx.translate(x + sway, y);
  // canopy: olive dome with panel seams and outline
  ctx.rotate(rock * 0.4);
  ctx.fillStyle = '#4c5d2a';
  ctx.beginPath(); ctx.arc(0, -52, 34, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#39481f';
  ctx.beginPath(); ctx.arc(0, -52, 34, Math.PI, Math.PI + 0.9); ctx.lineTo(0, -52); ctx.fill();
  ctx.strokeStyle = PAL.outline; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, -52, 34, Math.PI, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-34, -52); ctx.lineTo(34, -52); ctx.stroke();
  ctx.lineWidth = 2;
  for (const px2 of [-17, 0, 17]) { ctx.beginPath(); ctx.moveTo(px2, -52 - (34 - Math.abs(px2)) * 0.9); ctx.lineTo(px2 * 0.85, -52); ctx.stroke(); }
  // rig lines
  ctx.strokeStyle = '#26231c'; ctx.lineWidth = 2;
  for (const rx of [-30, 0, 30]) { ctx.beginPath(); ctx.moveTo(rx, -52); ctx.lineTo(0, -16); ctx.stroke(); }
  ctx.rotate(rock * 0.6);
  // the crate: khaki planks, corner straps, stencil star
  ctx.fillStyle = PAL.khaki; ctx.fillRect(-19, -16, 38, 30);
  ctx.fillStyle = PAL.khakiDark; ctx.fillRect(-19, -16, 38, 7);
  ctx.fillStyle = 'rgba(38,35,28,0.35)'; ctx.fillRect(-19, 8, 38, 6);
  ctx.strokeStyle = PAL.outline; ctx.lineWidth = 3; ctx.strokeRect(-19, -16, 38, 30);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-19, -2); ctx.lineTo(19, -2); ctx.stroke();       // plank seam
  ctx.fillStyle = PAL.redAccent;                                                 // stencil star
  ctx.save(); ctx.translate(0, 0);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a2 = -Math.PI / 2 + i * (Math.PI * 4 / 5);
    const r2 = 9;
    if (i === 0) ctx.moveTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
    else ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
  }
  ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.restore();
}

function aabb(ax, ay, bx, by, r) { return Math.abs(ax - bx) < r && Math.abs(ay - by) < r; }

// v11: this was NOT exported — boat.js and boss2.js both `import { RailBase }
// from './rails.js'`, which silently resolves to undefined and throws
// "Class extends value undefined is not a constructor" the instant either
// module is loaded. This is almost certainly the actual reason the PT-boat/
// Grimtail content was never reachable in previous "shipped" versions despite
// changelog entries claiming it was wired and verified live: importing either
// module into main.js would have crashed the whole game at load time, and
// whichever session hit that either reverted without writing it down, or
// never actually tried loading main.js with the import in place.
export class RailBase {
  // quota: kills that end the section EARLY. Every rail used to run its full
  // hardcoded timer no matter how well you shot -- 204s of the ~325s
  // playthrough where killing 95 things and killing 25 things took exactly the
  // same wall-clock time, so the only skill expression was not dying. Hitting
  // the quota now cuts the section short, which is the one place accuracy can
  // buy the player anything. Timer still ends it for everyone else.
  constructor(dur, quota) {
    this.t = 0; this.dur = dur; this.quota = quota || 0;
    this.done = false; this.events = [];
    this.scroll = 0; this.kills = 0;
    this.foes = []; this.shots = []; this.flak = []; this.booms = [];
    this.spawnT = 800; this.hurtT = 0; this.fireT = 0;
    this.prevBits = 0; this.shake = 0;
  }
  ev(e) { this.events.push(e); }
  // true once the section should end: quota met, or the timer ran out.
  ended() { return (this.quota > 0 && this.kills >= this.quota) || this.t >= this.dur; }
  hurt(p, amt) {
    this._p = p; // v13: draw() needs hull state for the damage smoke/flash
    if (this.hurtT > 0) return;
    // Armour pips absorb the hit first, and losing pip 2 SHOOTS OFF your
    // highest upgrade -- Metal Slug's rule that your gear is stripped before
    // the machine dies, so the loss is gradual and visible rather than sudden.
    if (this.pips !== undefined && this.pips > 0) {
      this.pips--;
      this.flashT = 130; this.shake = 14;
      this.ev({ e: 'fpsHurt' }); this.ev({ e: 'sfx', n: 'sfx_explosion' });
      if (this.pips === 2 && this.tier > 1) {
        this.tier--;                                   // highest upgrade blows off
        // v13.5: say what was actually lost -- at tier 2 you never had the
        // chin turret, so "TURRET SHOT OFF" was announcing hardware you
        // never owned. Pods strip at 2->1, the turret at 3->2.
        this.ev({ e: 'banner', k: this.tier === 2 ? 'heliStripped' : 'heliStrippedPods' });
        for (let i = 0; i < 3; i++) this.boom(280 + i * 30, this.hy + 60, 0);
      }
      if (this.pips === 1) this.ev({ e: 'banner', k: 'heliCritical' });
      if (this.pips > 0) { this.hurtT = 900; return; }  // survived on armour
    }
    p.hp -= amt; this.hurtT = 900; this.flashT = 130; this.shake = 14;
    this.ev({ e: 'fpsHurt' }); this.ev({ e: 'sfx', n: 'sfx_explosion' });
    if (p.hp <= 0) {
      p.deaths++; p.lives--; p.hp = CFG.hpMax;
      // v13: the aircraft is destroyed, not just the pilot hurt -- three
      // staggered blasts across the airframe, a hard shake, and the smoke
      // trail cleared so the replacement Huey comes in clean.
      this.boom(190, this.hy + 60, 1);
      this.boom(150, this.hy + 95, 0);
      this.boom(235, this.hy + 40, 0);
      this.shake = 26;
      this.hsmoke = [];
      // A replacement aircraft arrives intact. Without this the pips were a
      // one-time buffer for the whole section: burn them in the first fifteen
      // seconds and the remaining forty are raw, which is the opposite of the
      // "you lose the machine, you get another machine" beat.
      if (this.pips !== undefined) this.pips = this.pipsMax || 4;
      if (p.lives <= 0) { p.st = 'out'; this.dead = true; this.done = true; }
      this.hurtT = 2200;
    }
  }
  boom(x, y, big) {
    this.booms.push({ x, y, t: 0, big });
    this.ev({ e: 'sfx', n: 'sfx_explosion' });
  }
  stepCommon(dt, p) {
    if (p) this._p = p;
    this.t += dt; this.hurtT -= dt; this.fireT -= dt;
    if (this.flashT > 0) this.flashT -= dt; // short hit pulse, separate from i-frames
    if (this.hsmoke) { for (const q of this.hsmoke) q.t += dt; this.hsmoke = this.hsmoke.filter(q => q.t < q.T); }
    this.shake = Math.max(0, this.shake - dt * 0.05);
    for (const b of this.booms) b.t += dt;
    this.booms = this.booms.filter(b => b.t < 700);
  }
  // v13 (Dylan: "fix all the explosions when rats and space ships blow up
  // they're just circles"). The rail sections had their OWN explosion drawing,
  // separate from render.js, and it was literally two arcs -- an orange disc and
  // a grey disc. This is where the ships he was shooting blew up. Now it plays
  // the same 16-frame blast sheet the air-support bombs use, with a mirror flip
  // and scale jitter so a busy sky isn't the identical animation on loop, plus
  // a shockwave ring and cooling embers.
  drawBooms(ctx) {
    const es = SHEET.sheet_explosion;
    for (const b of this.booms) {
      const k = b.t / 700;
      if (b.sz === undefined) { b.sz = (b.big ? 250 : 132) * (0.88 + Math.random() * 0.24); b.fl = Math.random() < 0.5; }
      // shockwave
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k * 1.5) * 0.6;
      ctx.strokeStyle = k < 0.3 ? '#fff3d0' : PAL.boom1;
      ctx.lineWidth = Math.max(1, 5 * (1 - k));
      ctx.beginPath(); ctx.arc(b.x, b.y, b.sz * (0.12 + k * 0.62), 0, 7); ctx.stroke();
      ctx.restore();
      if (es) {
        const fr = Math.min(es.frames - 1, Math.floor(b.t / (1000 / es.fps)));
        drawSheet(ctx, 'sheet_explosion', fr, b.x - b.sz / 2, b.y - b.sz * 0.55, b.sz, b.sz, b.fl);
      } else { // no sheet loaded -- soft glow, still not a hard circle
        const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.sz * 0.6);
        gr.addColorStop(0, `rgba(255,240,190,${(1 - k).toFixed(2)})`);
        gr.addColorStop(0.5, `rgba(255,150,50,${(0.6 * (1 - k)).toFixed(2)})`);
        gr.addColorStop(1, 'rgba(90,40,10,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.sz * 0.6, 0, 7); ctx.fill();
      }
    }
  }
  drawSky(ctx, spd) {
    // acid-tinted invasion sky, fast parallax jungle
    const bg = IMG.bg_invasion || IMG.bg_jungle;
    ctx.fillStyle = '#4a5c33'; ctx.fillRect(0, 0, W, H);
    if (bg) {
      const w2 = H * (bg.width / bg.height);
      const off = (this.scroll * spd) % (w2 * 2);
      ctx.save(); ctx.globalAlpha = 0.9;
      // mirror-tile so the edges always match (no visible seam)
      for (let i = -1; i * w2 - off < W + w2; i++) {
        const x = i * w2 - off;
        const flip = ((i % 2) + 2) % 2 === 1;
        if (flip) { ctx.save(); ctx.translate(x + w2 / 2, 0); ctx.scale(-1, 1); ctx.drawImage(bg, -w2 / 2, 0, w2 + 1, H); ctx.restore(); }
        else ctx.drawImage(bg, x, 0, w2 + 1, H);
      }
      ctx.restore();
    }
    // ground rush strip
    ctx.fillStyle = '#2c2417'; ctx.fillRect(0, GY + 34, W, H - GY - 34);
    ctx.strokeStyle = 'rgba(90,74,40,0.8)'; ctx.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const x = W - ((this.scroll * (spd * 2.4) + i * 173) % (W + 200));
      ctx.beginPath(); ctx.moveTo(x, GY + 44 + (i % 3) * 12); ctx.lineTo(x + 60, GY + 44 + (i % 3) * 12); ctx.stroke();
    }
  }
}

// ============================ DOOR GUN ============================
export class DoorGun extends RailBase {
  constructor() {
    // 52s/quota 70 was non-binding: a brick holding fire hits 70 in ~40s
    // because kills here are spawn-capped, not aim-capped, so skill bought
    // about 3 seconds. Shorter timer and a slightly lower quota, since this is
    // the longest single block of runtime in the game.
    // v13.5 (+50% level length between cutscenes, Dylan): 44s -> 66s, quota
    // scaled with it since kills here are spawn-capped.
    super(66000, 112); // v13.5: 66s ceiling; a good gunner (132 kills possible) exits ~10s early
    this.hy = 300;              // heli altitude
    this.gunCd = 0;
    this.started = false;
    // v13.3 UPGRADE LIFECYCLE (Dylan: "make it so the helicopter can get
    // upgraded... everything can get upgraded and then get blown up, and you
    // lose it"). Metal Slug's SV-001 rule: the machine visibly gains hardware,
    // visibly LOSES that hardware as it takes damage, and dying in it is a
    // screen-clearing event rather than a quiet failure.
    this.tier = 1;              // 1 stock -> 2 gunship -> 3 warthog
    this.pips = 6; this.pipsMax = 6;   // v13.5: armour scaled with the +50% run (armour-per-second parity, lives stay at Dylan's 9)
    // v13.5: tier 3 used to drop at 36s of 44 -- eight seconds of warthog. With
    // the longer run the drops come earlier in proportion: every tier gets flown.
    this.upgradeAt = [8000, 21000, 36000]; // crate release times (shoot it or fly into it)
    this.upIdx = 0;
    this.turretCd = 0;
    this.aimA = 0;               // v11 (Dylan: "you need to be able to aim it") — A/D sweeps the M60 barrel independent of altitude
  }
  step(bits, dt, p) {
    if (this.done) return;
    this.stepCommon(dt, p);
    const dts = dt / 1000;
    this.scroll += dts;
    this.gunCd -= dt;
    if (!this.started) { this.started = true; this.ev({ e: 'banner', k: 'actDoorgun' }); this.ev({ e: 'hint', k: 'doorgunControls' }); }

    // fly: W/S altitude (dodge the flak)
    if (bits & C.UP) this.hy -= 260 * dts;
    if (bits & C.DOWN) this.hy += 260 * dts;
    if (bits & C.JUMP) this.hy -= 260 * dts;
    this.hy = Math.max(120, Math.min(500, this.hy));

    // v11: gun aim — A/D tilts the M60 up/down (it was always locked to one
    // fixed diagonal before; Dylan: "you need to be able to aim it")
    if (bits & C.L) this.aimA -= 1.1 * dts;
    if (bits & C.R) this.aimA += 1.1 * dts;
    this.aimA = Math.max(-0.55, Math.min(0.55, this.aimA));

    // spawn waves: ground rat squads, hover-rats, flak nests
    // v11.2 (Dylan: "the mice aren't shooting at you enough, neither are the
    // flying saucers, make it chaos") — spawns come in faster now, and rats/
    // hover units actually shoot back (see below), not just ram/decorate.
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 620 + Math.random() * 620;
      const r = Math.random();
      if (r < 0.5) { // squad of 3 running rats, each takes potshots at the heli
        for (let i = 0; i < 3; i++) this.foes.push({ k: 'rat', x: W + 80 + i * 70, y: GY, hp: 1, hpMax: 1, flash: 0, cd: 500 + Math.random() * 700 });
      } else if (r < 0.8) this.foes.push({ k: 'hover', x: W + 90, y: 220 + Math.random() * 260, hp: 2, hpMax: 2, flash: 0, ph: Math.random() * 6, cd: 700 + Math.random() * 500 });
      else this.foes.push({ k: 'nest', x: W + 90, y: GY, hp: 3, hpMax: 3, flash: 0, cd: 700 });
    }

    // door gun: J — stream of tracers, angle now swept by aimA (v11).
    // v11 fix: this origin was (260, hy+46) — nowhere near the actual M60,
    // which is why Dylan's screenshot showed the flash coming out the side of
    // the heli. A prior changelog claimed this was already pixel-measured and
    // fixed to (277, hy+107) — it wasn't actually in the code (same pattern
    // as the PT-boat/Grimtail false-verified-live claims, see main changelog).
    // Restoring that measured value now, for real, matching the render-side
    // muzzle flash position below.
    if ((bits & C.FIRE) && this.gunCd <= 0) {
      this.gunCd = 95; this.fireT = 70;
      this.ev({ e: 'sfx', n: 'sfx_shot' });
      const gx = 277, gyy = this.hy + 100;
      const ang = 0.598 + this.aimA, spd = 990;
      this.shots.push({ x: gx, y: gyy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, t: 1400 });
      // T2 rocket pods ripple two rounds off the stub wing alongside the M60,
      // so the upgrade changes how the gun FEELS and not just how it looks.
      if ((this.tier || 1) >= 2) {
        this.podT = (this.podT || 0) + 1;
        if (this.podT % 2 === 0) {   // v13.4: every other shot, was every third
          for (const off of [-0.075, 0.075]) {
            this.shots.push({ x: 210, y: this.hy + 118, vx: Math.cos(ang + off) * spd * 0.92,
              vy: Math.sin(ang + off) * spd * 0.92, t: 1400, pod: 1 });
          }
        }
      }
    }
    for (const s of this.shots) { s.x += s.vx * dts; s.y += s.vy * dts; s.t -= dt; }
    this.shots = this.shots.filter(s => s.t > 0 && s.y < H + 40);

    // foes
    for (const f of this.foes) {
      if (f.flash > 0) f.flash -= dt; // v12: decay the hit flash
      if (f.k === 'rat') {
        f.x -= 210 * dts; f.cd -= dt;
        // v11.2: ground rats now shoot small-arms fire up at the heli instead
        // of just being a running target — aimed at the heli's position when
        // they fire, using the same `flak` projectile pool as the nest.
        if (f.cd <= 0 && f.x < W - 40) {
          f.cd = 1400 + Math.random() * 900;
          const dxr = 220 - f.x, dyr = (this.hy + 30) - (f.y - 20);
          const dr = Math.max(1, Math.hypot(dxr, dyr)), aaSpd = 420;
          this.flak.push({ x: f.x, y: f.y - 20, vy: (dyr / dr) * aaSpd, vx: (dxr / dr) * aaSpd });
          this.ev({ e: 'sfx', n: 'sfx_laser' });
        }
      } else if (f.k === 'hover') {
        f.x -= 250 * dts; f.ph += dts * 3; f.y += Math.sin(f.ph) * 40 * dts; f.cd -= dt;
        // v11.2: hover rats now snipe from range too, not just ram on contact
        if (f.cd <= 0 && f.x < W - 30) {
          f.cd = 1300 + Math.random() * 700;
          const dxh = 220 - f.x, dyh = (this.hy + 30) - f.y;
          const dh = Math.max(1, Math.hypot(dxh, dyh)), hSpd = 460;
          this.flak.push({ x: f.x, y: f.y, vy: (dyh / dh) * hSpd, vx: (dxh / dh) * hSpd });
          this.ev({ e: 'sfx', n: 'sfx_laser' });
        }
      } else { // flak nest scrolls with ground, lobs rockets — faster now (v11.2)
        f.x -= 190 * dts; f.cd -= dt;
        if (f.cd <= 0 && f.x > 300 && f.x < W) { f.cd = 1100; this.flak.push({ x: f.x, y: f.y - 30, vy: -330, vx: 0 }); this.ev({ e: 'sfx', n: 'sfx_laser' }); }
      }
      // hover rats also still ram the heli at close range
      if (f.k === 'hover' && aabb(f.x, f.y, 220, this.hy + 30, 70)) { f.hp = 0; this.boom(f.x, f.y, 0); this.hurt(p, 1); }
      for (const s of this.shots) {
        if (s.t > 0 && aabb(s.x, s.y, f.x, f.y - (f.k === 'rat' ? 30 : 10), 46)) {
          f.hp--; s.t = 0; f.flash = 150; // v12: Metal Slug hit flash
          if (f.hp <= 0) { this.kills++; this.boom(f.x, f.y - 20, f.k !== 'rat'); this.ev({ e: 'fpsKill' }); }
        }
      }
    }
    this.foes = this.foes.filter(f => f.hp > 0 && f.x > -120);
    // v11.2: flak now optionally carries its own vx (aimed shots from rats/
    // hover units) on top of the ground-scroll drift the plain nest rockets
    // always had; vx defaults to 0 for those so their behavior is unchanged.
    for (const fk of this.flak) { fk.y += fk.vy * dts; fk.x += ((fk.vx || 0) - 190) * dts; }
    for (const fk of this.flak) {
      if (aabb(fk.x, fk.y, 220, this.hy + 30, 62)) { fk.y = -999; this.hurt(p, 1); }
    }
    this.flak = this.flak.filter(fk => fk.y > -80 && fk.y < H + 200 && fk.x > -100 && fk.x < W + 200);

    // v13.4: upgrades used to arrive on a wall clock -- "nothing is earned"
    // (the Metal Slug review, and Dylan: "the helicopter needs more power-ups
    // too... make it better somehow"). Now they are parachute crates that fall
    // through the airspace and you must FLY the Huey into them. Miss one and it
    // re-drops later. A crate at max tier is +1 armour pip instead.
    if (this.upIdx < this.upgradeAt.length && this.t > this.upgradeAt[this.upIdx]) {
      this.upIdx++;
      this.supplies = this.supplies || [];
      this.supplies.push({ x: W + 50, y: -50, vy: 52 });
    }
    for (const su of (this.supplies || [])) {
      su.y += su.vy * dts; su.x -= 74 * dts;
      for (const s2 of this.shots) {
        if (s2.t > 0 && aabb(s2.x, s2.y, su.x, su.y, 42)) { s2.t = 0; su.shotDown = 1; break; }
      }
      // rest height 560, not the deck: the Huey's floor is hy 500 and the
      // collect window is 84px, so a crate on the actual ground was reachable
      // by only 4px -- technically collectable, unreadably tight
      if (su.y > GY - 80) su.y = GY - 80;
      if (su.shotDown || aabb(su.x, su.y, 240, this.hy + 40, 84)) {
        su.got = 1;
        this.ev({ e: 'sfx', n: 'sfx_purr' });
        if (this.tier < 3) {
          this.tier++;
          this.ev({ e: 'banner', k: this.tier === 2 ? 'heliT2' : 'heliT3' });
        } else {
          this.pips = Math.min(this.pipsMax || 4, this.pips + 1);
          this.ev({ e: 'banner', k: 'heliPatched' });
        }
      } else if (su.x < -60) {          // missed -- another bird will re-drop it
        su.got = 1;
        this.upgradeAt.push(this.t + 8000);
      }
    }
    this.supplies = (this.supplies || []).filter(su => !su.got);
    // T3 chin turret. It used to fire on its own at the nearest foe, which a
    // speedrun tester correctly called out: the turret unlocks at t=26s, so the
    // last 18 seconds of the longest section in the game played themselves. It
    // is SLAVED TO YOUR TRIGGER now -- it only fires while you are firing, so
    // the upgrade amplifies what you are doing instead of replacing it.
    if (this.tier >= 3 && (bits & C.FIRE)) {
      this.turretCd -= dt;
      if (this.turretCd <= 0 && this.foes.length) {
        this.turretCd = 220;
        const tgt = this.foes.reduce((a, b) => (a && a.x < b.x ? a : b), null);
        if (tgt) { tgt.hp--; tgt.flash = 120; if (tgt.hp <= 0) { this.kills++; this.boom(tgt.x, tgt.y - 16, 0); } }
      }
    }
    if (this.ended()) { this.done = true; this.ev({ e: 'banner', k: 'doorgunDone' }); }
    this.prevBits = bits;
  }

  render(ctx, now, drawRotor) {
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save(); ctx.translate(sx, 0);
    this.drawSky(ctx, 140);
    // foes
    for (const f of this.foes) {
      const img = f.k === 'hover' ? IMG.ufo_small : IMG.alien_trooper;
      if (img) {
        const h2 = f.k === 'hover' ? 64 : 84;
        const w2 = h2 * (img.width / img.height);
        drawImgHit(ctx, img, f.x - w2 / 2, f.y - h2, w2, h2, (f.flash || 0) / 150, f.hpMax ? f.hp / f.hpMax : 1);
      }
      // v13.3: this was the LAST teal debug rectangle in the game. Dylan
      // reported "a weird blue square on some of the rats"; that was fixed in
      // render.js and this one was missed, so a QA pass still found 2,600+
      // pixels of flat #3FA7A0 under the rat line in the door-gun section. It
      // is an anti-air emplacement -- draw it as one: sandbags and a barrel.
      if (f.k === 'nest') {
        ctx.fillStyle = '#4e4630';
        ctx.beginPath(); ctx.ellipse(f.x, f.y - 6, 30, 15, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#3b3526';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.ellipse(f.x + i * 19, f.y - 4, 11, 7, 0, Math.PI, 0); ctx.fill();
        }
        ctx.strokeStyle = '#23201a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(f.x, f.y - 14); ctx.lineTo(f.x + 6, f.y - 40); ctx.stroke();
        ctx.fillStyle = PAL.outline;
        ctx.fillRect(f.x + 3, f.y - 46, 8, 8);
      }
    }
    // flak / aimed anti-air fire — v11.2: oriented along travel direction
    // now that rats/hover units aim shots instead of only the nest's
    // always-straight-up rockets.
    ctx.fillStyle = PAL.acid;
    for (const fk of this.flak) {
      const angF = Math.atan2(fk.vy, (fk.vx || 0) - 190);
      ctx.save(); ctx.translate(fk.x, fk.y); ctx.rotate(angF + Math.PI / 2);
      ctx.fillRect(-3, -12, 6, 24);
      ctx.restore();
    }
    // tracers
    ctx.strokeStyle = PAL.tracer; ctx.lineWidth = 4;
    for (const s of this.shots) {
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); ctx.stroke();
    }
    // the Huey with Charlie on the door
    const hi = IMG.huey_doorgun || IMG.heli_us;
    if (hi) {
      const hh = 150, hw = hh * (hi.width / hi.height);
      const bobY = Math.sin(now / 300) * 7;
      // v13 (Dylan: "your helicopter should also glow colors when it gets hit
      // and start smoking when you get low on health, and blow up when you die
      // and get replaced"). The Huey had no damage read at all -- the only
      // feedback for taking a hit was the same red screen wash every mode uses,
      // so the aircraft itself looked untouched right up to death.
      // hurtT is set by RailBase.hurt(); p.hp/CFG.hpMax is the hull state.
      // Dylan: "when you get shot, the helicopter turns white. Make it so it
      // turns colored the same way enemies do." The flash was tied to the
      // 900ms INVULNERABILITY window, so a 190px airframe sat as a ~92%-opaque
      // white cutout for nearly a second. Flash is now its own short timer
      // (flashT, 130ms) like the enemies' 150ms, so the i-frames stay long
      // while the visual is a quick pulse.
      const hurtK = Math.max(0, this.flashT || 0) / 130;
      const hpK = Math.max(0, Math.min(1, (this._p ? this._p.hp : CFG.hpMax) / CFG.hpMax));
      // engine smoke below 60% hull, thickening as it drops
      if (hpK < 0.6) {
        this.smokeT = (this.smokeT || 0) + 1;
        if (this.smokeT % Math.max(1, Math.round(2 + hpK * 6)) === 0) {
          this.hsmoke = this.hsmoke || [];
          this.hsmoke.push({ x: 150 + Math.random() * 40, y: this.hy + 70 + Math.random() * 20, t: 0,
            T: 900 + Math.random() * 500, r: 8 + Math.random() * 8, dark: hpK < 0.3 });
        }
      }
      for (const q of (this.hsmoke || [])) {
        const k2 = q.t / q.T;
        const gr = ctx.createRadialGradient(q.x - k2 * 190, q.y - k2 * 26, 0, q.x - k2 * 190, q.y - k2 * 26, q.r * (1 + k2 * 2.4));
        const base = q.dark ? '40,36,32' : '90,84,76';
        gr.addColorStop(0, `rgba(${base},${(0.5 * (1 - k2)).toFixed(3)})`);
        gr.addColorStop(1, `rgba(${base},0)`);
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(q.x - k2 * 190, q.y - k2 * 26, q.r * (1 + k2 * 2.4), 0, 7); ctx.fill();
      }
      ctx.save();
      ctx.translate(140 + hw / 2, this.hy + hh / 2 + bobY);
      // below 30% hull the airframe judders
      if (hpK < 0.3) ctx.rotate(0.05 + Math.sin(now / 40) * 0.02 * (1 - hpK));
      else ctx.rotate(0.05);
      ctx.drawImage(hi, -hw / 2, -hh / 2, hw, hh);
      // v13.3 upgrade hardware, drawn INSIDE the airframe transform so it
      // banks and judders with the hull. Bolted on at the drop, gone again
      // when a hit strips a tier -- the whole point is that you can see what
      // you have and see it taken away.
      if ((this.tier || 1) >= 2) {
        // stub wing + 7-shot rocket pod under the belly
        ctx.fillStyle = '#3a3f30'; ctx.fillRect(-hw * 0.10, hh * 0.22, hw * 0.30, hh * 0.05);
        ctx.fillStyle = '#4a5140';
        ctx.beginPath(); ctx.ellipse(hw * 0.06, hh * 0.30, hw * 0.13, hh * 0.055, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#1c1f18';
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(hw * 0.16, hh * 0.285 + (i - 1.5) * hh * 0.022, hh * 0.011, 0, 7); ctx.fill(); }
      }
      if ((this.tier || 1) >= 3) {
        // chin turret: a stubby minigun cluster that tracks with a slow sweep
        const sw = Math.sin(now / 260) * 0.22;
        ctx.save(); ctx.translate(-hw * 0.30, hh * 0.16); ctx.rotate(sw);
        ctx.fillStyle = '#2e332a'; ctx.beginPath(); ctx.arc(0, 0, hh * 0.075, 0, 7); ctx.fill();
        ctx.fillStyle = '#191c15'; ctx.fillRect(-hw * 0.10, -hh * 0.018, hw * 0.11, hh * 0.036);
        ctx.restore();
      }
      // hit flash: same source-atop silhouette trick the enemies use, so the
      // aircraft itself blows out white then settles to red as the hull drops.
      if (hurtK > 0.02) {
        drawImgHit(ctx, hi, -hw / 2, -hh / 2, hw, hh, hurtK, hpK);
      }
      if (drawRotor) { drawRotor(ctx, -hw * 0.02, -hh / 2 + 4, hw * 0.55, now); }
      ctx.restore();
      // v11.2 (Dylan: "its a random black line coming out of the gun... it
      // should be the vietnamese cats actual door gun that he's holding
      // animated to move upwards and downwards") — replaced the procedural
      // stroke-line barrel with a real gunner+gun sprite (huey_gunner.png)
      // that pivots around its own baked-in pintle-mount point at (277,
      // hy+107), same anchor the old line and the shot origin both used.
      // The art is already drawn at roughly the right base angle, so only
      // the aimA sweep (not the full 0.598rad base angle) is applied as
      // rotation — rotating by the full `ang` here would double up the tilt
      // and make the gunner spin further than the barrel actually sweeps.
      // v12 (Dylan: "fix the helicopter shooting scene its like a giant cat on
      // top of the heli, it should just be one of the cats sticking out the
      // side"). He was right, and the cause was scale: huey_gunner.png was
      // drawn at gh2=190 on top of a helicopter drawn at hh=150 -- a gunner
      // taller than his own aircraft, anchored high and behind it, reading as
      // a giant cat riding the rotor.
      //
      // The deeper problem is that the overlay was never needed. huey_doorgun.png
      // ALREADY has a door gunner painted into it: a VC cat in a conical straw
      // hat standing in the open side door with the gun pointed right -- exactly
      // "one of the cats sticking out the side". v11.2 layered a second, larger,
      // differently-designed cat (orange, red headband) on top of him. So the
      // fix is to delete the overlay and articulate the gun the baked-in gunner
      // is already holding.
      //
      // gx/gy2 is the muzzle of that baked-in gun, not an arbitrary point: the
      // helicopter draws from x=140 at width 175.8, and the gun muzzle sits at
      // u=0.783 of the sprite -> 140 + 0.783*175.8 = 277.6, and v=0.693 of
      // height 150 = 104 ~= 107. That is why the old procedural line and the
      // shot origin both used it. We pivot the barrel about the same anchor so
      // it stays welded to the gunner's paws at every aim angle.
      const gx = 277, gy2 = this.hy + 100 + bobY;
      const ang = 0.598 + this.aimA;
      // v13.2 (Dylan, with M60D reference photos: "the gun that aims looks
      // like a separate entity... the cat should be manning the gun, and it
      // should be one thing that you can aim"). The procedural rects read as a
      // floating black tube. Real M60D sprite now, pivoted at the same pintle
      // anchor so it stays welded to the baked-in gunner's paws; the mount
      // point on the ART is ~28% along the gun, so that point sits on the
      // pivot at every aim angle -- gun and gunner move as one machine.
      const cA = Math.cos(ang), sA = Math.sin(ang);
      const m60 = IMG.m60_doorgun;
      ctx.save();
      ctx.translate(gx, gy2);
      ctx.rotate(ang);
      if (m60) {
        // v13.3 (Dylan: "the gun on the helicopter got a weird ghost image on
        // it"). Two causes, both now fixed in the ART rather than here.
        // 1. m60_doorgun.png was a broken matte: the gun's dark body had been
        //    keyed out along with the background, leaving a HOLLOW magenta
        //    outline you could see the helicopter through -- literally a ghost
        //    gun. Body refilled with a gunmetal ramp, halo replaced with the
        //    real outline colour.
        // 2. huey_doorgun.png has a second gun painted into it, so the
        //    articulated M60 slid off a fixed one every time you aimed. That
        //    baked-in gun is painted out; the door frame behind it reads as a
        //    shadowed recess and the gunner's paws now hold only this sprite.
        // Anchor follows the repaint: pivot at 34%/50% of the art puts the
        // receiver in his paws at every angle, and the gun is 84px so it reads
        // at the helicopter's 150px scale.
        // v13.3: the M60 fired without moving a pixel, which is why a burst
        // read as a flash appearing next to a prop. Real recoil now: the gun
        // slams back along its own barrel axis and the muzzle climbs, both
        // decaying over the 70ms shot timer, so at 95ms cadence it judders
        // continuously while you hold the trigger.
        const rk = Math.max(0, this.fireT) / 70;
        const gw = 84, gh = gw * (m60.height / m60.width);
        ctx.save();
        ctx.rotate(-rk * 0.09);                       // muzzle climb
        ctx.drawImage(m60, -gw * 0.34 - rk * 7, -gh * 0.50 + rk * 2, gw, gh);
        ctx.restore();
      } else { // fallback: the old procedural barrel
        ctx.fillStyle = '#3a3a32'; ctx.fillRect(-12, -4, 46, 8);
        ctx.fillStyle = '#55554a'; ctx.fillRect(-12, -4, 46, 2);
        ctx.fillStyle = '#26231c'; ctx.fillRect(30, -5.5, 8, 11);
        ctx.fillStyle = '#2f2f28'; ctx.fillRect(-18, -6, 10, 12);
      }
      ctx.restore();
      if (this.fireT > 0) {
        drawMuzzleBurst(ctx, gx + cA * 62, gy2 + sA * 62, ang, this.fireT / 70);
      }
    }
    // parachute supply crates — fly the Huey into one, or shoot it down to you
    for (const su of (this.supplies || [])) drawSupplyCrate(ctx, su.x, su.y, now);
    this.drawBooms(ctx);
    if (this.hurtT > 0) { ctx.fillStyle = `rgba(160,20,10,${Math.min(0.4, this.hurtT / 1200)})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    // timer bar
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(W / 2 - 200, 14, 400, 10);
    ctx.fillStyle = PAL.cheese; ctx.fillRect(W / 2 - 200, 14, 400 * Math.min(1, this.t / this.dur), 10);
    // armour pips + current airframe tier: the upgrade you can lose, readable
    // at a glance so the strip-a-tier hit lands as a loss and not a mystery.
    ctx.font = 'bold 20px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = this.pips <= 1 ? PAL.redAccent : PAL.hud;
    ctx.fillText('HULL ' + '▮'.repeat(Math.max(0, this.pips)) + '▯'.repeat(Math.max(0, 4 - this.pips)), 24, 86);
    const tn = ['', 'HUEY', 'HUEY + PODS', 'HUEY GUNSHIP'][this.tier || 1];
    ctx.fillStyle = (this.tier || 1) > 1 ? PAL.cheese : PAL.hudDim;
    ctx.fillText(tn, 24, 112);
  }
}

// ============================ SKYRAIDER ============================
export class Skyraider extends RailBase {
  constructor() {
    // v13.3 quota 34 -> 20. 34 was still unreachable: with the quota lifted and
    // the full 52s run out, eight runs averaged 22.1 kills and PEAKED at 30, so
    // the exit condition never once fired and the section was a flat 52-second
    // ride for every player at every skill -- the longest single block in the
    // game, and the one where skill bought nothing. 20 is hit around 25-35s by
    // someone shooting well, so accuracy now buys real time; the 52s timer
    // stays as the ceiling for everyone else.
    // quota 42 -> 34: with napalm halved below, 42 is out of reach (a naive
    // run now lands 22-30) and the section always ran its full timer again.
    // 34 sits just above a no-aim run, so it's the gun that gets you out early.
    super(72000, 95); // v13.5: 72s ceiling; sustained ~1.6 kills/s makes accuracy buy ~11s
    this.py = 260; this.spd = 340;
    this.pips = 4; this.pipsMax = 4;   // v13.5: +50% run, armour scaled with it
    // napalm 8 -> 4: measured, the dominant Skyraider strategy was to NOT fly
    // -- sit at a fixed altitude mashing K, where napalm supplied 31 of 40
    // kills (77%) and taking the aim axis (altitude) was actively the worst
    // policy in the game. Halving the free canisters makes the gun, and
    // therefore moving, matter again.
    // v13.4 (Dylan: "Double the amount of napalm that we have. Running out
    // sucks. You can only run out at the end, maybe.") 4 -> 8. The original
    // nerf existed because the gun could not hit the ground so napalm was the
    // only tool; the dive-strafe below fixes the actual cause, so the ceiling
    // can come back up. More arrives by supply drop mid-run.
    this.gunCd = 0; this.napalm = 8; this.cans = []; this.fires = [];
    // v13.4 DIVE-STRAFE (Dylan: "There's no way when I'm in the A-1 to shoot
    // the mice on the ground... make it so the plane can dive down and shoot
    // the ground, but has to pull up before it gets too low... you should be
    // able to kill some of the rats with your propeller, blood flying
    // everywhere"). This is the mechanic that separates the plane from the
    // helicopter: the Huey aims its gun, the A-1 aims ITSELF.
    this.warnT = 0;              // time spent below the hard deck
    this.tier = 1;               // 1 stock guns -> 2 twin wing guns (supply drop)
    this.supplies = []; this.supplyT = 5000;
    this.propGore = [];          // prop-kill viscera
    // v13.3: the A-1 gets a hull, same as the Huey. Measured, this section
    // killed the reference bot FIVE times against the door gun's one -- with
    // lives: 9 that alone ended most runs before the boss, and simtest could
    // not see it because it forces lives = 99. Nerfing the treeline guns far
    // enough to fix it on its own would have emptied the sky, so the plane
    // absorbs the first three hits per airframe instead and the fire stays
    // thick. Refilled on each new aircraft (see RailBase.hurt).
    this.started = false;
  }
  step(bits, dt, p) {
    if (this.done) return;
    this.stepCommon(dt, p);
    const dts = dt / 1000;
    this.gunCd -= dt;
    if (!this.started) { this.started = true; this.ev({ e: 'banner', k: 'actSkyraider' }); this.ev({ e: 'hint', k: 'skyControls' }); this.ev({ e: 'engine', on: true, name: 'sfx_plane' }); }

    // a ~0.4s-stale altitude for the treeline gunners to aim at, so climbing or
    // diving actually shakes their shots instead of dragging them along with you
    this.lastPy = this.lastPy === undefined ? this.py : this.lastPy + (this.py - this.lastPy) * Math.min(1, dts * 2.5);
    if (bits & C.UP) this.py -= 300 * dts;
    if (bits & C.DOWN) this.py += 330 * dts;
    // floor extended 540 -> 600: the strafing run. Below 470 the guns angle
    // down at the treeline; below 552 the PULL UP warning flashes; touch 585
    // and you have flown the airframe into Vietnam -- one hull hit and an
    // automatic bounce back to altitude.
    this.py = Math.max(90, Math.min(600, this.py));
    this.diving = this.py > 470;
    if (this.py > 552) {
      this.warnT += dt;
      if ((this.warnT % 400) < 20) this.ev({ e: 'sfx', n: 'sfx_reload' }); // warning tick
      if (this.py >= 585) { this.hurt(p, 1); this.py = 380; this.warnT = 0; this.ev({ e: 'banner', k: 'skyGroundStrike' }); }
    } else this.warnT = 0;
    // PROP KILL: on the deck, the propeller arc IS a weapon. Nose sits ~76px
    // ahead of centre; any ground rat walking into the disc is churned into
    // gore. Dylan: "blood flying everywhere."
    // 530, not 505: the prop disc only reaches the rats when you are INSIDE
    // the PULL UP band, so mowing with the propeller means flirting with the
    // ground the whole time -- measured, a riskless 505 cleared the whole
    // quota by prop alone in 13 seconds.
    if (this.py > 530) {
      for (const f of this.foes) {
        if (f.k === 'rat' && f.hp > 0 && !f.dying && f.x > 300 && f.x < 372 && this.py > 530) {
          f.hp = 0; this.kills++; this.ev({ e: 'fpsKill' });
          this.ev({ e: 'sfx', n: 'sfx_gore' });
          this.shake = Math.max(this.shake, 8);
          for (let i = 0; i < 26; i++) {
            this.propGore.push({ x: 336 + (Math.random() - 0.5) * 30, y: this.py + 20 + (Math.random() - 0.5) * 40,
              vx: 120 + Math.random() * 340, vy: -260 + Math.random() * 380,
              t: 0, T: 500 + Math.random() * 400, green: Math.random() < 0.7 ? 1 : 0 });
          }
        }
      }
    }
    for (const q of this.propGore) { q.t += dt; q.x += q.vx * dts - this.spd * 0.3 * dts; q.y += q.vy * dts; q.vy += 900 * dts; }
    this.propGore = this.propGore.filter(q => q.t < q.T);
    if (bits & C.L) this.spd = Math.max(230, this.spd - 320 * dts);
    if (bits & C.R) this.spd = Math.min(540, this.spd + 320 * dts);
    this.scroll += this.spd * dts / 340;

    // v13.4 SUPPLY DROPS, for both aircraft: parachute crates you have to FLY
    // INTO, so an upgrade is something you went and got rather than a gift on
    // a wall clock (the Metal Slug review's point, verbatim: "nothing is
    // earned"). Cycle: napalm, twin wing guns, hull repair.
    this.supplyT -= dt;
    if (this.supplyT <= 0) {
      this.supplyT = 9000 + Math.random() * 3000;
      const kinds = ['napalm', 'guns', 'repair'];
      this.supplies.push({ x: W + 70, y: 90, vy: 34, k: kinds[(this._supN = ((this._supN || 0) + 1)) % 3] });
    }
    for (const su of this.supplies) {
      su.y += su.vy * dts; su.x -= (95 + this.spd * 0.28) * dts;
      if (su.y > GY - 30) su.y = GY - 30;
      // shooting the crate pops the chute and claims it too (Dylan: "make it
      // so you can just shoot it and get the power-up")
      let shot = false;
      for (const s2 of this.shots) {
        if (s2.t > 0 && aabb(s2.x, s2.y, su.x, su.y, 42)) { s2.t = 0; shot = true; break; }
      }
      if (shot || aabb(su.x, su.y, 280, this.py, 74)) {
        su.got = 1;
        this.ev({ e: 'sfx', n: 'sfx_purr' });
        if (su.k === 'napalm') { this.napalm = Math.min(12, this.napalm + 3); this.ev({ e: 'banner', k: 'skyNapalmUp' }); }
        else if (su.k === 'guns') { this.tier = 2; this.ev({ e: 'banner', k: 'skyGunsUp' }); }
        else { this.pips = Math.min(this.pipsMax, this.pips + 1); this.ev({ e: 'banner', k: 'skyRepair' }); }
      }
    }
    this.supplies = this.supplies.filter(su => !su.got && su.x > -80);

    // spawns: treeline rats, flak bursts, diving saucers
    // v11.2 (Dylan: "the mice aren't shooting at you enough, neither are the
    // flying saucers, make it chaos") — faster spawns, and both rats and
    // saucers now shoot real anti-air fire (see the foes loop below), not
    // just sit there as scenery/napalm fodder or ram-only hazards.
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 500 + Math.random() * 600;
      const r = Math.random();
      if (r < 0.55) { for (let i = 0; i < 3; i++) this.foes.push({ k: 'rat', x: W + 90 + i * 60, y: GY, hp: 1, hpMax: 1, flash: 0, cd: 400 + Math.random() * 700 }); }
      else if (r < 0.8) this.foes.push({ k: 'burst', x: W + 60, y: this.py + (Math.random() - 0.5) * 200, t: 0, hp: 99 });
      else this.foes.push({ k: 'ufo', x: W + 100, y: 120 + Math.random() * 240, hp: 2, hpMax: 2, flash: 0, ph: 0, cd: 600 + Math.random() * 500 });
    }

    // guns
    if ((bits & C.FIRE) && this.gunCd <= 0) {
      this.gunCd = 110; this.fireT = 70;
      this.ev({ e: 'sfx', n: 'sfx_shot' });
      // diving pitches the guns into the ground ahead -- the strafing run.
      // Level flight fires flat, exactly as before.
      const dvy = this.diving ? 620 : 0;
      this.shots.push({ x: 330, y: this.py + 12, vx: 1050, vy: dvy, t: 1000 });
      if (this.tier >= 2) this.shots.push({ x: 330, y: this.py + 26, vx: 1040, vy: dvy + 60, t: 1000 }); // twin wing guns
    }
    for (const s of this.shots) {
      s.x += s.vx * dts; s.y += (s.vy || 0) * dts; s.t -= dt;
      // strafing rounds chew the dirt where they land
      if (s.y > GY + 6) { s.t = 0; this.propGore.push({ x: s.x, y: GY + 4, vx: -this.spd * 0.3, vy: -180 - Math.random() * 160, t: 0, T: 260, green: 2 }); }
    }
    this.shots = this.shots.filter(s => s.t > 0);

    // napalm: K drops a tumbling canister
    if ((bits & C.GREN) && !(this.prevBits & C.GREN)) {
      if (this.napalm > 0) {
        this.napalm--;
        // v13.4: the canister used to release at vx spd*0.55 and land ~70px
        // ahead of the nose -- and the fire then scrolled off screen before
        // the incoming rat stream ever reached it, which is why napalm only
        // ever caught whatever was already point-blank. Thrown properly
        // forward it lands ~700px downrange, IN the stream, and the wall of
        // fire finally does what a wall of fire is for.
        this.cans.push({ x: 300, y: this.py + 30, vx: this.spd * 1.5, vy: -60, r: 0 });
        this.ev({ e: 'sfx', n: 'sfx_meow' });
      } else this.ev({ e: 'banner', k: 'napalmOut' });
    }
    for (const cn of this.cans) {
      cn.x += (cn.vx - this.spd * 0.35) * dts; cn.y += cn.vy * dts; cn.vy += 500 * dts; cn.r += dts * 6;
      if (cn.y >= GY - 6) {
        cn.y = 9999;
        this.fires.push({ x: cn.x, w: 340, t: 0 });
        this.boom(cn.x, GY - 20, 1);
        this.ev({ e: 'sfx', n: 'sfx_napalm' });
      }
    }
    this.cans = this.cans.filter(cn => cn.y < H + 100);
    for (const fr of this.fires) {
      fr.t += dt; fr.x -= this.spd * 0.35 * dts * 60 / 60;
      // v13.3 (a teenage playtester: "I pressed K and half the rat horde
      // vanished -- no fire, no wall of flame, no lingering burn. It's called
      // napalm. It should look like napalm. Right now it's a delete button.")
      // He was right, and the cause was ordering: the fire killed on the frame
      // it spawned, while the flame wall itself ramps in over 400ms -- so
      // everything was already gone before there was anything to see. They
      // catch fire now and run burning for most of a second before they drop,
      // which is what makes it read as napalm instead of a cull.
      for (const f of this.foes) {
        if (f.k === 'rat' && !f.burning && Math.abs(f.x - fr.x) < fr.w / 2 && fr.t < 2400) {
          f.burning = 700 + Math.random() * 400;
          this.ev({ e: 'sfx', n: 'sfx_screech' });
        }
      }
    }
    this.fires = this.fires.filter(fr => fr.t < 2800);

    for (const f of this.foes) {
      if (f.flash > 0) f.flash -= dt; // v12: decay the hit flash
      // burning: it runs, alight, and then it drops -- the kill is the END of
      // the animation rather than the start of it
      // v13.4 (Dylan: "when I'm napalming the rats... have them set on fire
      // and have a new animation of them dying, because right now it's not
      // that good"). No more explosion at the end of the burn -- a napalmed
      // rat is not a bomb. It burns, staggers, then CRUMPLES: keels over,
      // sinks into the fire and chars away, flames riding it the whole way.
      if (f.burning > 0 && !f.dying) {
        f.burning -= dt;
        if (f.burning <= 0 && f.hp > 0) {
          f.dying = 620; f.dying0 = 620;
          this.kills++; this.ev({ e: 'fpsKill' });
          this.ev({ e: 'sfx', n: 'sfx_gore' });
        }
      }
      if (f.dying) {
        f.dying -= dt;
        if (f.dying <= 0) { f.hp = 0; }
        continue;                      // a crumpling rat no longer walks or shoots
      }
      if (f.k === 'rat') {
        f.x -= (120 + this.spd * 0.35) * dts; f.cd -= dt;
        // v11.2: ground troops now take real potshots at the plane, using the
        // same flak pool the door-gun section already had.
        // v13.3 BALANCE. Measured with the reference bot: the Skyraider killed
        // it FIVE times per run against the door gun's one, and an ablation
        // pinned it on this line -- deaths went 5.0 -> 1.2 with the flak
        // removed, and 5.0 -> 1.6 with these rats removed. With lives: 9 that
        // made the whole game unwinnable at any skill, which simtest could
        // never see because it forces lives = 99.
        //
        // The cause was density plus perfect aim. Rats spawn THREE at a time,
        // each firing every 1.3-2.2s dead at your CURRENT altitude at 440px/s.
        // One aimed shot is a dodge; eleven of them on screen at once is a
        // wall with no gap in it. Metal Slug's rule is dense-and-telegraphed or
        // sparse-and-aimed, never dense-and-aimed.
        //
        // So: slower cadence, slower rounds you can actually see coming, aim at
        // where you WERE with a spread so moving beats them, and a hard cap on
        // how much can be in the air at once.
        if (f.cd <= 0 && f.x < W - 20 && this.flak.length < 5) {
          f.cd = 1900 + Math.random() * 1100;
          const aimY = (this.lastPy !== undefined ? this.lastPy : this.py) + (Math.random() - 0.5) * 90;
          const dxr = 320 - f.x, dyr = aimY - (f.y - 20);
          const dr = Math.max(1, Math.hypot(dxr, dyr)), aaSpd = 330;
          this.flak.push({ x: f.x, y: f.y - 20, vy: (dyr / dr) * aaSpd, vx: (dxr / dr) * aaSpd });
          this.ev({ e: 'sfx', n: 'sfx_laser' });
        }
      } else if (f.k === 'burst') {
        // Flak bursts were inert -- 506 spawns measured across 40 sections, 0
        // hits, ever. They armed on their own AGE (f.t between 220 and 480ms)
        // but were hit-tested against the player's fixed screen x of 260,
        // while spawning at x=W+60 and drifting left at spd*0.7 = 238px/s.
        // Reaching the player takes ~4.5s; they disarmed at 480ms and were
        // deleted at 900ms. A quarter of this section's spawn budget did
        // nothing. Arm on PROXIMITY instead, which is what makes holding a
        // single safe altitude punishable the way the section intends.
        f.t += dt; f.x -= this.spd * 0.7 * dts;
        if (!f.armed && Math.abs(f.x - 260) < 90) {
          f.armed = 1;
          // 78 against a ~66px airframe meant a burst at your altitude was
          // barely avoidable; 60 leaves a real gap to climb or dive through.
          if (Math.abs(f.y - this.py) < 60) this.hurt(p, 1);
        }
        if (f.x < -80) f.hp = 0;
      }
      else if (f.k === 'ufo') {
        f.ph += dts * 2.4; f.x -= (this.spd * 0.5 + 160) * dts; f.y += Math.sin(f.ph) * 90 * dts; f.cd -= dt;
        if (aabb(f.x, f.y, 260, this.py, 66)) { f.hp = 0; this.boom(f.x, f.y, 1); this.hurt(p, 1); }
        // v11.2: saucers now actually shoot at you from range instead of only ramming
        if (f.cd <= 0 && f.hp > 0 && f.x < W - 20) {
          f.cd = 1000 + Math.random() * 600;
          const dxu = 320 - f.x, dyu = this.py - f.y, du = Math.max(1, Math.hypot(dxu, dyu)), uSpd = 500;
          this.flak.push({ x: f.x, y: f.y, vy: (dyu / du) * uSpd, vx: (dxu / du) * uSpd });
          this.ev({ e: 'sfx', n: 'sfx_laser' });
        }
      }
      for (const s of this.shots) {
        if (s.t > 0 && f.k !== 'burst' && aabb(s.x, s.y, f.x, f.y - (f.k === 'rat' ? 30 : 0), 48)) {
          f.hp--; s.t = 0; f.flash = 150; // v12: Metal Slug hit flash
          if (f.hp <= 0) { this.kills++; this.boom(f.x, f.y - 16, f.k === 'ufo'); this.ev({ e: 'fpsKill' }); }
        }
      }
    }
    this.foes = this.foes.filter(f => f.hp > 0 && f.x > -140);
    // v11.2: step/collide/expire the flak this section now uses (door-gun's
    // version lives in DoorGun.step above; Skyraider gets its own copy since
    // the two classes don't share a step method).
    for (const fk of this.flak) { fk.y += fk.vy * dts; fk.x += ((fk.vx || 0) - this.spd * 0.35) * dts; }
    for (const fk of this.flak) {
      if (aabb(fk.x, fk.y, 320, this.py, 56)) { fk.y = -999; this.hurt(p, 1); }
    }
    this.flak = this.flak.filter(fk => fk.y > -80 && fk.y < H + 200 && fk.x > -100 && fk.x < W + 200);

    if (this.ended()) { this.done = true; this.ev({ e: 'banner', k: 'skyDone' }); this.ev({ e: 'engine', on: false }); }
    this.prevBits = bits;
  }

  render(ctx, now) {
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save(); ctx.translate(sx, 0);
    this.drawSky(ctx, 220);
    // v13.4 (Dylan: "weird green triangles in the foreground"). The treeline
    // was a row of bare triangles. Palm silhouettes now: curved trunk, a burst
    // of drooping fronds, varied heights and leans, still cheap to draw.
    ctx.fillStyle = '#1d2b12'; ctx.strokeStyle = '#1d2b12';
    for (let i = 0; i < 12; i++) {
      const x = W - ((this.scroll * 340 * 0.7 + i * 160) % (W + 320)) + 160;
      const th = 70 + (i * 37 % 60);
      const lean = ((i * 53 % 21) - 10) * 0.02;
      const topX = x + lean * th * 3, topY = GY + 34 - th;
      ctx.lineWidth = 7 - th * 0.02;
      ctx.beginPath(); ctx.moveTo(x, GY + 36); ctx.quadraticCurveTo(x + lean * th * 1.4, GY + 34 - th * 0.6, topX, topY); ctx.stroke();
      for (let fnd = 0; fnd < 6; fnd++) {                       // fronds droop from the crown
        const fa = -Math.PI * 0.9 + fnd * (Math.PI * 0.8 / 5) + lean;
        const fl = 26 + (i * 7 + fnd * 11) % 14;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(topX, topY);
        ctx.quadraticCurveTo(topX + Math.cos(fa) * fl, topY + Math.sin(fa) * fl,
          topX + Math.cos(fa) * fl * 1.5, topY + Math.sin(fa) * fl * 0.9 + 13);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(topX, topY, 5, 0, 7); ctx.fill();  // coconut crown
    }
    // rats + saucers + flak
    for (const f of this.foes) {
      if (f.k === 'burst') {
        const k = Math.min(1, f.t / 480);
        ctx.fillStyle = `rgba(40,40,36,${(0.8 - k * 0.5).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, 12 + k * 34, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(255,170,60,${(0.8 * (1 - k)).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, 8 + k * 16, 0, 7); ctx.fill();
        continue;
      }
      const img = f.k === 'ufo' ? IMG.ufo_small : IMG.alien_trooper;
      if (img) {
        const h2 = f.k === 'ufo' ? 70 : 84;
        const w2 = h2 * (img.width / img.height);
        // the napalm crumple: keel over, sink into the burn, char to black
        const dyK = f.dying ? 1 - f.dying / (f.dying0 || 620) : 0;
        ctx.save();
        if (dyK > 0) {
          ctx.translate(f.x, f.y);
          ctx.rotate(dyK * 1.45);
          ctx.translate(-f.x, -(f.y - dyK * 16));
          ctx.globalAlpha = Math.max(0.15, 1 - dyK * 0.85);
        }
        drawImgHit(ctx, img, f.x - w2 / 2, f.y - h2, w2, h2, (f.flash || 0) / 150,
          f.dying ? 0.05 : (f.hpMax ? f.hp / f.hpMax : 1));
        ctx.restore();
        // alight: flame tongues licking up the body — and they RIDE the body
        // down through the whole crumple rather than cutting out
        if (f.burning > 0 || f.dying) {
          const bk = f.dying ? Math.max(0.35, f.dying / (f.dying0 || 620)) : Math.min(1, f.burning / 700);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 5; i++) {
            const fx = f.x + (i - 2) * (w2 * 0.16);
            const fh = (26 + Math.sin(now / 60 + i * 1.9 + f.x) * 12) * (0.6 + bk * 0.6);
            const gr = ctx.createRadialGradient(fx, f.y - h2 * 0.45, 0, fx, f.y - h2 * 0.45, fh);
            gr.addColorStop(0, `rgba(255,240,190,${(0.55 * bk).toFixed(2)})`);
            gr.addColorStop(0.45, `rgba(255,150,40,${(0.40 * bk).toFixed(2)})`);
            gr.addColorStop(1, 'rgba(120,40,10,0)');
            ctx.fillStyle = gr;
            ctx.beginPath(); ctx.arc(fx, f.y - h2 * 0.45 - fh * 0.3, fh, 0, 7); ctx.fill();
          }
          ctx.restore();
        }
      }
    }
    // v11.2: enemy anti-air fire from rats/saucers (was never drawn before —
    // Skyraider didn't use `flak` at all until this round)
    ctx.fillStyle = PAL.acid;
    for (const fk of this.flak) {
      const ang2 = Math.atan2(fk.vy, (fk.vx || 0) - this.spd * 0.35);
      ctx.save(); ctx.translate(fk.x, fk.y); ctx.rotate(ang2);
      ctx.fillRect(-9, -3, 18, 6);
      ctx.restore();
    }
    // napalm canisters + fire walls
    ctx.fillStyle = '#5d6b2f';
    for (const cn of this.cans) {
      ctx.save(); ctx.translate(cn.x, cn.y); ctx.rotate(cn.r); ctx.fillRect(-14, -5, 28, 10); ctx.restore();
    }
    // v13.4 (Dylan: "napalm fire is pointed... weird triangles coming up from
    // the ground... get rid of that and just make more fire"). The old flames
    // were literally quadratic-curve TRIANGLES. Real fire now, built the same
    // way as the muzzle flash that already reads right: additive radial
    // gradients, white-hot at the root cooling to orange and ember red,
    // billowing puffs that rise and flicker independently, smoke on top.
    for (const fr of this.fires) {
      const k = Math.min(1, fr.t / 350);
      const die = Math.max(0, 1 - Math.max(0, fr.t - 2000) / 800);
      if (die <= 0) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        const seed = i * 2.399 + fr.x * 0.013;
        const fx = fr.x - fr.w / 2 + ((i + 0.5) / 16) * fr.w + Math.sin(now / 140 + seed * 3) * 7;
        const wob = 0.72 + 0.28 * Math.sin(now / 75 + seed * 5);
        const fh = (52 + (i * 29 % 34)) * k * die * wob;
        const fy = GY + 26 - fh * (0.35 + 0.45 * ((now / (600 + i * 37)) % 1));
        const r = (18 + (i * 13 % 14)) * k * die * wob;
        const gr2 = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
        gr2.addColorStop(0, `rgba(255,244,200,${(0.5 * die).toFixed(2)})`);
        gr2.addColorStop(0.4, `rgba(255,160,40,${(0.4 * die).toFixed(2)})`);
        gr2.addColorStop(1, 'rgba(140,40,10,0)');
        ctx.fillStyle = gr2;
        ctx.beginPath(); ctx.arc(fx, fy, r, 0, 7); ctx.fill();
      }
      // white-hot bed at the root of the burn
      const bed = ctx.createLinearGradient(0, GY + 30, 0, GY - 18);
      bed.addColorStop(0, `rgba(255,250,220,${(0.55 * k * die).toFixed(2)})`);
      bed.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = bed;
      ctx.fillRect(fr.x - fr.w / 2, GY - 18, fr.w, 48);
      // embers popping off
      for (let i = 0; i < 7; i++) {
        const et = (now / (300 + i * 53) + i) % 1;
        const ex = fr.x - fr.w / 2 + ((i * 83) % fr.w) + Math.sin(now / 90 + i) * 10;
        ctx.fillStyle = `rgba(255,${170 + (i % 3) * 30},60,${((1 - et) * 0.8 * die).toFixed(2)})`;
        ctx.fillRect(ex, GY + 10 - et * 120, 3, 3);
      }
      ctx.restore();
      // smoke column (normal blend, above the flames)
      ctx.fillStyle = `rgba(48,42,38,${(0.42 * die).toFixed(2)})`;
      ctx.beginPath(); ctx.ellipse(fr.x + Math.sin(now / 700) * 14, GY - 100 - fr.t * 0.03, fr.w * 0.42, 44, 0, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(58,52,46,${(0.3 * die).toFixed(2)})`;
      ctx.beginPath(); ctx.ellipse(fr.x - 20, GY - 160 - fr.t * 0.045, fr.w * 0.3, 34, 0, 0, 7); ctx.fill();
    }
    // prop-kill viscera + strafe dirt
    for (const q of this.propGore) {
      const qa = Math.max(0, 1 - q.t / q.T);
      ctx.fillStyle = q.green === 2 ? `rgba(180,150,90,${(qa * 0.9).toFixed(2)})`
        : q.green ? `rgba(120,230,60,${(qa * 0.95).toFixed(2)})` : `rgba(150,25,20,${(qa * 0.95).toFixed(2)})`;
      ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
    }
    // supply drops: fly into one, or just SHOOT it -- either way it's yours
    for (const su of this.supplies) drawSupplyCrate(ctx, su.x, su.y, now);
    // tracers
    ctx.strokeStyle = PAL.tracer; ctx.lineWidth = 4;
    for (const s of this.shots) { ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - 34, s.y); ctx.stroke(); }
    // the Skyraider
    const pl = IMG.skyraider;
    const tilt = ((this.prevBits & C.UP) ? -0.09 : 0) + ((this.prevBits & C.DOWN) ? 0.09 : 0);
    if (pl) {
      const ph = 128, pw = ph * (pl.width / pl.height);
      ctx.save();
      ctx.translate(260, this.py + Math.sin(now / 260) * 5);
      ctx.rotate(tilt);
      // v12 (Dylan: "the airplane needs to be mirror flipped or something
      // because it's flying backwards and even has a propellor on the back").
      // skyraider.png is drawn nose-LEFT, but everything around it assumes a
      // right-facing plane: the prop-blur ellipse below is painted at +pw/2
      // (which was landing on the TAIL FIN -- that's the "propellor on the
      // back"), the muzzle burst fires at x=330 to the right of centre, the
      // gun shots carry vx:+1050, and every foe closes with x -= spd. Mirror
      // the sprite so the real propeller, the blur disc and the guns agree.
      // This also corrects the pitch: with the art facing left, tilt=-0.09 on
      // W was dropping the nose instead of raising it.
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(pl, -pw / 2, -ph / 2, pw, ph);
      ctx.restore();
      // v13.4 (Dylan: "there's a propeller spinning and there's a propeller
      // that's not spinning next to each other"). The sprite used to carry a
      // painted STATIC four-blade prop with this blur ellipse floating beside
      // it. The baked blades are gone from the art; this is now the only
      // propeller: a full-disc blur with three rotating blade streaks and the
      // spinner glint, at the actual nose (u 0.997, v 0.623 of the art).
      const nx2 = pw / 2 - 3, ny2 = ph * 0.123;
      ctx.save();
      ctx.translate(nx2, ny2);
      ctx.fillStyle = 'rgba(225,225,215,0.16)';
      ctx.beginPath(); ctx.ellipse(0, 0, 9, ph * 0.46, 0, 0, 7); ctx.fill();
      const spin = now / 24;
      for (let bl = 0; bl < 3; bl++) {
        const ba = spin + bl * (Math.PI * 2 / 3);
        const ext = Math.abs(Math.sin(ba)) * ph * 0.44;      // vertical projection of the blade
        const sgn = Math.sin(ba) >= 0 ? 1 : -1;
        ctx.strokeStyle = `rgba(210,210,200,${(0.30 + 0.25 * Math.abs(Math.cos(ba))).toFixed(2)})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ba) * 6, sgn * ext); ctx.stroke();
      }
      ctx.fillStyle = '#8a8a80';
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill();
      ctx.restore();
      ctx.restore();
      if (this.fireT > 0) drawMuzzleBurst(ctx, 330 + 14, this.py + 12, 0, this.fireT / 70); // v11.2: real fire burst
    } else { ctx.fillStyle = PAL.khaki; ctx.fillRect(200, this.py - 20, 120, 40); }
    this.drawBooms(ctx);
    if (this.hurtT > 0) { ctx.fillStyle = `rgba(160,20,10,${Math.min(0.4, this.hurtT / 1200)})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    // napalm count + timer
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(W / 2 - 200, 14, 400, 10);
    ctx.fillStyle = PAL.cheese; ctx.fillRect(W / 2 - 200, 14, 400 * Math.min(1, this.t / this.dur), 10);
    ctx.font = 'bold 20px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = PAL.boom2;
    ctx.fillText('NAPALM ' + '▮'.repeat(this.napalm), 24, 86);
    // PULL UP: the dive's hard-deck warning. Big, red, flashing — the one
    // instruction that earns being text, because the punishment is immediate.
    if (this.warnT > 0 && Math.floor(now / 160) % 2 === 0) {
      ctx.save();
      ctx.font = 'bold 44px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText('PULL UP', W / 2 + 3, H * 0.36 + 3);
      ctx.fillStyle = '#ff4234'; ctx.fillText('PULL UP', W / 2, H * 0.36);
      ctx.restore(); ctx.textAlign = 'left';
    }
    // The A-1 has armour pips like the Huey; without a readout the player has
    // no idea the plane is soaking hits for them, so losing the last one reads
    // as an arbitrary death rather than the end of a resource they were
    // spending.
    ctx.fillStyle = this.pips <= 1 ? PAL.redAccent : PAL.hud;
    ctx.fillText('HULL ' + '▮'.repeat(Math.max(0, this.pips)) + '▯'.repeat(Math.max(0, (this.pipsMax || 3) - this.pips)), 24, 112);
  }
}

// ---------- headless autopilots (test harness only) ----------
export function railBot(rail, frame) {
  let b = C.FIRE;
  const ph = Math.sin(frame / 40);
  if (ph > 0.3) b |= C.UP; else if (ph < -0.3) b |= C.DOWN;
  if (rail instanceof Skyraider && frame % 260 === 0) b |= C.GREN;
  return b;
}
