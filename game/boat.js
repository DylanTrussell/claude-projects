// Act III, part two: the road home was never a road — it's a river, then an ocean.
//  PTBoat — dodge the river banks, bow-gun the gunboats, depth-charge the mines,
//           until a raider torpedo finally puts a hole below the waterline.
//  Surf   — the boat's gone. You're on boards, riding the wave face, shooting
//           alien raiders and rats that surface right under you, out to the LZ.
// Same modal pattern as DoorGun/Skyraider: step(bits,dt,p) / render(ctx,now) / done.
import { CFG, C, PAL, W, H } from './config.js';
import { IMG } from './assets.js';
import { RailBase } from './rails.js';
import { drawMuzzleBurst } from './render.js'; // v11.2: shared "real fire" burst, replaces the flat circle

const GY = 640;

function aabb(ax, ay, bx, by, r) { return Math.abs(ax - bx) < r && Math.abs(ay - by) < r; }

function drawWater(ctx, scroll, tint) {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#3a5c66');
  grd.addColorStop(0.45, tint || '#2a6f6b');
  grd.addColorStop(1, '#173c3f');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  // scrolling wave-glint lines, cheap parallax
  ctx.strokeStyle = 'rgba(200,230,225,0.18)'; ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const y = (i * 57 + (scroll * 40) % 57) % H;
    const x0 = (i * 173 - scroll * 90) % (W + 300) - 150;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + 90, y + 6); ctx.stroke();
  }
}

