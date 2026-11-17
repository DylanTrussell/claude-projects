// v14.5 Grimtail fight gate. Run after `bash tools/assemble.sh`.
//   node tools/grimtail_check.mjs            checks + win rates for the shipped fight
//   GRIM_MOD=../public/_x.js node ...        same numbers for another build (before/after)
// Checks: the volley is six staggered rockets, rockets can be shot down (and
// pay), he squeaks on his speech beats and when he lands a hit, the old
// shield circle is gone, solo and co-op stay winnable on real lives.
import { C, CFG } from '../public/config.js';
import { IMG } from '../public/assets.js';

const MOD = process.env.GRIM_MOD || '../public/boss2.js';
const { ParleyBoss, parleyBot } = await import(MOD);
const DT = 1000 / 60;
let fails = 0;
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const realRandom = Math.random;
function seed(s) { let a = s >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// headless canvas that records big arcs (the old 190px shield ring)
let bigArcs = 0, ARC_AT = null;
const grad = { addColorStop() {} };
const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => grad : k === 'arc' ? (x, y, r) => { if (r >= 150 && ARC_AT && Math.hypot(x - ARC_AT.bx, y - ARC_AT.by) < 60) bigArcs++; } : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
for (const [k, [w, h]] of Object.entries({ charlie_ship: [214, 256], hero_us_up: [295, 300], chancellor_ship: [600, 430], grim_trophy_wall: [300, 300], grim_node_live: [60, 60], grim_node_dormant: [60, 60], grim_node_waking: [60, 60], grimtail_crawl: [300, 190] })) IMG[k] = { width: w, height: h };
const mk = (pid, lives) => ({ pid, st: 'alive', lives, hp: CFG.hpMax, deaths: 0 });

// a bot that plays like a decent person: works the nodes, sidesteps the laser
// line, runs for the gap in a barrage, otherwise stands and shoots rockets down
function dodgeBot(r, which = 1) {
  if (r.phase !== 'fight') return 0;
  const x = which === 2 ? r.c2.x + 35 : r.px;
  let tx = parleyBot(r) & C.R ? x + 40 : parleyBot(r) & C.L ? x - 40 : x;
  if (which === 2 && r.shieldUp) { const live = r.pylons.filter(p => p.alive); if (live.length) tx = r.bx + live[live.length - 1].dx; }
  const lt = r.tellT > 0 && r.tellKind === 'laser' ? r.tellTX : r.beam ? r.beam.x : null;
  if (lt !== null && Math.abs(lt - x) < 90) tx = x + (x < lt ? -120 : 120);
  if (r.atk && r.atk.k === 'barrage' && r.atk.holes) tx = r.atk.holes.reduce((a, h) => Math.abs(h - x) < Math.abs(a - x) ? h : a, r.atk.holes[0]);
  for (const b of r.bolts) if (b.k === 'bomb' && b.y > 300 && Math.abs(b.x + b.vx * 0.3 - x) < 90 && !(r.atk && r.atk.k === 'barrage')) tx = x + (b.x < x ? 130 : -130);
  let b = C.FIRE;
  if (x < tx - 8) b |= C.R; else if (x > tx + 8) b |= C.L;
  return b;
}

function run({ coop = false, lives = CFG.lives, bot = parleyBot, bot2 = null, cap = 240000 } = {}) {
  const r = new ParleyBoss(); const p1 = mk('p1', lives); const p2 = coop ? mk('p2', lives) : undefined;
  const evs = {}; let ms = 0, maxRockets = 0, rocketLaunchT = [], fr = 0;
  while (!r.done && ms < cap) {
    const b1 = bot(r, 1), b2 = p2 && p2.st !== 'out' ? (bot2 || bot)(r, 2) : 0;
    const nb = r.bolts.filter(b => b.k === 'missile').length;
    r.step(b1, DT, p1, b2, p2);
    for (const e of r.events) { evs[e.e] = (evs[e.e] || 0) + (e.e === 'squeak' ? 1 : 1); if (e.e === 'squeak') (evs.sq = evs.sq || []).push([Math.round(r.t), e.n]); }
    r.events.length = 0;
    const nb2 = r.bolts.filter(b => b.k === 'missile' && b.t <= DT + 0.01).length;
    for (let i = 0; i < nb2; i++) rocketLaunchT.push(r.t);
    maxRockets = Math.max(maxRockets, nb);
    if (fr % 5 === 0) { ARC_AT = r.won ? null : r; r.render(ctx, ms); ARC_AT = null; }
    ms += DT; fr++;
  }
  return { r, p1, p2, ms, evs, maxRockets, rocketLaunchT };
}

const isNew = !process.env.GRIM_MOD;
if (isNew) {
  console.log('=== mechanics ===');
  seed(7); bigArcs = 0;
  const a = run({ lives: 99 });
  ok(a.r.won, `beats him (99 lives, ${(a.ms / 1000).toFixed(1)}s)`);
  // volleys: launches cluster in groups of 6, ~185ms apart
  const T = a.rocketLaunchT; let groups = [], g = [];
  for (const t of T) { if (g.length && t - g[g.length - 1] > 600) { groups.push(g); g = []; } g.push(t); } if (g.length) groups.push(g);
  ok(groups.length > 0 && groups.every(x => x.length === 6), `every volley is 6 rockets (${groups.map(x => x.length).join(',')})`);
  const gaps = groups.flatMap(x => x.slice(1).map((t, i) => t - x[i]));
  ok(gaps.every(d => d > 140 && d < 230), `rockets staggered 150-220ms (${Math.min(...gaps).toFixed(0)}-${Math.max(...gaps).toFixed(0)}ms)`);
  ok(a.r.rocketsShot > 0, `rockets get shot down (${a.r.rocketsShot}/${a.r.rocketsFired}) and pay (${a.evs.fpsKill || 0} fpsKill events)`);
  ok((a.evs.fpsKill || 0) === a.r.rocketsShot, 'one payout per rocket shot');
  const sq = a.evs.sq || [];
  ok(sq.some(([t]) => t < 1000) && sq.some(([t]) => t > 2300 && t < 2600), `squeaks on the reveal and the laugh (${sq.length} squeak events)`);
  ok(sq.length >= 3, 'taunt squeaks during the fight');
  ok(bigArcs === 0, `no big circle drawn around the ship (${bigArcs})`);
  // shoot-down unit: park a rocket over the cat and fire
  const r = new ParleyBoss(); const p = mk('p1', 9);
  for (let i = 0; i < 400; i++) { r.step(0, DT, p); r.events.length = 0; }
  r.atkT = 1e9; r.bolts.length = 0;
  r.bolts.push({ k: 'missile', id: 1, x: r.px, y: 420, vx: 0, vy: 200, sp: 200, ang: Math.PI / 2, tx: r.px, t: 999, puffT: 0 });
  let shot = false;
  for (let i = 0; i < 30 && !shot; i++) { r.step(C.FIRE, DT, p); shot = r.rocketsShot === 1; r.events.length = 0; }
  ok(shot && p.hp === CFG.hpMax, 'a rocket over your head dies to your gun before it lands');
  // co-op: rockets go at both cats
  seed(11);
  const co = run({ coop: true, lives: 99 });
  ok(co.r.won, `co-op beats him (${(co.ms / 1000).toFixed(1)}s)`);
}

console.log(`=== win rates on real lives (${CFG.lives} lives, ${CFG.hpMax} hp), 40 seeds ===`);
for (const [name, opts] of [['naive solo (parleyBot, never dodges)', { bot: parleyBot }], ['dodger solo', { bot: dodgeBot }], ['dodger co-op', { coop: true, bot: dodgeBot }]]) {
  let wins = 0, tsum = 0, deaths = 0, shot = 0, fired = 0;
  for (let s = 1; s <= 40; s++) {
    seed(1000 + s);
    const x = run(opts);
    if (x.r.won) { wins++; tsum += x.ms; }
    deaths += x.p1.deaths + (x.p2 ? x.p2.deaths : 0);
    shot += x.r.rocketsShot || 0; fired += x.r.rocketsFired || 0;
  }
  console.log(`  ${name.padEnd(38)} win ${wins}/40  avg win time ${wins ? (tsum / wins / 1000).toFixed(1) : '-'}s  avg lives lost ${(deaths / 40).toFixed(1)}${fired ? `  rockets shot ${shot}/${fired}` : ''}`);
  if (isNew && name.startsWith('dodger')) ok(wins >= 36, `${name} winnable (${wins}/40)`);
}
Math.random = realRandom;
console.log(`\n${fails ? `RESULT: FAIL (${fails})` : 'RESULT: PASS'}`);
process.exit(fails ? 1 : 0);
