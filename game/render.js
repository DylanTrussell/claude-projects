// All drawing. Procedural art (props, FX, HUD) is an asset too — it embeds the
// STYLE FORMULA via PAL (charcoal outlines, olive/mud environment, cheese-yellow
// signals, acid-green alien glow, orange explosion light). Side-view, chunky shapes.
import { C, CFG, PAL, W, H } from './config.js';
import { IMG, SHEET, drawSheet, drawImg } from './assets.js';
import { LEVEL, islandTop } from './sim.js';
import { STR } from './strings.js';

export const FX = {
  parts: [], shake: 0, flash: 0, hitPause: 0,
  banners: [], hints: [], rays: [], slashes: [],
  flashes: [], // muzzle flashes: {x, y, ang, t, T}
  splats: [], // persistent blood decals: {x, y, r, a}
  booms: [],  // sprite-sheet explosion instances: {x, y, t, s, flip}
  rings: [],  // v13 expanding shockwave rings on every blast: {x, y, t, T, r}
  scores: [], // floating "+100" kill rewards: {x, y, n, t, T}
  fires: [],  // v13 lingering ground fire from flamethrower/napalm: {x, y, t, T, r}
  opts: { shake: true, flash: true, bigText: false },
  // v11 (Dylan: "he should fall into it when he goes in, and pop out of it
  // when he comes out") — tunnel entry/exit transition timers, counting down
  // from TUNNEL_TRANS_MS. See drawPlayerEnt()'s use of these and main.js's
  // handleEvents()/tunnel-done block, which drive them.
  tunnelFallT: 0, tunnelPopT: 0,
  // v12 (Dylan: "just fade to white and then from white back into the other
  // scene where he comes out of the tunnel"). fps.js fades the tunnel view UP
  // to white on its way out; this is the matching fade DOWN from white on the
  // overworld side, so the two halves read as one continuous transition
  // instead of a hard cut at the mode switch.
  whiteT: 0, whiteT0: 1,
};
export const TUNNEL_TRANS_MS = 480;
for (let i = 0; i < CFG.particlePool; i++) FX.parts.push({ on: 0, x: 0, y: 0, vx: 0, vy: 0, t: 0, T: 1, kind: 0, r: 4, col: '' });

function part(kind, x, y, vx, vy, t, r, col) {
  for (const p of FX.parts) {
    if (!p.on) { p.on = 1; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.t = t; p.T = t; p.r = r; p.col = col; return; }
  }
}

export function fxEvent(ev) {
  switch (ev.e) {
    case 'score':
      FX.scores.push({ x: ev.x, y: ev.y, n: ev.n | 0, t: 0, T: 850 });
      break;
    case 'boom': {
      const big = ev.big | 0;
      const n = big === 2 ? 44 : big ? 26 : 12;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * (big === 2 ? 420 : big ? 300 : 160);
        part(1, ev.x, ev.y, Math.cos(a) * s, Math.sin(a) * s - 80, 380 + Math.random() * (big === 2 ? 460 : 320), 5 + Math.random() * (big === 2 ? 18 : big ? 14 : 8), Math.random() < 0.6 ? PAL.boom1 : PAL.boom2);
      }
      for (let i = 0; i < n / 2; i++) part(2, ev.x, ev.y - 10, (Math.random() - 0.5) * (big === 2 ? 160 : 80), -40 - Math.random() * 90, 900 + (big === 2 ? 400 : 0), 12 + Math.random() * (big === 2 ? 24 : 16), PAL.smoke);
      if (big === 2) { // white-hot sparks
        for (let i = 0; i < 14; i++) part(1, ev.x, ev.y, (Math.random() - 0.5) * 700, -Math.random() * 500, 260 + Math.random() * 200, 2 + Math.random() * 2, '#fff3d0');
      }
      // v13 (Dylan: "fix all the explosions when rats and space ships blow up
      // they're just circles, make them cool animated pixel explosions like the
      // air support bombs, similar but not exact same"). The 16-frame blast
      // sheet was gated behind `big`, so ONLY air-support bombs and boss kills
      // ever got it — every ordinary rat/ship death fell through to bare
      // particle circles, which is exactly what he was looking at. Every death
      // now gets the sheet; scale carries the weight difference.
      // "Similar but not exact same": small blasts get a random mirror and a
      // ±12% scale jitter so a firefight doesn't play the identical 16 frames
      // over and over, plus a hot core flash the big bombs don't use.
      if (SHEET.sheet_explosion) {
        const base = big === 2 ? 300 : big ? 200 : 118;
        const jit = big ? 1 : 0.88 + Math.random() * 0.24;
        FX.booms.push({ x: ev.x, y: ev.y, t: 0, s: base * jit, flip: !big && Math.random() < 0.5 });
      }
      if (!big) { // quick white-hot core so a small kill still reads as a POP
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * Math.PI * 2, s = 90 + Math.random() * 190;
          part(1, ev.x, ev.y, Math.cos(a) * s, Math.sin(a) * s - 40, 150 + Math.random() * 110, 2 + Math.random() * 2.5, '#fff3d0');
        }
      }
      FX.rings.push({ x: ev.x, y: ev.y, t: 0, T: big === 2 ? 420 : big ? 320 : 220, r: big === 2 ? 190 : big ? 130 : 70 });
      if (FX.opts.shake) FX.shake = Math.max(FX.shake, big === 2 ? CFG.shakeBoom + 4 : big ? CFG.shakeBoom : CFG.shakeHit);
      if (big) FX.hitPause = CFG.hitPauseMs + (big === 2 ? 20 : 0);
      if (big && FX.opts.flash) FX.flash = CFG.flashMs + (big === 2 ? 40 : 0);
      break;
    }
    case 'muzzle': {
      // v10.1: proper oriented Metal-Slug-style flash (was a single fading dot).
      // ang comes from sim.js (radians; 0 = facing right). Fall back to the old
      // up/f-derived guess for any caller that hasn't been updated to send it.
      const ang = ev.ang != null ? ev.ang : (ev.up ? -Math.PI / 2 : (ev.f < 0 ? Math.PI : 0));
      FX.flashes.push({ x: ev.x, y: ev.y, ang, t: 90, T: 90 });
      // embers kicking out along the barrel axis, plus a little scatter
      for (let i = 0; i < 5; i++) {
        const spread = (Math.random() - 0.5) * 0.9;
        const s = 120 + Math.random() * 260;
        part(3, ev.x, ev.y, Math.cos(ang + spread) * s, Math.sin(ang + spread) * s, 90 + Math.random() * 70, 3 + Math.random() * 3, Math.random() < 0.5 ? PAL.boom2 : PAL.boom1);
      }
      // a thin puff of smoke that lingers a beat longer
      part(2, ev.x, ev.y, Math.cos(ang) * 30, Math.sin(ang) * 30 - 10, 260, 6 + Math.random() * 5, PAL.smoke);
      break;
    }
    case 'hit':
      for (let i = 0; i < 5; i++) part(1, ev.x, ev.y, (Math.random() - 0.5) * 220, -Math.random() * 180, 240, 3, PAL.boom2);
      break;
    case 'slash':
      FX.slashes.push({ x: ev.x, y: ev.y, t: 140 });
      break;
    case 'trap':
      for (let i = 0; i < 10; i++) part(1, ev.x, CFG.groundY - 8, (Math.random() - 0.5) * 200, -100 - Math.random() * 200, 400, 4, PAL.dirt);
      break;
    case 'blood': {
      const n = ev.big ? 22 : 10;
      for (let i = 0; i < n; i++) {
        part(1, ev.x, ev.y, (Math.random() - 0.5) * 320, -60 - Math.random() * 260, 420 + Math.random() * 280, 3 + Math.random() * 4, PAL.blood);
      }
      const s = ev.big ? 3 : 1;
      for (let i = 0; i < s; i++) {
        FX.splats.push({ x: ev.x + (Math.random() - 0.5) * 60, y: CFG.groundY - 2 + Math.random() * 6, r: 10 + Math.random() * (ev.big ? 18 : 9), a: 0.5 + Math.random() * 0.2 });
      }
      while (FX.splats.length > 40) FX.splats.shift();
      break;
    }
    // v13: molten cheese. Thick yellow gobs that arc out and stick, plus a
    // greasy orange flash -- deliberately gloopier and slower than blood or
    // sparks so a cheese kill reads differently from a bullet kill.
    case 'cheesemelt': {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, sp = 70 + Math.random() * 330;
        part(1, ev.x, ev.y, Math.cos(a) * sp, Math.sin(a) * sp - 150, 600 + Math.random() * 500,
          4 + Math.random() * 9, Math.random() < 0.7 ? PAL.cheese : PAL.cheeseDark);
      }
      for (let i = 0; i < 8; i++) {
        FX.splats.push({ x: ev.x + (Math.random() - 0.5) * 190, y: CFG.groundY - 2 + Math.random() * 6,
          r: 12 + Math.random() * 22, a: 0.55 + Math.random() * 0.25, cheese: 1 });
      }
      while (FX.splats.length > 40) FX.splats.shift();
      break;
    }
    case 'cheesecoat':
      for (let i = 0; i < 7; i++) {
        part(1, ev.x, ev.y, (Math.random() - 0.5) * 120, -30 - Math.random() * 120,
          500 + Math.random() * 300, 3 + Math.random() * 5, Math.random() < 0.5 ? PAL.cheese : PAL.boom1);
      }
      break;
    case 'shake': if (FX.opts.shake) FX.shake = Math.max(FX.shake, ev.m); break;
    case 'greenflash': FX.green = 1100; break;
    // Banners QUEUE instead of all firing at once. At the pinned-down fight
    // three fire within a second ("ACT I - RIVER PATROL" / "THE TUNNEL" /
    // "PINNED DOWN!") and filled the middle of the screen in 34px type during
    // the hardest encounter in the game, burying the small green "PRESS L"
    // prompt that is the actual way out of it. Each new banner now waits for
    // the ones ahead of it.
    case 'banner': FX.banners.push({ k: ev.k, t: 2100, d: FX.banners.length * 900 }); break;
    // Hints queue for the same reason banners do -- three at once (goal +
    // controls + "PRESS L") stack across the bottom of the screen right where
    // the enemies are during the pinned-down fight. Shorter stagger than
    // banners since hints are small type and linger longer.
    case 'hint': FX.hints.push({ k: ev.k, t: 4200, d: FX.hints.length * 1500 }); break;
    case 'ray': FX.rays.push({ x: ev.x, t: 900 }); break; // telegraph before boss beam
  }
}