// ============================ PT BOAT ============================
export class PTBoat extends RailBase {
  constructor() {
    super(54000);
    this.py = 340;              // position across the river (near bank <-> far bank)
    this.gunCd = 0; this.chargeCd = 0; this.charges = 6;
    this.mines = []; this.depth = []; this.started = false;
    this.wake = 0;
    this.flyby = null; this.flybySpawned = false; // boss_ship_1 background tension beat, see below
  }
  step(bits, dt, p) {
    if (this.done) return;
    this.stepCommon(dt, p);
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
    for (const s of this.shots) { s.x += s.vx * dts; s.t -= dt; }
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
        if (f.cd <= 0 && f.x > 260 && f.x < W) { f.cd = 1500; this.shots.push({ x: f.x, y: f.y, vx: -640, vy: 0, t: 1200, foe: true }); this.ev({ e: 'sfx', n: 'sfx_laser' }); }
      } else if (f.k === 'raider') {
        f.x -= 260 * dts; f.ph += dts * 3;
        f.y += Math.sin(f.ph) * 60 * dts;
        if (aabb(f.x, f.y, 260, this.py, 60)) { f.hp = 0; this.boom(f.x, f.y, 0); this.hurt(p, 1); }
      } else if (f.k === 'diver') {
        f.t += dt; f.x -= 130 * dts;
        f.up = (f.t % 1400) < 700; // periscopes up to take a shot, ducks back under
        if (f.up && aabb(f.x, f.y, 260, this.py, 54)) { f.hp = 0; this.boom(f.x, f.y, 0); this.hurt(p, 1); }
      }
      for (const s of this.shots) {
        if (s.foe || s.t <= 0) continue;
        const hy = f.k === 'gunboat' ? f.y : f.y;
        if (aabb(s.x, s.y, f.x, hy, 44)) {
          if (f.k === 'diver' && !f.up) continue; // submerged — can't be hit topside
          f.hp--; s.t = 0;
          if (f.hp <= 0) { this.kills++; this.boom(f.x, f.y - 10, f.k !== 'diver'); this.ev({ e: 'fpsKill' }); }
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
    if (!this.flybySpawned && this.t > 17000) {
      this.flybySpawned = true;
      this.flyby = { x: W + 340, y: 100 };
      this.ev({ e: 'banner', k: 'shipSighted' });
    }
    if (this.flyby) {
      this.flyby.x -= 42 * dts;
      if (this.flyby.x < -420) this.flyby = null;
    }

    if (this.t >= this.dur) { this.done = true; this.ev({ e: 'banner', k: 'ptboatDone' }); this.ev({ e: 'sfx', n: 'sfx_explosion' }); }
    this.prevBits = bits;
  }

  render(ctx, now) {
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save(); ctx.translate(sx, 0);
    drawWater(ctx, this.scroll, '#2a6f6b');
    // boss_ship_1 — huge, hazy, high overhead, purely atmospheric (see step())
    if (this.flyby) {
      const img = IMG.boss_ship_1;
      const fh = 210, fw = img ? fh * (img.width / img.height) : fh * 1.5;
      ctx.save(); ctx.globalAlpha = 0.6;
      if (img) ctx.drawImage(img, this.flyby.x - fw / 2, this.flyby.y - fh / 2, fw, fh);
      else { ctx.fillStyle = '#2a2233'; ctx.beginPath(); ctx.ellipse(this.flyby.x, this.flyby.y, fw / 2, fh / 2.6, 0, 0, 7); ctx.fill(); }
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
    // tracers
    for (const s of this.shots) {
      ctx.strokeStyle = s.foe ? PAL.ray : PAL.tracer; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); ctx.stroke();
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
    if (this.hurtT > 0) { ctx.fillStyle = `rgba(160,20,10,${Math.min(0.4, this.hurtT / 1200)})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(W / 2 - 200, 14, 400, 10);
    ctx.fillStyle = PAL.cheese; ctx.fillRect(W / 2 - 200, 14, 400 * Math.min(1, this.t / this.dur), 10);
    ctx.font = 'bold 20px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = PAL.boom2;
    ctx.fillText('CHARGES ' + '▮'.repeat(this.charges), 24, 86);
  }
}

// ============================ SURF ============================
// The boat's gone. Boards under your feet, wave rolling east toward the LZ.
export class Surf extends RailBase {
  constructor() {
    super(46000);
    this.py = 340; this.dive = 0; this.diveCd = 0;
    this.gunCd = 0; this.started = false;
  }
  step(bits, dt, p) {
    if (this.done) return;
    this.stepCommon(dt, p);
    const dts = dt / 1000;
    this.scroll += dts;
    this.gunCd -= dt; this.diveCd -= dt; this.dive -= dt;
    if (!this.started) { this.started = true; this.ev({ e: 'banner', k: 'actSurf' }); this.ev({ e: 'hint', k: 'surfControls' }); }

    if (bits & C.UP) this.py -= 320 * dts;
    if (bits & C.DOWN) this.py += 320 * dts;
    this.py = Math.max(160, Math.min(540, this.py));

    // duck-dive: K — brief invuln + slips under surface threats, short cooldown
    if ((bits & C.GREN) && !(this.prevBits & C.GREN) && this.diveCd <= 0) {
      this.dive = 550; this.diveCd = 1400;
      this.ev({ e: 'sfx', n: 'sfx_meow' });
    }

    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 680 + Math.random() * 650;
      const r = Math.random();
      if (r < 0.45) this.foes.push({ k: 'raider', x: W + 100, y: 220 + Math.random() * 300, hp: 2, ph: Math.random() * 6 });
      else if (r < 0.8) this.foes.push({ k: 'diver', x: W + 60, y: this.py + (Math.random() - 0.5) * 180, hp: 1, t: 0, up: false });
      else this.foes.push({ k: 'shark', x: W + 90, y: this.py, hp: 2, t: 0 }); // alien-rat "shark rig" — a rat riding a robo-fin
    }

    if ((bits & C.FIRE) && this.gunCd <= 0) {
      this.gunCd = 130; this.fireT = 70;
      this.ev({ e: 'sfx', n: 'sfx_shot' });
      this.shots.push({ x: 300, y: this.py - 10, vx: 880, vy: 0, t: 900 });
    }
    for (const s of this.shots) { s.x += s.vx * dts; s.t -= dt; }
    this.shots = this.shots.filter(s => s.t > 0);

    for (const f of this.foes) {
      if (f.k === 'raider') {
        f.x -= 230 * dts; f.ph += dts * 3; f.y += Math.sin(f.ph) * 50 * dts;
        if (this.dive <= 0 && aabb(f.x, f.y, 260, this.py, 58)) { f.hp = 0; this.boom(f.x, f.y, 0); this.hurt(p, 1); }
      } else if (f.k === 'diver' || f.k === 'shark') {
        f.t += dt; f.x -= (f.k === 'shark' ? 240 : 140) * dts;
        f.up = f.k === 'shark' ? true : (f.t % 1300) < 650;
        const canHit = f.up && this.dive <= 0;
        if (canHit && aabb(f.x, f.y, 260, this.py, 50)) { f.hp = 0; this.boom(f.x, f.y, 0); this.hurt(p, 1); }
      }
      for (const s of this.shots) {
        if (s.t <= 0) continue;
        if ((f.k === 'diver') && !f.up) continue;
        if (aabb(s.x, s.y, f.x, f.y, 44)) {
          f.hp--; s.t = 0;
          if (f.hp <= 0) { this.kills++; this.boom(f.x, f.y - 8, f.k === 'shark'); this.ev({ e: 'fpsKill' }); }
        }
      }
    }
    this.foes = this.foes.filter(f => f.hp > 0 && f.x > -140);

    if (this.t >= this.dur) { this.done = true; this.ev({ e: 'banner', k: 'surfDone' }); }
    this.prevBits = bits;
  }

  render(ctx, now) {
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save(); ctx.translate(sx, 0);
    drawWater(ctx, this.scroll, '#1e5a72');
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
    for (const s of this.shots) { ctx.strokeStyle = PAL.tracer; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - 34, s.y); ctx.stroke(); }
    // surfer
    const bob = Math.sin(now / 220) * 5;
    const si = IMG.surf_hero;
    if (si) {
      const sh = 120, sw = sh * (si.width / si.height);
      ctx.save();
      if (this.dive > 0) ctx.globalAlpha = 0.55;
      ctx.drawImage(si, 220 - sw / 2, this.py - sh / 2 + bob, sw, sh);
      ctx.restore();
    } else {
      ctx.save(); if (this.dive > 0) ctx.globalAlpha = 0.55;
      ctx.fillStyle = PAL.khaki; ctx.fillRect(190, this.py - 44 + bob, 60, 40);
      ctx.fillStyle = '#f3e9c8'; ctx.fillRect(150, this.py + 4 + bob, 120, 12);
      ctx.restore();
    }
    if (this.fireT > 0) drawMuzzleBurst(ctx, 300, this.py - 10 + bob, 0, this.fireT / 70); // v11.2: real fire burst
    this.drawBooms(ctx);
    if (this.hurtT > 0) { ctx.fillStyle = `rgba(160,20,10,${Math.min(0.4, this.hurtT / 1200)})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(W / 2 - 200, 14, 400, 10);
    ctx.fillStyle = PAL.cheese; ctx.fillRect(W / 2 - 200, 14, 400 * Math.min(1, this.t / this.dur), 10);
    if (this.diveCd > 0 && this.dive <= 0) { ctx.font = 'bold 16px monospace'; ctx.fillStyle = PAL.hudDim; ctx.textAlign = 'left'; ctx.fillText('DIVE RECHARGING', 24, 86); }
  }
}

// ---------- headless autopilots (test harness only) ----------
export function boatBot(rail, frame) {
  let b = C.FIRE;
  const ph = Math.sin(frame / 44);
  if (ph > 0.3) b |= C.UP; else if (ph < -0.3) b |= C.DOWN;
  if (frame % 240 === 0) b |= C.GREN;
  return b;
}
