// Headless co-op check for the first-person tunnels (game/fps.js, class Tunnel).
// Run after `bash tools/assemble.sh` (imports ../public/).
//   1. solo is unchanged: seeded run of the new Tunnel == seeded run of HEAD's
//   2. co-op from the start: P2 bot steers its crosshair onto enemies and fires
//   3. P2 joins halfway through
//   4. P2 enters out, crosshair hidden and inert, then coopRevive brings it back
//   5. shared-body life accounting (who pays, out, fail only when both out)
//   6. grapple mash accepts P2's FIRE alone
//   7. drawP2 runs against a mock canvas (no exceptions)
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { C, CFG, W, H } from '../public/config.js';
import { Tunnel, botPlan, botStep } from '../public/fps.js';
import { IMG } from '../public/assets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1000 / 60, CAP = 180000;
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

// deterministic Math.random so solo runs can be compared frame for frame
const realRandom = Math.random;
function seed(s) {
  let a = s >>> 0;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const mkP = (pid) => ({ pid, hero: pid === 'p1' ? 'us' : 'vc', st: 'alive', lives: CFG.lives, hp: CFG.hpMax, deaths: 0 });

// P2 autopilot: put the crosshair on the nearest visible threat and pull the trigger.
function botP2(tun, st) {
  if (!tun.p2Live()) return 0;
  if (tun.script && !tun.script.done) { st.mash = (st.mash || 0) + 1; return st.mash % 2 ? C.FIRE : 0; }
  if (tun.downT) { st.mash = (st.mash || 0) + 1; return st.mash % 2 ? C.FIRE : 0; }
  const c = tun.c2;
  let best = null;
  for (const e of tun.enemies) {
    if (e.dead || e.st === 'hide' || e.kind === 'barrel') continue;
    const s = tun.screenOf(e.x, e.y);
    if (Math.abs(s.da) > 0.62 || s.d > 9 || !tun.los(e.x, e.y)) continue;
    if (!best || s.d < best.d) best = s;
  }
  let b = 0;
  const tx = best ? best.x : W * 0.6, ty = best ? best.y : H * 0.5;
  if (tx > c.x + 10) b |= C.R; else if (tx < c.x - 10) b |= C.L;
  if (ty > c.y + 10) b |= C.DOWN; else if (ty < c.y - 10) b |= C.UP;
  if (best && Math.abs(tx - c.x) < 28 && Math.abs(ty - c.y) < 40) b |= C.FIRE;
  if (best && best.d < 2.2 && c.bombs > 0 && (st.t = (st.t || 0) + 1) % 2) b |= C.GREN;
  return b;
}

// opts: { coop: 'none'|'start'|'join'|'outThenRevive', joinAt, threeArg }
function run(TunnelCls, map, opts = {}) {
  const tun = new TunnelCls(map);
  const plan = botPlan(tun);
  const p = mkP('p1');
  const q = opts.coop && opts.coop !== 'none' ? mkP('p2') : undefined;
  if (opts.coop === 'outThenRevive') { q.st = 'out'; q.lives = 0; q.hp = 0; }
  const st = {};
  let ms = 0, joined = opts.coop === 'start' || opts.coop === 'outThenRevive', revived = false, hits = 0, hiddenFrames = 0, shotsWhileOut = 0;
  while (!tun.done && ms < CAP) {
    if (opts.coop === 'join' && !joined && ms >= opts.joinAt) { tun.coopJoin(q); joined = true; }
    if (opts.coop === 'outThenRevive' && !revived && ms >= opts.joinAt) { tun.coopRevive(q); revived = true; }
    let b1 = botStep(tun, plan);
    if (opts.p2MashOnly && tun.script && !tun.script.done) b1 = 0;
    if (opts.threeArg) tun.step(b1, DT, p);
    else if (!joined) tun.step(b1, DT, p, 0, undefined);
    else {
      let b2 = botP2(tun, st);
      if (opts.coop === 'outThenRevive' && !revived) {
        b2 = C.FIRE | C.R | C.GREN;                         // hammer everything while out
        if (!tun.p2Live()) hiddenFrames++;
        if (tun.c2 && tun.c2.tracer > 0) shotsWhileOut++;
      }
      tun.step(b1, DT, p, b2, q);
      if (tun.c2 && tun.c2.hitT === 160) hits++;          // set this frame = a P2 round landed
    }
    tun.events.length = 0;
    ms += DT;
  }
  return { tun, p, q, ms, hits, hiddenFrames, shotsWhileOut };
}
const fmt = (r) => `done=${r.tun.done} dead=${!!r.tun.result.dead} kills=${r.tun.result.kills} p2Kills=${r.tun.p2Kills} rescued=${r.tun.result.rescued} loot=${r.tun.result.loot} cleared=${r.tun.result.cleared} p2Hits=${r.hits || 0}${r.tun.c2 ? ` bombsLeft=${r.tun.c2.bombs}` : ""} p1=${r.p.lives}L/${r.p.hp}hp${r.q ? ` p2=${r.q.lives}L/${r.q.hp}hp/${r.q.st}` : ''} t=${(r.ms / 1000).toFixed(1)}s`;

// ---- baseline: HEAD's fps.js, written next to the assembled modules ----
const basePath = path.join(ROOT, 'public', '.fps_baseline.js');
let Baseline = null;
try {
  writeFileSync(basePath, execSync('git show HEAD:game/fps.js', { cwd: ROOT, encoding: 'utf8' }));
  Baseline = (await import(basePath + '?' + Date.now())).Tunnel;
} catch (e) { console.log('note: no HEAD baseline (' + e.message.split('\n')[0] + ')'); }
finally { try { unlinkSync(basePath); } catch (_) {} }

for (const map of [0, 1]) {
  console.log(`\n=== map ${map} ===`);
  // 1. solo unchanged (seeded, compared to HEAD and between call shapes)
  seed(1234 + map); const s3 = run(Tunnel, map, { threeArg: true });
  seed(1234 + map); const s5 = run(Tunnel, map, {});
  console.log('solo        ', fmt(s3));
  check(s3.tun.done && !s3.tun.result.dead, `map ${map} solo finishes alive`);
  const sig = (r) => [r.ms.toFixed(3), r.tun.result.kills, r.p.lives, r.p.hp, r.tun.px.toFixed(6), r.tun.py.toFixed(6), r.tun.result.rescued, r.tun.result.loot].join('|');
  check(sig(s3) === sig(s5), `map ${map} step(b,dt,p) == step(b,dt,p,0,undefined)`);
  check(s5.tun.p2 === null && s5.tun.c2 === null, `map ${map} solo never creates P2 state`);
  if (Baseline) {
    seed(1234 + map); const sb = run(Baseline, map, { threeArg: true });
    console.log('HEAD solo   ', fmt(sb));
    check(sig(sb) === sig(s3), `map ${map} solo identical to HEAD frame-for-frame (${sig(s3)})`);
  }
  Math.random = realRandom;

  // 2. co-op from the start, over several seeds
  let p2k = 0, p2h = 0, coopOk = true;
  for (let i = 0; i < 4; i++) {
    seed(99 + i * 7 + map);
    const r = run(Tunnel, map, { coop: 'start' });
    console.log(`coop s${i}     `, fmt(r));
    coopOk = coopOk && r.tun.done && !r.tun.result.dead;
    p2k += r.tun.p2Kills; p2h += r.hits;
    check(r.tun.result.kills >= r.tun.p2Kills, `map ${map} coop s${i}: P2 kills are inside result.kills`);
  }
  check(coopOk, `map ${map} co-op from start: every run finishes alive`);
  // map 1's autopilot route grabs the alien tech and leaves in ~9s; its rats
  // burst at the edge of view behind the walker, so the roaming P2 bot rarely
  // gets a clean look. Kills are required on map 0; map 1 gets the aimed
  // drill below, which proves the same hit test against its rats.
  if (map === 0) {
    check(p2h > 0, `map ${map} co-op from start: P2 rounds landed (${p2h} hits over 4 runs)`);
    check(p2k > 0, `map ${map} co-op from start: P2 got kills (${p2k} over 4 runs)`);
  } else console.log(`info  map ${map} roaming P2: ${p2h} hits, ${p2k} kills over 4 runs`);

  // aimed drill: face each live, visible non-barrel enemy from a free cell,
  // park P2's crosshair on it via screenOf, hold FIRE; it must die to P2.
  {
    const tun = new Tunnel(map); const p = mkP('p1'), q = mkP('p2');
    tun.step(0, DT, p, 0, q);
    let tried = 0, killed = 0, misses = 0;
    for (const e of tun.enemies) {
      if (e.kind === 'barrel') continue;
      // stand 2.5 cells away on a free cell with line of sight
      let spot = null;
      for (let a = 0; a < 16 && !spot; a++) {
        const ang = a / 16 * Math.PI * 2, sx = e.x + Math.cos(ang) * 2.5, sy = e.y + Math.sin(ang) * 2.5;
        if (tun.solid(sx, sy)) continue;
        // keep barrels out of the line of fire: nearest-wins would (correctly) pop the barrel first
        const blocked = tun.enemies.some(o => o.kind === 'barrel' && !o.dead && [0.2, 0.4, 0.6, 0.8, 1].some(k => Math.hypot(sx + (e.x - sx) * k - o.x, sy + (e.y - sy) * k - o.y) < 0.9));
        if (blocked) continue;
        const ox = tun.px, oy = tun.py; tun.px = sx; tun.py = sy;
        if (tun.los(e.x, e.y)) spot = [sx, sy]; else { tun.px = ox; tun.py = oy; }
      }
      if (!spot) continue;
      tried++;
      if (e.st === 'hide') tun.burst(e);
      e.st = 'guard'; e.boltCd = 1e9;                    // hold still for the drill
      tun.ang = Math.atan2(e.y - tun.py, e.x - tun.px) + 0.3; // off-centre: P1's own gun is not on it
      { const s0 = tun.screenOf(e.x, e.y); if (tun.shootAt(s0.x, 75, 0) === e || tun.shootAt(s0.x + 420 * (s0.x < 640 ? 1 : -1), s0.y, 0) === e) misses++; }
      const k0 = tun.p2Kills;
      for (let f = 0; f < 240 && !e.dead; f++) {
        const s = tun.screenOf(e.x, e.y); tun.c2.x = s.x; tun.c2.y = s.y;
        const px = tun.px, py = tun.py, ang = tun.ang;
        tun.step(0, DT, p, C.FIRE, q); tun.events.length = 0;
        tun.px = px; tun.py = py; tun.ang = ang; p.hp = CFG.hpMax; tun.hurtT = 1000; tun.downT = 0;
        if (e.st !== 'guard' && !e.dead) { e.st = 'guard'; e.x = e.hx ?? e.x; }
      }
      if (e.dead && tun.p2Kills > k0) killed++;
    }
    console.log(`aimed drill  map ${map}: ${killed}/${tried} enemies killed by P2's crosshair`);
    check(tried > 0 && killed === tried, `map ${map} aimed drill: P2 crosshair kills every enemy it is put on`);
    check(misses === 0, `map ${map} aimed drill: crosshair above or beside the target does not hit it`);
  }

  // 3. P2 joins halfway
  seed(555 + map);
  const half = s3.ms / 2;
  const rj = run(Tunnel, map, { coop: 'join', joinAt: half });
  console.log('join@half   ', fmt(rj));
  check(rj.tun.done && !rj.tun.result.dead, `map ${map} join halfway: finishes alive`);
  check(rj.tun.p2 === rj.q && !!rj.tun.c2, `map ${map} join halfway: P2 attached`);

  // 4. P2 out from the start, then revived
  seed(777 + map);
  const ro = run(Tunnel, map, { coop: 'outThenRevive', joinAt: half * 0.6 });
  console.log('out+revive  ', fmt(ro));
  check(ro.hiddenFrames > 0 && ro.shotsWhileOut === 0, `map ${map} P2 out: crosshair inert for ${ro.hiddenFrames} frames, 0 shots`);
  check(ro.q.st === 'alive' && ro.q.lives > 0, `map ${map} coopRevive restores P2 (st=${ro.q.st}, lives=${ro.q.lives})`);
  check(ro.tun.done && !ro.tun.result.dead, `map ${map} out+revive: finishes alive`);
}
Math.random = realRandom;

// 5. shared-body life accounting
{
  console.log('\n=== lives ===');
  const tun = new Tunnel(0);
  const p = mkP('p1'), q = mkP('p2');
  tun.step(0, DT, p, 0, q);
  p.lives = 2; q.lives = 3;
  const die = () => { tun.hurtT = 0; tun.downT = 0; p.hp = 1; return tun.hurtFrom(p, tun.px + 1, tun.py, 1); };
  const log = [];
  for (let i = 0; i < 5; i++) { const end = die(); log.push(`${p.lives}/${q.lives}${p.st === 'out' ? 'P1out' : ''}${q.st === 'out' ? 'P2out' : ''}${end ? ' END' : ''}`); }
  console.log('deaths:', log.join(' -> '));
  check(log.join(',') === '2/2,1/2,1/1,0/1P1out,0/0P1outP2out END', 'richer player pays, P1 out keeps running, fail only when both out');
  check(tun.result.dead === true && tun.done, 'result.dead set when both out');
  // P1 out alone, then revived
  const t2 = new Tunnel(0); const p1 = mkP('p1'), p2 = mkP('p2');
  t2.step(0, DT, p1, 0, p2); p1.lives = 1; p2.lives = 1;
  t2.hurtT = 0; p1.hp = 1; t2.hurtFrom(p1, t2.px + 1, t2.py, 1);
  check(p1.st === 'out' && p2.st === 'alive' && !t2.done, 'tie: P1 pays and is out, run continues on P2');
  t2.coopRevive(p1);
  check(p1.st === 'alive' && p1.lives === CFG.lives && p1.hp === CFG.hpMax, 'coopRevive(P1) restores lives/hp/st');
}

// 6. grapple: P2 mashing alone breaks the hold
{
  console.log('\n=== grapple ===');
  seed(42);
  const tun = new Tunnel(0); const plan = botPlan(tun); const p = mkP('p1'), q = mkP('p2');
  let ms = 0, gT = 0, st = {};
  while (!tun.done && ms < CAP && !(tun.script && tun.script.done)) {
    const inG = tun.script && !tun.script.done && tun.script.phase === 'grapple';
    if (inG) gT += DT;
    const b1 = tun.script && !tun.script.done ? 0 : botStep(tun, plan);
    const b2 = inG ? ((st.m = (st.m || 0) + 1) % 2 ? C.FIRE : 0) : 0;
    tun.step(b1, DT, p, b2, q); tun.events.length = 0; ms += DT;
  }
  console.log(`grapple broken by P2 alone in ${(gT / 1000).toFixed(2)}s`);
  check(tun.script && tun.script.done && gT > 0 && gT < 6000, 'P2 FIRE mash alone escapes the grapple well before the 12s failsafe');
  Math.random = realRandom;
}

// 7. render path for Charlie's gun/crosshair against a mock canvas
{
  console.log('\n=== drawP2 ===');
  const mockCtx = () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => mockCtx() }) };
  const tun = new Tunnel(0); const p = mkP('p1'), q = mkP('p2');
  tun.step(0, DT, p, C.FIRE, q);
  let ok = true;
  try {
    tun.c2.reloadT = 300; tun.c2.tracer = 50; tun.c2.hitT = 20;
    tun.drawP2(mockCtx(), 1000);                         // fallback shape, no art loaded
    IMG.fps_pistol = { width: 120, height: 200 };
    tun.drawP2(mockCtx(), 1100);                         // tinted, mirrored sprite path
  } catch (e) { ok = false; console.log(e.stack); }
  delete IMG.fps_pistol; delete globalThis.document;
  check(ok, 'drawP2 renders (fallback + sprite paths) without throwing');
}

console.log(`\nRESULT: ${fails ? 'FAIL (' + fails + ')' : 'PASS'}`);
process.exit(fails ? 1 : 0);