export function fxUpdate(dt) {
  for (const p of FX.parts) {
    if (!p.on) continue;
    p.t -= dt;
    if (p.t <= 0) { p.on = 0; continue; }
    p.vy += (p.kind === 2 ? -20 : 900) * dt / 1000;
    p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
  }
  FX.shake = Math.max(0, FX.shake - dt * 0.02);
  FX.flash = Math.max(0, FX.flash - dt);
  FX.green = Math.max(0, (FX.green || 0) - dt);
  for (const b of FX.banners) { if ((b.d || 0) > 0) b.d -= dt; else b.t -= dt; }
  FX.banners = FX.banners.filter(b => b.t > 0);
  for (const h2 of FX.hints) { if ((h2.d || 0) > 0) h2.d -= dt; else h2.t -= dt; }
  FX.hints = FX.hints.filter(h2 => h2.t > 0);
  for (const r of FX.rays) r.t -= dt;
  FX.rays = FX.rays.filter(r => r.t > 0);
  for (const s of FX.slashes) s.t -= dt;
  FX.slashes = FX.slashes.filter(s => s.t > 0);
  for (const r of FX.rings) r.t += dt;
  FX.rings = FX.rings.filter(r => r.t < r.T);
  for (const s of FX.scores) s.t += dt;
  FX.scores = FX.scores.filter(s => s.t < s.T);
  // v13: ground fire burns down over its own lifetime and spits embers while lit
  for (const f of FX.fires) {
    f.t += dt;
    if (Math.random() < dt / 90) {
      part(1, f.x + (Math.random() - 0.5) * f.r * 1.6, f.y, (Math.random() - 0.5) * 40, -60 - Math.random() * 90,
        260 + Math.random() * 220, 2 + Math.random() * 3, Math.random() < 0.5 ? PAL.boom1 : PAL.boom2);
    }
  }
  FX.fires = FX.fires.filter(f => f.t < f.T);
  for (const fl of FX.flashes) fl.t -= dt;
  FX.flashes = FX.flashes.filter(fl => fl.t > 0);
  for (const b of FX.booms) b.t += dt;
  FX.booms = FX.booms.filter(b => !SHEET.sheet_explosion || b.t < SHEET.sheet_explosion.frames * (1000 / SHEET.sheet_explosion.fps));
  FX.tunnelFallT = Math.max(0, FX.tunnelFallT - dt);
  FX.tunnelPopT = Math.max(0, FX.tunnelPopT - dt);
  FX.whiteT = Math.max(0, FX.whiteT - dt);
}

// ---------- world drawing ----------
function o(ctx) { ctx.strokeStyle = PAL.outline; ctx.lineWidth = 3; }

function drawGround(ctx, cam, inv) {
  const tile = IMG.tile_ground;
  const ts = 256;
  const y0 = CFG.groundY;
  // Solid spans between pits, tiled with EXACT clipping — the visible edge of the
  // ground is the real edge of the ground (jumps you can trust).
  const edges = [cam - ts];
  for (const [a, b] of LEVEL.pits) { edges.push(a, b); }
  edges.push(cam + W + ts);
  edges.sort((p, q) => p - q);
  for (let i = 0; i < edges.length - 1; i++) {
    const s0 = edges[i], s1 = edges[i + 1];
    if (s1 <= cam - 60 || s0 >= cam + W + 60) continue;
    let solid = true;
    const mid = (s0 + s1) / 2;
    for (const [a, b] of LEVEL.pits) if (mid > a && mid < b) { solid = false; break; }
    if (!solid) continue;
    ctx.save();
    ctx.beginPath(); ctx.rect(s0 - cam, y0, s1 - s0, H - y0); ctx.clip();
    for (let x = Math.floor(s0 / ts) * ts; x < s1; x += ts) {
      if (tile) ctx.drawImage(tile, x - cam, y0, ts, H - y0);
      else { ctx.fillStyle = PAL.mud1; ctx.fillRect(x - cam, y0, ts, H - y0); }
    }
    ctx.restore();
    // crisp cliff edge line at each pit lip
    ctx.strokeStyle = PAL.outline; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(s0 - cam, y0); ctx.lineTo(s0 - cam, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s1 - cam, y0); ctx.lineTo(s1 - cam, H); ctx.stroke();
  }
  // pit interiors + spikes
  for (const [a, b] of LEVEL.pits) {
    if (b < cam - 50 || a > cam + W + 50) continue;
    ctx.fillStyle = '#1c1812';
    ctx.fillRect(a - cam, y0, b - a, H - y0);
    ctx.fillStyle = PAL.cheeseDark;
    for (let sx = a + 8; sx < b - 8; sx += 22) {
      ctx.beginPath();
      ctx.moveTo(sx - cam, H - 4); ctx.lineTo(sx + 9 - cam, H - 64); ctx.lineTo(sx + 18 - cam, H - 4);
      ctx.fill();
    }
  }
  if (inv) { ctx.fillStyle = 'rgba(60,140,80,0.10)'; ctx.fillRect(0, y0, W, H - y0); }
}

// floating islands over the long gap — hovering chunks of blasted earth
function drawIslands(ctx, cam, t) {
  for (const isl of LEVEL.islands) {
    if (isl.x + isl.w < cam - 80 || isl.x > cam + W + 80) continue;
    const top = islandTop(t, isl);
    const x = isl.x - cam;
    ctx.fillStyle = PAL.mud2;
    ctx.beginPath();
    ctx.moveTo(x - 6, top);
    ctx.lineTo(x + isl.w + 6, top);
    ctx.lineTo(x + isl.w - 18, top + 46);
    ctx.lineTo(x + isl.w / 2, top + 64);
    ctx.lineTo(x + 16, top + 44);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = PAL.outline; ctx.lineWidth = 3; ctx.stroke();
    if (IMG.tile_ground) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x - 6, top, isl.w + 12, 18); ctx.clip();
      ctx.drawImage(IMG.tile_ground, x - 6, top, 256, 256);
      ctx.restore();
    }
    ctx.fillStyle = PAL.jungle1; // grass lip
    ctx.fillRect(x - 6, top - 4, isl.w + 12, 7);
    ctx.strokeRect(x - 6, top - 4, isl.w + 12, 7);
    // faint anti-grav shimmer beneath (alien lift debris — why it floats)
    ctx.fillStyle = PAL.acidGlow;
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t / 300 + isl.ph);
    ctx.beginPath(); ctx.ellipse(x + isl.w / 2, top + 74, isl.w * 0.35, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawPlatforms(ctx, cam, crates) {
  for (const [px, py, pw, ph] of LEVEL.platforms) {
    if (px + pw < cam - 40 || px > cam + W + 40) continue;
    // sandbag stack
    ctx.fillStyle = '#4a3d24';
    ctx.fillRect(px - cam, py, pw, ph);
    for (let r = 0; r < Math.ceil(ph / 22); r++) {
      for (let cx = 0; cx < Math.ceil(pw / 40); cx++) {
        const bx = px - cam + 20 + cx * 38 + (r % 2) * 15, by = py + 11 + r * 21;
        ctx.fillStyle = (cx + r) % 2 ? '#8a7448' : '#9b854f';
        ctx.beginPath(); ctx.ellipse(bx, by, 19, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(38,35,28,0.35)';
        ctx.beginPath(); ctx.ellipse(bx, by + 4, 17, 4, 0, 0, Math.PI); ctx.fill();
        ctx.strokeStyle = PAL.outline; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(bx, by, 19, 9, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    o(ctx); ctx.strokeRect(px - cam, py, pw, ph);
  }
  for (const c of crates || []) {
    if (c.hp <= 0) continue;
    const x = c.x - cam;
    if (x < -60 || x > W + 60) continue;
    ctx.fillStyle = PAL.mud1; ctx.fillRect(x - 24, CFG.groundY - 48, 48, 48);
    ctx.fillStyle = PAL.cheese; ctx.fillRect(x - 24, CFG.groundY - 48, 48, 8);
    o(ctx); ctx.strokeRect(x - 24, CFG.groundY - 48, 48, 48);
    ctx.beginPath(); ctx.moveTo(x - 24, CFG.groundY - 48); ctx.lineTo(x + 24, CFG.groundY); ctx.stroke();
  }
}

function drawTunnels(ctx, cam) {
  for (const tx of LEVEL.tunnels) {
    const x = tx - cam;
    if (x < -80 || x > W + 80) continue;
    ctx.fillStyle = '#171410';
    ctx.beginPath(); ctx.ellipse(x, CFG.groundY + 6, 34, 16, 0, Math.PI, 0); ctx.fill();
    o(ctx); ctx.beginPath(); ctx.ellipse(x, CFG.groundY + 6, 34, 16, 0, Math.PI, 0); ctx.stroke();
  }
}

function drawTraps(ctx, cam, traps) {
  traps.forEach((armed, i) => {
    const tr = LEVEL.traps[i];
    if (!tr) return;
    const x = tr.x - cam;
    if (x < -60 || x > W + 60) return;
    if (armed) {
      // disturbed earth tell — subtle but findable if you're looking (L4: hidden WITH a trail)
      ctx.fillStyle = PAL.dirt;
      ctx.beginPath(); ctx.ellipse(x, CFG.groundY - 3, 32, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(x, CFG.groundY - 4, 19, 4, 0, 0, Math.PI * 2); ctx.fill();
      // bamboo tips just barely poking through the loose dirt
      ctx.fillStyle = '#4a3b22';
      for (const sx of [-12, 0, 13]) {
        ctx.beginPath(); ctx.moveTo(x + sx - 3, CFG.groundY - 4); ctx.lineTo(x + sx, CFG.groundY - 11); ctx.lineTo(x + sx + 3, CFG.groundY - 4); ctx.fill();
      }
      // a faint glint every couple of seconds for sharp-eyed players
      const gl = (performance.now() / 1000 + (LEVEL.traps[i] ? LEVEL.traps[i].x : 0)) % 2.4;
      if (gl < 0.35) {
        ctx.globalAlpha = 1 - gl / 0.35;
        ctx.fillStyle = PAL.cheese;
        ctx.fillRect(x - 1, CFG.groundY - 12, 2, 2);
        ctx.globalAlpha = 1;
      }
    } else {
      // revealed punji spikes
      ctx.fillStyle = '#2a2119';
      ctx.fillRect(x - 30, CFG.groundY - 6, 60, 10);
      ctx.fillStyle = PAL.cheeseDark;
      for (let sx = -24; sx <= 24; sx += 12) {
        ctx.beginPath(); ctx.moveTo(x + sx - 5, CFG.groundY - 2); ctx.lineTo(x + sx, CFG.groundY - 34); ctx.lineTo(x + sx + 5, CFG.groundY - 2); ctx.fill();
      }
    }
  });
}

function drawPickup(ctx, x, y, kind, t) {
  const bob = Math.sin(t / 260) * 4;
  ctx.save(); ctx.translate(x, y - 18 + bob);
  o(ctx);
  if (kind === 'cheese') {
    ctx.fillStyle = PAL.cheese;
    ctx.beginPath(); ctx.moveTo(-16, 12); ctx.lineTo(16, 12); ctx.lineTo(12, -12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PAL.cheeseDark;
    ctx.beginPath(); ctx.arc(-2, 4, 3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(7, -2, 2.4, 0, 7); ctx.fill();
  } else if (kind === 'raygun') {
    if (!drawImg(ctx, 'pickup_raygun', -26, -20, 52, 34, false)) {
      ctx.fillStyle = PAL.teal; ctx.fillRect(-18, -8, 34, 12);
      ctx.fillStyle = PAL.acid; ctx.fillRect(10, -5, 10, 6); ctx.strokeRect(-18, -8, 34, 12);
    }
    ctx.strokeStyle = PAL.acid; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -2, 26 + Math.sin(t / 200) * 3, 0, 7); ctx.stroke();
  } else if (kind === 'flame') {
    if (!drawImg(ctx, 'pickup_flame', -24, -22, 48, 38, false)) {
      ctx.fillStyle = PAL.jungle2; ctx.fillRect(-16, -12, 30, 18);
      ctx.fillStyle = PAL.cheese; ctx.fillRect(-16, -4, 30, 5); ctx.strokeRect(-16, -12, 30, 18);
    }
  } else if (kind === 'gatling') {
    ctx.fillStyle = '#5a5a52'; ctx.fillRect(-18, -8, 30, 14);
    ctx.fillStyle = PAL.cheese; ctx.fillRect(8, -5, 14, 8);
    ctx.strokeRect(-18, -8, 30, 14);
  } else if (kind === 'grenades') {
    ctx.fillStyle = PAL.jungle2;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PAL.cheese; ctx.fillRect(-3, -16, 6, 7);
  } else if (kind === 'life') {
    ctx.fillStyle = PAL.redAccent;
    ctx.beginPath(); ctx.arc(-5, -3, 7, 0, 7); ctx.arc(5, -3, 7, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(0, 13); ctx.lineTo(11, 0); ctx.fill();
  } else { // tuna
    ctx.fillStyle = '#8f9aa4';
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 9, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PAL.cheese; ctx.fillRect(-9, -3, 18, 5);
  }
  ctx.restore();
}

const SIZES = { // draw heights per kind (relative_scale contract, hero=96)
  gruntUS: 92, gruntVC: 92, alien: 88, ufo: 96, heli: 190, pow: 76, boss: 460, buddy: 92,
};
const SPRITE_FOR = { gruntUS: 'grunt_us', gruntVC: 'grunt_vc', alien: 'alien_trooper', ufo: 'ufo_small', heli: 'heli_us', boss: 'boss_mothership', pow: 'hero_vc', buddy: 'grunt_us' };
// Native facing of each generated sprite (+1 = drawn facing right). Flip when entity faces the other way.
const BASE_FACE = { gruntUS: 1, gruntVC: 1, alien: -1, ufo: 1, heli: 1, boss: 1, pow: 1, buddy: 1 };

function drawEntity(ctx, e2, cam, t, inv) {
  const [id, k, x, y, face, st, hp, beam, open, ph, flyer] = e2;
  const sx = x - cam;
  if (sx < -260 || sx > W + 260) return;
  const hgt = SIZES[k] || 90;

  if (k === 'ufo' && beam) { // tractor beam
    ctx.fillStyle = PAL.acidGlow;
    ctx.beginPath();
    ctx.moveTo(sx - 12, y + 20); ctx.lineTo(sx + 12, y + 20);
    ctx.lineTo(sx + 60, CFG.groundY); ctx.lineTo(sx - 60, CFG.groundY);
    ctx.closePath(); ctx.fill();
  }
  if (k === 'boss') {
    // hovering warship: two hull states — hatch closed / hatch open (the real tell)
    const img = (open && IMG.boss_open) ? IMG.boss_open : (IMG.boss_closed || IMG.boss_mothership);
    const hgt2 = 340, w2 = 595; // native art aspect — no squash
    const top = y - hgt2;
    if (img) ctx.drawImage(img, sx - w2 / 2, top, w2, hgt2);
    if (open && !IMG.boss_open) { // fallback tell only if the open-state art is missing
      ctx.fillStyle = PAL.acidGlow;
      ctx.beginPath(); ctx.arc(sx, y - 170, 46 + Math.sin(t / 90) * 6, 0, 7); ctx.fill();
    }
    // engine wash beneath the hovering hull
    ctx.fillStyle = PAL.acidGlow;
    ctx.globalAlpha = 0.28 + 0.14 * Math.sin(t / 160);
    ctx.beginPath(); ctx.ellipse(sx, y + 16, w2 * 0.3, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  if (k === 'pow' && st === 'captive') {
    // tied-up POW cat: draw sprite dimmed with rope
    ctx.save(); ctx.globalAlpha = 0.9;
    drawImg(ctx, SPRITE_FOR.pow, sx - hgt * 0.35, y - hgt, hgt * 0.7, hgt, false);
    ctx.restore();
    ctx.strokeStyle = PAL.cheese; ctx.lineWidth = 3;
    for (let ry = y - hgt * 0.7; ry < y - 8; ry += 14) {
      ctx.beginPath(); ctx.moveTo(sx - 20, ry); ctx.lineTo(sx + 20, ry + 6); ctx.stroke();
    }
    // "HELP" bubble
    ctx.fillStyle = PAL.hud; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
    ctx.fillText('meow!', sx, y - hgt - 10);
    return;
  }
  const sprId = SPRITE_FOR[k];
  const wRatio = k === 'heli' ? 1.7 : k === 'ufo' ? 1.5 : 0.9;
  const w2 = hgt * wRatio;
  const flip = k !== 'ufo' && face !== (BASE_FACE[k] || 1);
  const bob = k === 'ufo' ? 0 : st === 'emerge' ? (1 - Math.max(0, e2[9] || 0)) : 0;
  // emerge from tunnel: rise animation
  let drawY = y - hgt;
  if (st === 'emerge') drawY = y - hgt * 0.5;
  if (k === 'alien' && flyer) {
    // v11 (Dylan: "some should be flying on their own crafts") — a little
    // hover-pod beneath the trooper, reusing the ufo_small art rather than
    // a brand new asset. Engine-glow ellipse underneath sells the hover.
    ctx.fillStyle = PAL.acidGlow;
    ctx.globalAlpha = 0.4 + 0.15 * Math.sin(t / 140 + id);
    ctx.beginPath(); ctx.ellipse(sx, y + 6, w2 * 0.42, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    const ph2 = 34, pw = ph2 * 1.6;
    if (!drawImg(ctx, 'ufo_small', sx - pw / 2, y - ph2 * 0.55, pw, ph2, flip)) {
      ctx.fillStyle = PAL.tealDark; ctx.fillRect(sx - pw / 2, y - ph2 * 0.4, pw, ph2 * 0.5);
    }
  }
  if (k === 'alien' && SHEET.sheet_alien_walk && st !== 'emerge') {
    const s = SHEET.sheet_alien_walk;
    const fr = Math.floor(t / (1000 / s.fps)) % s.frames;
    drawSheet(ctx, 'sheet_alien_walk', fr, sx - w2 / 2, drawY, w2, hgt, flip);
  } else if (!drawImg(ctx, sprId, sx - w2 / 2, drawY, w2, hgt, flip)) {
    ctx.fillStyle = PAL.teal; ctx.fillRect(sx - 20, y - hgt, 40, hgt);
  }
  if (k === 'heli') { // spinning rotor + tail rotor (sprite blades were erased)
    const hubX = sx - w2 / 2 + (flip ? 1 - 0.475 : 0.475) * w2;
    drawRotor(ctx, hubX, drawY + 0.05 * hgt, 0.46 * w2, t);
    const tailX = sx - w2 / 2 + (flip ? 1 - 0.910 : 0.910) * w2;
    drawTailRotor(ctx, tailX, drawY + 0.160 * hgt, 0.078 * w2, t);
  }
  if (k === 'buddy') { // squad marker chevron
    ctx.fillStyle = PAL.cheese;
    ctx.beginPath(); ctx.moveTo(sx - 6, y - hgt - 16); ctx.lineTo(sx + 6, y - hgt - 16); ctx.lineTo(sx, y - hgt - 8); ctx.fill();
  }
  if (beam && (k === 'gruntUS' || k === 'gruntVC' || k === 'alien')) {
    // taking aim — the dodge window tell (multi-channel: glint + exclamation)
    const gx = sx + face * 34, gy2 = y - 52;
    ctx.fillStyle = k === 'alien' ? PAL.acid : PAL.boom2;
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t / 45);
    ctx.beginPath(); ctx.arc(gx, gy2, 6, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    hudText(ctx, '!', sx, y - hgt - 14, 18, 'center', PAL.cheese);
  }
  if (st === 'drag') { // Pvt. Mittens under the arm
    ctx.save(); ctx.globalAlpha = 0.95;
    drawImg(ctx, 'hero_us', sx + 14, y - 52, 40, 46, true);
    ctx.restore();
    ctx.strokeStyle = PAL.cheese; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx + 16, y - 30); ctx.lineTo(sx + 50, y - 24); ctx.stroke();
  }
}

function drawPlayerEnt(ctx, p, cam, t, myPid) {
  const [pid, hero, x, y, face, st, lives, weap, ammo, gren, cheese, invulnT, aimUp, runT, , , crouch, bike, fireFlash, deathKind, respT] = p;
  if (st === 'out' || st === 'riding') return; // riding: he's aboard the heli
  const sx = x - cam;
  if (invulnT > 0 && Math.floor(t / 90) % 2 === 0 && st === 'alive') return; // blink
  // v11 (Dylan: "he should fall into it when he goes in, and pop out of it
  // when he comes out") — shrink-and-sink on the way into the tunnel door,
  // grow-and-rise on the way back out. Only applied to the local player,
  // anchored at his feet (sx, y) so it reads as sinking into / erupting from
  // the ground rather than the whole sprite just scaling in place.
  let transActive = false;
  if (pid === myPid && (FX.tunnelFallT > 0 || FX.tunnelPopT > 0)) {
    transActive = true;
    ctx.save();
    const falling = FX.tunnelFallT > 0;
    const k = falling ? FX.tunnelFallT / TUNNEL_TRANS_MS : 1 - FX.tunnelPopT / TUNNEL_TRANS_MS; // fall: 1->0, pop: 0->1
    const sink = falling ? (1 - k) * 40 : (1 - k) * 40; // both ends anchor low, at ground level, when small
    ctx.globalAlpha = Math.max(0, k);
    ctx.translate(sx, y);
    ctx.scale(Math.max(0.05, k), Math.max(0.05, k));
    ctx.translate(-sx, -y + sink);
  }
  if (bike) { // Act III: both heroes on the motorcycle
    const bw = 200, bh = 134;
    if (!drawImg(ctx, 'bike', sx - bw / 2, y - bh, bw, bh, false)) {
      ctx.fillStyle = PAL.khakiDark; ctx.fillRect(sx - 70, y - 60, 140, 50);
      ctx.fillStyle = PAL.outline;
      ctx.beginPath(); ctx.arc(sx - 50, y - 16, 18, 0, 7); ctx.arc(sx + 50, y - 16, 18, 0, 7); ctx.fill();
    }
    // dust kick
    ctx.fillStyle = 'rgba(110,90,60,0.4)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(sx - 80 - i * 16 - (t % 200) / 18, y - 6 - (i * 5), 8 - i * 2, 0, 7); ctx.fill();
    }
    if (transActive) ctx.restore();
    return;
  }
  // v11 (Dylan: "fix the crouch, you just made him smaller when he
  // crouches") — there's no dedicated crouch pose art; this fakes crouch by
  // squashing the standing sprite. 0.72 was too aggressive a height cut and
  // read as "shrunk" rather than "crouched" — pulled back to a much smaller
  // squash. A real crouch pose (own art, not a squashed idle sprite) is
  // still the correct long-term fix, tracked in the backlog.
  const hgt = CFG.heroH * (crouch ? 0.94 : 1.12);
  const w2 = CFG.heroH * 1.12 * 0.95 * (crouch ? 1.08 : 1);
  const flip = face < 0; // hero sprites are generated facing right; mirror for left
  const sheetId = hero === 'us' ? 'sheet_hero_us_run' : 'sheet_hero_vc_run';
  const imgId = hero === 'us' ? 'hero_us' : 'hero_vc';
  ctx.save();
  // v13 (Dylan: "when he falls into spikes, animate him being impaled to
  // death"). Every death played one spin-and-flop ragdoll. deathKind===1 is the
  // punji trap: the body does NOT spin away -- it drops straight down onto the
  // stakes, jolts on impact, sags, and bleeds. respT counts 1400->0, so
  // 1-respT/1400 is a clean 0->1 progress through the death.
  if (st === 'dead' && deathKind === 1) {
    const k = Math.max(0, Math.min(1, 1 - (respT || 0) / 1400));
    // fast drop onto the stakes, then a slow settle as the body sags
    const drop = (k < 0.18 ? (k / 0.18) * 26 : 26 + (k - 0.18) / 0.82 * 8);
    const jolt = k < 0.30 ? Math.sin(k / 0.30 * Math.PI * 3) * (1 - k / 0.30) * 5 : 0;
    ctx.globalAlpha = 0.92;
    ctx.translate(sx + jolt, y - hgt / 2 + drop);
    ctx.rotate(face * 0.12 + jolt * 0.01); // slumped, not spun
    ctx.translate(-sx, -(y - hgt / 2));
    // blood running down the stakes under him, growing as he hangs there
    ctx.save();
    ctx.globalAlpha = 0.75 * Math.min(1, k * 2);
    ctx.fillStyle = PAL.blood;
    for (let i = 0; i < 3; i++) {
      const bw = 3 + i, bx = sx - 10 + i * 10;
      ctx.fillRect(bx, y - 20 + drop, bw, 20 * Math.min(1, k * 1.6) + 6);
    }
    ctx.restore();
  } else if (st === 'dead') { ctx.globalAlpha = 0.85; ctx.translate(sx, y - hgt / 2); ctx.rotate(face * 0.6); ctx.translate(-sx, -(y - hgt / 2)); }
  const upId = hero === 'us' ? 'hero_us_up' : 'hero_vc_up';
  const upImg = IMG[upId];
  if (aimUp && st === 'alive' && upImg) { // dedicated pose: the gun actually points up
    // v10 fix (Dylan: "when I point up to shoot, my character gets bigger" —
    // shouldn't happen): this used to draw at hgt*1.42. Pixel-measured both
    // sprites' actual cat-body proportions (head-top to feet, excluding the
    // gun's headroom) and they're within ~3% of each other (up: ~89% of
    // canvas, forward: ~92%) — no inflation needed, same hgt as every other pose.
    const uh = hgt;
    const uw = uh * (upImg.width / upImg.height);
    drawImg(ctx, upId, sx - uw / 2, y - uh, uw, uh, flip);
  } else if (runT > 0 && st === 'alive' && !crouch && !fireFlash && SHEET[sheetId]) {
    const s = SHEET[sheetId];
    const fr = Math.floor(runT / (1000 / s.fps)) % s.frames;
    drawSheet(ctx, sheetId, fr, sx - w2 / 2, y - hgt, w2, hgt, flip);
  } else if (!drawImg(ctx, imgId, sx - w2 / 2, y - hgt, w2, hgt, flip)) {
    ctx.fillStyle = PAL.khaki; ctx.fillRect(sx - 18, y - hgt, 36, hgt);
  }
  ctx.restore();
  if (aimUp && st === 'alive' && !upImg) { // fallback cue if the up-pose sprite is missing
    ctx.strokeStyle = PAL.cheese; ctx.lineWidth = 2;
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(sx, y - hgt - 4); ctx.lineTo(sx, y - hgt - 46); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(sx - 5, y - hgt - 40); ctx.lineTo(sx, y - hgt - 50); ctx.lineTo(sx + 5, y - hgt - 40); ctx.fill();
  }
  // v13 weapon overlay (Dylan: "his actual gun needs to change... the same gun
  // shooting different bullets is fucking lazy"). The hero sprite has a rifle
  // baked in, so every pickup looked identical. These sit over the gun hand,
  // sized off the hero's height and flipped with his facing. Only the upgrades
  // draw -- the default rifle is already in the sprite.
  const wepArt = { gatling: 'wep_gatling', flame: 'wep_flame', raygun: 'wep_raygun' }[weap];
  if (wepArt && IMG[wepArt] && st === 'alive' && !bike) {
    const wi = IMG[wepArt];
    const ww = hgt * 0.92, wh2 = ww * (wi.height / wi.width);
    // hand sits just forward of centre, a little above the hip
    const hx = sx + face * hgt * 0.20, hy2 = y - hgt * (aimUp ? 0.72 : 0.46);
    ctx.save();
    ctx.translate(hx, hy2);
    if (aimUp) ctx.rotate(face * -1.15);       // swing the barrel skyward with the aim-up pose
    if (face < 0) ctx.scale(-1, 1);
    ctx.drawImage(wi, -ww * 0.28, -wh2 / 2, ww, wh2);
    ctx.restore();
  }
  if (pid === myPid) {
    ctx.fillStyle = PAL.cheese;
    ctx.beginPath(); ctx.moveTo(sx - 7, y - hgt - 18); ctx.lineTo(sx + 7, y - hgt - 18); ctx.lineTo(sx, y - hgt - 8); ctx.fill();
  }
  if (transActive) ctx.restore();
}

function drawBullet(ctx, b, cam) {
  const [x, y, k] = b;
  const sx = x - cam;
  if (sx < -40 || sx > W + 40) return;
  // v13: elongated projectiles rotate to face travel. sim.js sends the angle at
  // index 4; older snapshots (and the boss beam, which is world-vertical by
  // design) fall back to 0 = pointing right, i.e. the previous behaviour.
  const ang = b.length > 4 ? b[4] : 0;
  const spin = (k === 1 || k === 2 || k === 6 || k === 8 || k === 9) && ang !== 0;
  if (spin) { ctx.save(); ctx.translate(sx, y); ctx.rotate(ang); ctx.translate(-sx, -y); }
  if (k === 1 || k === 2) { // tracer
    // Playtest: "your own bullets are the least visible object on screen" --
    // and it was true in the code, not just in feel. This was a flat 14x4
    // #ffe08a rect with NO glow layer, fired against khaki/mud, while the
    // alien ray below gets a 28x9 acid halo and even shrapnel gets one. Enemy
    // fire read beautifully and yours didn't. b[3] is b.from (1 = the player),
    // so the player's rounds now get the glow + hot-white core treatment and
    // enemy small-arms keep the original flat tracer.
    const mine = b.length > 3 && b[3] === 1;
    if (mine) {
      ctx.fillStyle = 'rgba(255,240,190,0.30)';
      ctx.fillRect(sx - 17, y - 5, 34, 10);
      ctx.fillStyle = PAL.tracer;
      ctx.fillRect(sx - 11, y - 3, 22, 6);
      ctx.fillStyle = '#fffef2';
      ctx.fillRect(sx - 4, y - 1, 14, 2);
    } else {
      ctx.fillStyle = PAL.tracer;
      ctx.fillRect(sx - 7, y - 2, 14, 4);
    }
  } else if (k === 3) { // grenade
    ctx.fillStyle = PAL.jungle2;
    ctx.beginPath(); ctx.arc(sx, y, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = PAL.outline; ctx.lineWidth = 2; ctx.stroke();
  } else if (k === 4 || k === 5) { // cheese arc / gouda shell
    ctx.fillStyle = PAL.cheese;
    ctx.beginPath(); ctx.moveTo(sx - 9, y + 6); ctx.lineTo(sx + 9, y + 6); ctx.lineTo(sx + 6, y - 8); ctx.closePath(); ctx.fill();
  } else if (k === 6) { // alien ray
    ctx.fillStyle = PAL.ray;
    ctx.fillRect(sx - 10, y - 2, 20, 5);
    ctx.fillStyle = PAL.acidGlow; ctx.fillRect(sx - 14, y - 4, 28, 9);
  } else if (k === 8) { // shrapnel fragment
    ctx.fillStyle = PAL.boom2;
    ctx.fillRect(sx - 4, y - 1, 8, 3);
    ctx.fillStyle = 'rgba(255,210,60,0.35)';
    ctx.fillRect(sx - 10, y - 2, 16, 5);
  } else if (k === 9) { // stolen ray gun bolt: long piercing acid lance
    ctx.fillStyle = PAL.acidGlow;
    ctx.fillRect(sx - 26, y - 5, 52, 11);
    ctx.fillStyle = PAL.ray;
    ctx.fillRect(sx - 20, y - 2, 40, 5);
    ctx.fillStyle = '#eaffd0';
    ctx.fillRect(sx + 12, y - 1, 8, 3);
  } else if (k === 10) { // flame
    // v13 (Dylan: "flamethrower is weak, it shoots circles, make the flames
    // look real... stop the flame getting cut off, it should just fade out not
    // have a hard cut off with weak feathering"). Was two hard-edged discs at
    // random colours — literally circles, and both ended on a crisp boundary.
    // Now: a soft radial core that grows and cools along the projectile's life
    // (index 5 = 0 at spawn, 1 at burnout, sent by sim.js), so the tongue of
    // flame widens and dissolves instead of stopping dead. Every stop is a
    // gradient to fully transparent, so there is no edge to see.
    const age = b.length > 5 ? b[5] : 0.35;
    const grow = 15 + age * 44;   // v13: bigger than the first pass -- at 8+26 the stream still read as 'weak' (Dylan's word) even once it was soft-edged
    const heat = 1 - age;
    const wob = Math.sin((sx + y) * 0.35 + age * 9) * 2.5;
    const cx = sx, cy = y + wob;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // overlapping puffs fuse into one sheet of fire instead of reading as separate blobs
    const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, grow * 1.7);
    g1.addColorStop(0, 'rgba(255,250,228,' + (0.92 * heat + 0.16).toFixed(3) + ')');
    g1.addColorStop(0.3, 'rgba(255,196,80,' + (0.72 * heat + 0.20).toFixed(3) + ')');
    g1.addColorStop(0.65, 'rgba(255,116,28,' + (0.46 * heat + 0.14).toFixed(3) + ')');
    g1.addColorStop(1, 'rgba(90,30,10,0)');
    ctx.fillStyle = g1;
    ctx.beginPath(); ctx.arc(cx, cy, grow * 1.7, 0, 7); ctx.fill();
    // a little dark smoke trailing the cooling tail, again edge-free
    if (age > 0.55) {
      const g2 = ctx.createRadialGradient(cx, cy - 6, 0, cx, cy - 6, grow * 1.3);
      g2.addColorStop(0, 'rgba(70,60,50,' + (0.30 * (age - 0.55) / 0.45).toFixed(3) + ')');
      g2.addColorStop(1, 'rgba(70,60,50,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(cx, cy - 6, grow * 1.3, 0, 7); ctx.fill();
    }
    ctx.restore();
  } else if (k === 7) { // boss death beam
    ctx.fillStyle = PAL.acidGlow;
    ctx.fillRect(sx - 26, 0, 52, H);
    ctx.fillStyle = PAL.ray;
    ctx.fillRect(sx - 8, 0, 16, H);
  }
  if (spin) ctx.restore();
}

// ---------- shared muzzle-flash burst (v11.2) ----------
// Dylan: "the muzzle flash from the gun look cooler like fire coming out not
// a lazy circle" — the rail vehicles (door gun, skyraider, PT boat, surf) were
// all drawing a single flat filled arc() circle for their muzzle flash, while
// the on-foot player already had this proper oriented star-burst since v10.1.
// Extracted that logic into a shared function so every gun in the game gets
// the same real "fire" look instead of a dot. `s01` is 0-1 (1 = just fired,
// fading to 0); `ang` is the barrel angle in radians (0 = facing +x).
export function drawMuzzleBurst(ctx, x, y, ang, s01) {
  // v13 (Dylan: "animate the muzzle flash with actual fire like metal slug, and
  // closer to the effect you have on the air support bombs those look good").
  // The v11.2 burst was flat vector geometry -- a translucent cone, two hard
  // four-point stars and a white dot, all at fixed opacity. It read as a decal,
  // not fire. What makes the air-support blast work is layered radial falloff
  // with a white-hot core cooling to orange and no hard edges anywhere, so this
  // now uses the same construction: a gradient fireball core, a gradient-filled
  // flame cone, licking tongues whose length varies per shot, and a fast
  // decaying ember spray. Everything is driven off k so it actually animates
  // across the flash's lifetime instead of only scaling.
  const k = Math.max(0, Math.min(1, s01));
  if (k <= 0) return;
  const age = 1 - k;              // 0 at the instant of firing -> 1 at burnout
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const s = 0.75 + 0.55 * age;    // the flash blooms outward as it dies
  ctx.globalCompositeOperation = 'lighter';

  // 1. flame cone down the barrel axis: gradient along its length, so the tip
  // dissolves into nothing rather than ending on a straight edge.
  const L = (46 + 30 * age) * s;
  const cone = ctx.createLinearGradient(0, 0, L, 0);
  cone.addColorStop(0, `rgba(255,248,222,${(0.85 * k).toFixed(3)})`);
  cone.addColorStop(0.35, `rgba(255,196,86,${(0.55 * k).toFixed(3)})`);
  cone.addColorStop(0.7, `rgba(255,124,32,${(0.28 * k).toFixed(3)})`);
  cone.addColorStop(1, 'rgba(190,60,10,0)');
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(L * 0.5, -15 * s, L, -3 * s);
  ctx.quadraticCurveTo(L * 1.06, 0, L, 3 * s);
  ctx.quadraticCurveTo(L * 0.5, 15 * s, 0, 0);
  ctx.fill();

  // 2. tongues of flame licking off the cone at slight angles -- the thing that
  // makes a Metal Slug flash read as burning gas rather than a star shape.
  for (let i = 0; i < 4; i++) {
    const a2 = (i - 1.5) * 0.30 + Math.sin(i * 2.1) * 0.05;
    const tl = L * (0.45 + 0.42 * ((i * 7 % 5) / 5)) * (0.7 + 0.5 * k);
    const tg = ctx.createLinearGradient(0, 0, Math.cos(a2) * tl, Math.sin(a2) * tl);
    tg.addColorStop(0, `rgba(255,236,180,${(0.5 * k).toFixed(3)})`);
    tg.addColorStop(1, 'rgba(255,110,20,0)');
    ctx.strokeStyle = tg;
    ctx.lineWidth = (7 - i * 0.9) * s * k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Math.cos(a2) * tl * 0.55, Math.sin(a2) * tl * 0.9, Math.cos(a2) * tl, Math.sin(a2) * tl);
    ctx.stroke();
  }

  // 3. white-hot ball at the muzzle, cooling through the same ramp the big
  // bombs use. Radial, so it has no boundary.
  const R0 = (13 + 9 * age) * s;
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R0);
  core.addColorStop(0, `rgba(255,255,244,${(0.95 * k).toFixed(3)})`);
  core.addColorStop(0.4, `rgba(255,214,120,${(0.7 * k).toFixed(3)})`);
  core.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(0, 0, R0, 0, 7); ctx.fill();

  // 4. sparks thrown forward, densest at the moment of firing
  const nSpark = Math.round(5 * k);
  for (let i = 0; i < nSpark; i++) {
    const a2 = (i / Math.max(1, nSpark) - 0.5) * 1.15;
    const d = L * (0.6 + 0.55 * ((i * 13 % 7) / 7));
    ctx.fillStyle = `rgba(255,240,190,${(0.8 * k).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(Math.cos(a2) * d, Math.sin(a2) * d, 1.6 * s, 0, 7);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------- rotor animation (all helicopters — sprite blades are erased) ----------
export function drawRotor(ctx, cx, cy, r, t) {
  const ry = Math.max(3, r * 0.10);
  const ph = t / 30;
  const wob = Math.sin(ph);
  ctx.save();
  ctx.fillStyle = 'rgba(225,225,215,0.16)'; // motion-blur disc
  ctx.beginPath(); ctx.ellipse(cx, cy, r, ry, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(40,38,34,0.55)'; ctx.lineWidth = Math.max(2, r * 0.05);
  ctx.beginPath(); ctx.moveTo(cx - r * Math.abs(Math.sin(ph)), cy + ry * 0.4 * wob);
  ctx.lineTo(cx + r * Math.abs(Math.sin(ph + 1.3)), cy - ry * 0.4 * wob); ctx.stroke();
  ctx.strokeStyle = 'rgba(230,230,220,0.45)'; ctx.lineWidth = Math.max(1.5, r * 0.035);
  ctx.beginPath(); ctx.moveTo(cx - r * Math.abs(Math.cos(ph * 1.1)), cy - ry * 0.3 * wob);
  ctx.lineTo(cx + r * Math.abs(Math.cos(ph * 0.9)), cy + ry * 0.3 * wob); ctx.stroke();
  ctx.fillStyle = 'rgba(45,42,38,0.9)'; // hub cap
  ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(2.5, r * 0.06), Math.max(2, ry * 0.5), 0, 0, 7); ctx.fill();
  ctx.restore();
}
function drawTailRotor(ctx, cx, cy, r, t) {
  const a = t / 24;
  ctx.save();
  ctx.fillStyle = 'rgba(70,60,80,0.35)'; // blur disc over the baked blades
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(220,215,225,0.55)'; ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
  ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke();
  ctx.restore();
}

// ---------- ambient air war (background flavor, never overdone) ----------
const AW = { nextT: 0, act: null };
function drawAirWar(ctx, t, inv) {
  if (!AW.nextT) AW.nextT = t + 7000;
  if (!AW.act && t > AW.nextT) {
    AW.act = {
      born: t,
      y: 110 + Math.random() * 110,
      spd: 130 + Math.random() * 60,
      dogfight: inv && Math.random() < 0.8,
      doomed: Math.random() < 0.7,   // mostly the Hueys lose
      smoking: Math.random() < 0.55,
    };
  }
  const a = AW.act;
  if (!a) return;
  const el = (t - a.born) / 1000;
  const prog = el * a.spd;
  const hx = W + 120 - prog;               // right to left across the far sky
  if (hx < -220) { AW.act = null; AW.nextT = t + 14000 + Math.random() * 14000; return; }
  const dip = a.doomed && a.dogfight ? Math.max(0, prog - W * 0.55) * 0.35 : 0;
  const hy = a.y + Math.sin(el * 2.2) * 6 + dip;
  ctx.save();
  ctx.globalAlpha = 0.8;
  const hw = 96, hh = 52;
  // nose-down pitch toward travel + wobble (it should look like it's actually flying)
  const pitch = 0.09 + Math.sin(el * 2.2) * 0.035 + (dip > 0 ? Math.min(0.22, dip * 0.002) : 0);
  ctx.translate(hx + hw / 2, hy + hh / 2); ctx.rotate(pitch); ctx.translate(-(hx + hw / 2), -(hy + hh / 2));
  if (!drawImg(ctx, 'heli_us', hx, hy, hw, hh, true)) { ctx.fillStyle = '#2e3324'; ctx.fillRect(hx, hy, hw, hh * 0.4); }
  drawRotor(ctx, hx + (1 - 0.475) * hw, hy + 0.05 * hh, 0.46 * hw, t);
  drawTailRotor(ctx, hx + (1 - 0.910) * hw, hy + 0.160 * hh, 0.078 * hw, t);
  ctx.translate(hx + hw / 2, hy + hh / 2); ctx.rotate(-pitch); ctx.translate(-(hx + hw / 2), -(hy + hh / 2));
  if (a.smoking || dip > 0) { // damage trail
    ctx.fillStyle = 'rgba(50,45,40,0.5)';
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath(); ctx.arc(hx + hw + i * 14, hy + 10 - i * 3 - dip * 0.1, 5 + i * 2, 0, 7); ctx.fill();
    }
  }
  if (a.dogfight) { // pursuing saucer, pot shots
    const ux = hx + 190, uy = hy - 26 + Math.sin(el * 3.1) * 10;
    if (!drawImg(ctx, 'ufo_small', ux, uy, 84, 50, false)) { ctx.fillStyle = PAL.tealDark; ctx.fillRect(ux, uy, 70, 26); }
    if (Math.floor(el * 2) % 3 === 0) { // green tracer burst
      ctx.strokeStyle = PAL.ray; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ux + 6, uy + 30); ctx.lineTo(hx + hw - 6, hy + 18); ctx.stroke();
    }
    if (!a.doomed && prog > W * 0.6 && prog < W * 0.6 + a.spd * 0.35) { // rare payback: saucer takes the hit
      ctx.fillStyle = PAL.boom2;
      ctx.beginPath(); ctx.arc(ux + 40, uy + 24, 18 + (prog % 17), 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

// ---------- HUD ----------
function hudText(ctx, txt, x, y, size, align, col) {
  ctx.font = `bold ${FX.opts.bigText ? size * 1.3 : size}px monospace`;
  ctx.textAlign = align || 'left';
  ctx.fillStyle = PAL.outline;
  ctx.fillText(txt, x + 2, y + 2);
  ctx.fillStyle = col || PAL.hud;
  ctx.fillText(txt, x, y);
}

export function render(ctx, view, t, myPid, dbg) {
  const { cam, inv } = view;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.save();
  if (FX.shake > 0.4) ctx.translate((Math.random() - 0.5) * FX.shake * 2, (Math.random() - 0.5) * FX.shake * 2);

  // parallax background, mirror-tiled so the wrap never shows a seam
  const bg = inv ? IMG.bg_invasion : IMG.bg_jungle;
  if (bg) {
    const par = cam * 0.35;
    const idx = Math.floor(par / W);
    const off = -(par % W);
    for (let i = 0; i <= 1; i++) {
      const x = off + i * W;
      if ((idx + i) % 2 === 1) {
        ctx.save(); ctx.translate(x + W, 0); ctx.scale(-1, 1);
        ctx.drawImage(bg, 0, 0, W + 1, H);
        ctx.restore();
      } else {
        ctx.drawImage(bg, x, 0, W + 1, H);
      }
    }
  } else { ctx.fillStyle = PAL.duskSky; ctx.fillRect(0, 0, W, H); }

  // ambient air war: lone Hueys, and dogfights with UFOs after the invasion
  drawAirWar(ctx, t, inv);

  drawGround(ctx, cam, inv);
  drawIslands(ctx, cam, view.t || t);
  // blood splats stay on the ground where cats fell
  for (const s of FX.splats) {
    const bx = s.x - cam;
    if (bx < -60 || bx > W + 60) continue;
    ctx.globalAlpha = s.a;
    // v13: cheese splats share the decal system with blood but keep their own
    // colour, so a molten-cheese kill leaves yellow on the ground, not red.
    ctx.fillStyle = s.cheese ? '#d99a1b' : '#6e1410';
    ctx.beginPath(); ctx.ellipse(bx, s.y, s.r, s.r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  drawTunnels(ctx, cam);
  drawTraps(ctx, cam, view.tr || []);
  drawPlatforms(ctx, cam, view.crates);

  for (const l of view.lu || []) { drawPickup(ctx, l[0] - cam, l[1] + 14, 'cheese', t); }
  // v13: sim-authoritative burning ground (survives across frames, damages
  // enemies) mirrored into the client-side FX.fires list the renderer draws.
  // Matched by rounded x so a patch isn't re-added every snapshot.
  for (const f of view.fi || []) {
    let ex = FX.fires.find(q => Math.abs(q.x - f[0]) < 6);
    if (!ex) FX.fires.push({ x: f[0], y: f[1], t: 0, T: Math.max(400, f[2]), r: (f[3] ? 54 : 30) + Math.random() * 12 });
    else ex.T = Math.max(ex.T, ex.t + Math.max(200, f[2]));
  }
  for (const pk of view.pk || []) drawPickup(ctx, pk[0] - cam, pk[1], pk[2], t);

  // boss telegraph rays
  for (const r of FX.rays) {
    ctx.fillStyle = `rgba(140,255,59,${0.12 + 0.1 * Math.sin(t / 60)})`;
    ctx.fillRect(r.x - cam - 26, 0, 52, H);
  }

  for (const e2 of view.en || []) drawEntity(ctx, e2, cam, t, inv);
  for (const p of view.pl || []) drawPlayerEnt(ctx, p, cam, t, myPid);
  for (const b of view.bl || []) drawBullet(ctx, b, cam);

  // muzzle flashes — bright core + 8-point star burst + forward-biased cone,
  // all oriented along the barrel via ang. Metal-Slug-inspired: punchy, brief,
  // reads instantly even at 60fps.
  for (const fl of FX.flashes) {
    const k = fl.t / fl.T; // 1 -> 0 over the flash's life
    ctx.save();
    ctx.translate(fl.x - cam, fl.y);
    ctx.rotate(fl.ang);
    const s = (0.55 + 0.45 * (1 - k)) * (0.6 + 0.4 * k); // quick punch-in then shrink
    ctx.globalAlpha = Math.max(0, k);
    // forward cone (translucent, biased down the barrel axis)
    ctx.fillStyle = 'rgba(255,224,138,0.5)';
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(30 * s + 14, -16 * s);
    ctx.lineTo(30 * s + 14, 16 * s);
    ctx.closePath(); ctx.fill();
    // 8-point star burst (two overlapping 4-point diamonds, one rotated 45°)
    ctx.fillStyle = PAL.boom2;
    for (let rot = 0; rot < 2; rot++) {
      ctx.save();
      ctx.rotate(rot * Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(20 * s, 0); ctx.lineTo(4 * s, 4 * s);
      ctx.lineTo(0, 20 * s); ctx.lineTo(-4 * s, 4 * s);
      ctx.lineTo(-20 * s, 0); ctx.lineTo(-4 * s, -4 * s);
      ctx.lineTo(0, -20 * s); ctx.lineTo(4 * s, -4 * s);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // hot white core
    ctx.fillStyle = '#fff3d0';
    ctx.beginPath(); ctx.arc(0, 0, 7 * s, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // melee slashes
  for (const s of FX.slashes) {
    ctx.strokeStyle = PAL.hud; ctx.lineWidth = 4;
    const k2 = 1 - s.t / 140;
    ctx.beginPath(); ctx.arc(s.x - cam, s.y, 26 + k2 * 18, -0.9 + k2 * 2, 0.6 + k2 * 2); ctx.stroke();
  }

  // v13: ground fire left behind by the flamethrower and napalm. Drawn UNDER
  // the blast sheet so a fresh explosion reads on top of its own residue.
  // Layered soft blobs with a per-flame time offset rather than one hard disc —
  // Dylan's note was that flames "shoot circles" with "a hard cut off with weak
  // feathering", so nothing here uses a crisp edge.
  for (const f of FX.fires) {
    const life = 1 - f.t / f.T;
    const flick = 0.75 + 0.25 * Math.sin(f.t / 55 + f.x);
    const fx = f.x - cam;
    for (let L = 0; L < 3; L++) {
      const rr = f.r * (1 - L * 0.26) * flick * (0.45 + life * 0.55);
      const gr = ctx.createRadialGradient(fx, f.y - rr * 0.3, 0, fx, f.y - rr * 0.3, Math.max(1, rr));
      gr.addColorStop(0, L === 0 ? 'rgba(255,240,190,' + (0.55 * life).toFixed(3) + ')' : 'rgba(255,170,60,' + (0.4 * life).toFixed(3) + ')');
      gr.addColorStop(0.55, 'rgba(255,120,30,' + (0.28 * life).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(120,40,10,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(fx, f.y - rr * 0.3, Math.max(1, rr), 0, 7); ctx.fill();
    }
  }

  // v13: expanding shockwave ring on every blast — cheap, reads instantly, and
  // gives small kills a sense of concussion the bare particles never had.
  for (const r of FX.rings) {
    const k = r.t / r.T;
    ctx.globalAlpha = (1 - k) * 0.55;
    ctx.strokeStyle = k < 0.35 ? '#fff3d0' : PAL.boom1;
    ctx.lineWidth = Math.max(1, 5 * (1 - k));
    ctx.beginPath(); ctx.arc(r.x - cam, r.y, r.r * (0.15 + k * 0.85), 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // floating "+100" on every kill: rises, fades, and pops slightly bigger for
  // the rarer high-value targets so a UFO or a heli reads as worth more at a
  // glance rather than only in the HUD total.
  for (const s of FX.scores) {
    const k = s.t / s.T;
    const big = s.n >= 800;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (1 - k) * 1.8);
    ctx.font = `bold ${big ? 26 : 18}px monospace`;
    ctx.textAlign = 'center';
    const tx = s.x - cam, ty = s.y - k * 46;
    ctx.fillStyle = '#26231c';
    ctx.fillText('+' + s.n, tx + 2, ty + 2);
    ctx.fillStyle = big ? '#FFC93C' : '#8CFF3B';
    ctx.fillText('+' + s.n, tx, ty);
    ctx.restore();
  }
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;

  // sprite-sheet explosions (the generated 16-frame blast)
  if (SHEET.sheet_explosion) {
    const es = SHEET.sheet_explosion;
    for (const b of FX.booms) {
      const fr = Math.min(es.frames - 1, Math.floor(b.t / (1000 / es.fps)));
      drawSheet(ctx, 'sheet_explosion', fr, b.x - cam - b.s / 2, b.y - b.s * 0.62, b.s, b.s, !!b.flip);
    }
  }

  // particles
  for (const p of FX.parts) {
    if (!p.on) continue;
    const a = Math.max(0, p.t / p.T);
    ctx.globalAlpha = p.kind === 2 ? a * 0.6 : a;
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x - cam, p.y, p.r * (p.kind === 2 ? 1.6 - a * 0.6 : a), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // v11 REMOVED (Dylan, twice now: "the screen is dark AFTER LEAVING THE
  // TUNNEL - it shouldn't be i already gave you this note"). This dimmed the
  // WHOLE overworld screen — not the actual first-person tunnel, which is a
  // completely separate render mode with its own torch-lit look already —
  // any time the camera midpoint sat between x=3000 and x=3800. The main
  // tunnel door is at x=3350 and you re-enter the overworld at ~x=3410 after
  // clearing it, both inside that range, so the overworld read as dark both
  // on the walk up to the door AND immediately after walking out of it. The
  // real tunnel's own darkness/torch-glow rendering lives entirely in
  // fps.js's Tunnel.render() and is unaffected by deleting this.

  ctx.restore();

  if (FX.flash > 0 && FX.opts.flash) {
    ctx.fillStyle = `rgba(255,240,200,${(FX.flash / CFG.flashMs) * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (FX.green > 0) { // THE flash — washes the world out into the cutscene
    const k2 = FX.green > 700 ? (1100 - FX.green) / 400 : FX.green / 700;
    ctx.fillStyle = `rgba(124,255,77,${Math.min(1, k2).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  // v12: fade down from white as the hero emerges from the tunnel. Drawn above
  // the world but below the HUD, so the player sees the scene resolve out of
  // the light rather than the HUD punching through a white screen.
  if (FX.whiteT > 0) {
    ctx.fillStyle = `rgba(255,250,238,${(FX.whiteT / FX.whiteT0).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // ---- HUD ----
  const plMine = (view.pl || []).find(p => p[0] === myPid) || (view.pl || [])[0];
  let hy = 34;
  for (const p of view.pl || []) {
    const [pid, hero, , , , st, lives, weap, ammo, gren, cheese, , , , , hp] = p;
    const label = (pid === myPid ? '▶ ' : '') + (hero === 'us' ? STR.heroUsName : STR.heroVcName);
    hudText(ctx, label, 16, hy, 15, 'left', pid === myPid ? PAL.cheese : PAL.hud);
    // health meter: chunky segments, green -> red
    const segW = 22, segH = 10;
    for (let i = 0; i < CFG.hpMax; i++) {
      const x0 = 16 + i * (segW + 4), y0 = hy + 8;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x0 - 1, y0 - 1, segW + 2, segH + 2);
      ctx.fillStyle = i < (hp || 0) ? ((hp || 0) >= 4 ? PAL.acid : (hp || 0) >= 2 ? PAL.cheese : PAL.redAccent) : 'rgba(243,233,200,0.15)';
      ctx.fillRect(x0, y0, segW, segH);
    }
    const wLabel = weap === 'gatling' ? `  GATLING ${ammo}` : weap === 'raygun' ? `  RAY GUN ${ammo}` : weap === 'flame' ? `  FLAME ${ammo}` : '';
    hudText(ctx, `x${lives}  ✚${gren}  🧀${cheese}` + wLabel, 16, hy + 34, 14, 'left', PAL.hudDim);
    hy += 62;
  }
  hudText(ctx, `${STR.score}: ${view.score}`, W / 2, 30, 18, 'center');
  hudText(ctx, `POW x${view.pows}`, W - 16, 30, 15, 'right', PAL.cheese);

  if (view.boss) {
    const bw = 420, bx = (W - bw) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx - 4, 52, bw + 8, 18);
    ctx.fillStyle = PAL.acid; ctx.fillRect(bx, 55, bw * Math.max(0, view.boss.hp / view.boss.max), 12);
    hudText(ctx, STR.goalBoss, W / 2, 88, 13, 'center', PAL.hudDim);
  }

  // banners / hints
  let by = H * 0.30;
  for (const b of FX.banners) {
    if ((b.d || 0) > 0) continue; // still queued behind an earlier banner
    const a = Math.min(1, b.t / 400);
    ctx.globalAlpha = a;
    hudText(ctx, STR[b.k] || b.k, W / 2, by, 34, 'center', PAL.cheese);
    ctx.globalAlpha = 1;
    by += 44;
  }
  let hby = H - 96;
  for (const h2 of FX.hints) {
    if ((h2.d || 0) > 0) continue; // still queued behind an earlier hint
    ctx.globalAlpha = Math.min(1, h2.t / 500);
    hudText(ctx, STR[h2.k] || h2.k, W / 2, hby, 16, 'center', PAL.acid);
    ctx.globalAlpha = 1;
    hby -= 26;
  }

  if (dbg) {
    hudText(ctx, dbg, 16, H - 14, 12, 'left', '#0f0');
  }
  ctx.restore();
}
