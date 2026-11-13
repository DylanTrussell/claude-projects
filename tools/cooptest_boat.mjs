// v14.3 couch co-op gate for the PT boat, the surf-out and the Grimtail fight.
// Run after `bash tools/assemble.sh` (imports ../public/). Scenarios per section:
//   solo         bit-for-bit identical to the pre-co-op code (seeded RNG, same inputs)
//   coop         P2 present from frame 0, a bot drives both, P2 must land hits/kills
//   join         P2 drops in halfway through (rail.coopJoin)
//   revive       P2 runs out of lives, leaves the section, comes back via coopRevive
// plus unit checks: both-out = dead, P1-out keeps the section alive, boat helm swap.
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { C, CFG } from '../public/config.js';
import { IMG } from '../public/assets.js';
import { PTBoat, Surf, boatBot } from '../public/boat.js';
import { ParleyBoss, parleyBot } from '../public/boss2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1000 / 60;
let fails = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };

// ---- seeded Math.random so solo can be compared against the original code ----
const realRandom = Math.random;
function seed(s) {
  let a = s >>> 0;
  Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- headless canvas so every render() path runs too ----
const grad = { addColorStop() {} };
const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => grad : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
const fakeImgs = { charlie_tank: [560, 414], charlie_surf: [420, 296], charlie_ship: [214, 256], surf_hero: [300, 300], wep_gatling: [200, 80], ptboat_vehicle: [400, 150], hero_us_up: [295, 300], chancellor_ship: [600, 430], grim_trophy_wall: [300, 300], grim_node_live: [60, 60], grim_node_dormant: [60, 60], grimtail_crawl: [300, 190], river_mine: [46, 46], rat_gunboat: [120, 76], alien_raider_boat: [120, 76], rat_diver: [60, 58], rat_shark: [90, 60], boss_ship_1: [300, 118], alien_scanship: [380, 190] };
for (const [k, [w, h]] of Object.entries(fakeImgs)) IMG[k] = { width: w, height: h };

const mk = (pid, hero, lives = 99) => ({ pid, hero, st: 'alive', lives, hp: CFG.hpMax, deaths: 0 });

// ---- P2 bots: each aims at real targets with the controls a person would use ----
function boatBot2(rail) {
  if (!rail.c2) return C.FIRE;
  const m = rail.p2Muzzle();
  const tg = [...rail.foes.filter(f => f.k !== 'diver' || f.up), ...rail.mines].filter(f => f.x > m.x + 60 && f.x < 1260)
    .sort((a, b) => a.x - b.x)[0];
  let b = C.FIRE;
  if (tg) {
    const want = Math.max(-0.75, Math.min(0.5, Math.atan2(tg.y - m.y, tg.x - m.x)));
    if (rail.c2.aim > want + 0.04) b |= C.UP; else if (rail.c2.aim < want - 0.04) b |= C.DOWN;
  }
  return b;
}
function surfBot2(rail) {
  const c = rail.c2; if (!c) return C.FIRE;
  let b = C.FIRE;
  const tg = rail.foes.filter(f => f.x > c.x + 80 && (f.k !== 'diver' || f.up)).sort((a, b2) => a.x - b2.x)[0];
  if (tg) { if (c.y > tg.y + 10) b |= C.UP; else if (c.y < tg.y - 10) b |= C.DOWN; }
  const inbound = rail.shots.some(s => s.foe && s.x > c.x && s.x - c.x < 110 && Math.abs(s.y - c.y) < 50);
  const ram = rail.foes.some(f => f.x > c.x && f.x - c.x < 120 && Math.abs(f.y - c.y) < 56);
  if ((inbound || ram) && c.diveCd <= 0) b |= C.GREN;
  return b;
}
function parleyBot2(rail) {
  if (rail.phase !== 'fight' || !rail.c2) return 0;
  let b = C.FIRE, tx = rail.bx;
  if (rail.shieldUp) {          // take the LAST live pylon so the two cats split the work
    const live = rail.pylons.filter(py => py.alive);
    if (live.length) tx = rail.bx + live[live.length - 1].dx;
  }
  tx -= 35;                     // his muzzle sits 35px right of his body
  if (rail.c2.x < tx - 8) b |= C.R; else if (rail.c2.x > tx + 8) b |= C.L;
  return b;
}

const SECTIONS = {
  ptboat: { Ctor: PTBoat, bot1: boatBot, bot2: boatBot2, cap: 90000 },
  surf: { Ctor: Surf, bot1: boatBot, bot2: surfBot2, cap: 90000 },
  parley: { Ctor: ParleyBoss, bot1: parleyBot, bot2: parleyBot2, cap: 180000 },
};

// generic runner; hooks({rail, fr, p1, p2}) may return a new p2 (join) or mutate state
function run(kind, { Ctor, coop, joinAt, hook, rec } = {}) {
  const S = SECTIONS[kind];
  const rail = new (Ctor || S.Ctor)();
  const p1 = mk('p1', 'us');
  let p2 = coop ? mk('p2', 'vc') : undefined;
  let fr = 0, ms = 0, renderErr = null;
  while (!rail.done && !rail.dead && ms < S.cap) {
    if (joinAt && !p2 && joinAt(rail)) { p2 = mk('p2', 'vc'); rail.coopJoin(p2); }
    if (hook) { const r = hook({ rail, fr, p1, p2 }); if (r && r.p2 !== undefined) p2 = r.p2; }
    const b1 = S.bot1(rail, fr);
    const b2 = p2 && p2.st !== 'out' ? S.bot2(rail, fr) : 0;
    rail.step(b1, DT, p1, b2, p2);
    rail.events.length = 0;
    if (fr % 7 === 0) { try { rail.render(ctx, ms); } catch (e) { renderErr = renderErr || e; } }
    if (rec) rec.push(`${fr}|${rail.t.toFixed(3)}|${rail.kills}|${p1.hp}|${p1.lives}|${rail.py ?? ''}|${rail.px ?? ''}|${rail.bossHp ?? ''}|${rail.foes.length}|${rail.shots.length}|${!!rail.done}`);
    fr++; ms += DT;
  }
  return { rail, p1, p2, ms, renderErr };
}
const line = (kind, tag, r) => console.log(`${kind.padEnd(6)} ${tag.padEnd(7)} done=${r.rail.done} dead=${!!r.rail.dead} t=${(r.ms / 1000).toFixed(1)}s kills=${r.rail.kills} p2Kills=${r.rail.p2Kills || 0} p2Hits=${r.rail.p2Hits || 0} p1 lives=${r.p1.lives} deaths=${r.p1.deaths}${r.p2 ? ` | p2 lives=${r.p2.lives} deaths=${r.p2.deaths} st=${r.p2.st}` : ''}${kind === 'parley' ? ` bossHp=${r.rail.bossHp} won=${!!r.rail.won}` : ''}`);

// ---- original (pre-co-op) modules, for the solo-unchanged check ----
for (const f of ['boat.js', 'boss2.js']) {
  const src = execSync(`git -C "${ROOT}" show HEAD:game/${f}`).toString();
  writeFileSync(path.join(ROOT, 'public', `_orig_${f}`), src);
}
const ORIG = {
  ptboat: (await import('../public/_orig_boat.js')).PTBoat,
  surf: (await import('../public/_orig_boat.js')).Surf,
  parley: (await import('../public/_orig_boss2.js')).ParleyBoss,
};

for (const kind of ['ptboat', 'surf', 'parley']) {
  console.log(`\n=== ${kind} ===`);
  // 1. solo, and solo against the original code with the same seed and inputs
  const recNew = [], recOld = [];
  seed(4242); const solo = run(kind, { rec: recNew });
  seed(4242); const orig = run(kind, { Ctor: ORIG[kind], rec: recOld });
  Math.random = realRandom;
  line(kind, 'solo', solo);
  ok(!solo.renderErr, `solo renders without exceptions${solo.renderErr ? ': ' + solo.renderErr.stack : ''}`);
  ok(solo.rail.done && !solo.rail.dead, 'solo finishes');
  let diverge = -1;
  for (let i = 0; i < Math.max(recNew.length, recOld.length); i++) if (recNew[i] !== recOld[i]) { diverge = i; break; }
  ok(diverge < 0, `solo is frame-for-frame identical to the original code (${recNew.length} frames)${diverge >= 0 ? ` -- diverges at frame ${diverge}: new ${recNew[diverge]} / old ${recOld[diverge]}` : ''}`);

  // 2. co-op from the start
  const co = run(kind, { coop: true });
  line(kind, 'coop', co);
  ok(!co.renderErr, `co-op renders without exceptions${co.renderErr ? ': ' + co.renderErr.stack : ''}`);
  ok(co.rail.done && !co.rail.dead, 'co-op finishes');
  ok((co.rail.p2Hits || 0) > 0, `P2 lands hits (${co.rail.p2Hits || 0})`);
  if (kind !== 'parley') ok((co.rail.p2Kills || 0) > 0, `P2 lands kills (${co.rail.p2Kills || 0})`);
  else ok(co.rail.won, 'Grimtail beaten in co-op');
  if (kind === 'parley') ok(solo.rail.won, 'Grimtail beaten solo');

  // 3. P2 joins halfway
  const half = kind === 'parley' ? (r) => r.phase === 'fight' && r.pylons.filter(p => p.alive).length <= 2 : (r) => r.t > r.dur / 2;
  const jn = run(kind, { joinAt: half });
  line(kind, 'join', jn);
  ok(!jn.renderErr, `join renders without exceptions${jn.renderErr ? ': ' + jn.renderErr.stack : ''}`);
  ok(jn.p2 && jn.rail.done && !jn.rail.dead, 'P2 joined mid-section and the section finishes');
  ok((jn.rail.p2Hits || 0) > 0, `late P2 lands hits (${jn.rail.p2Hits || 0})`);

  // 4. P2 out, then revived
  let outAt = -1, revAt = -1, hitsAtOut = 0, shotsWhileOut = 0, hitOnOut = false;
  const rv = run(kind, {
    coop: true,
    hook: ({ rail, fr, p2 }) => {
      if (outAt < 0 && fr === 240) {
        if (kind === 'ptboat') { p2.lives = 0; p2.st = 'out'; }      // pooled hull: the pool just ran out on his side
        else { p2.lives = 1; p2.hp = 1; rail.c2.hurtT = 0; rail.hurt(p2, 1); }
        if (p2.st === 'out') { outAt = fr; hitsAtOut = rail.p2Hits || 0; for (const s of rail.shots) s._seen = 1; }
      }
      if (outAt >= 0 && revAt < 0) {
        shotsWhileOut += rail.shots.filter(s => s.p2 && !s._seen && (s._seen = 1)).length;
        if (kind !== 'ptboat') { const hp0 = p2.hp; rail.c2.hurtT = 0; rail.hurt(p2, 1); if (p2.hp !== hp0) hitOnOut = true; }
        if (fr === outAt + 180) { rail.coopRevive(p2); revAt = fr; }
      }
    },
  });
  line(kind, 'revive', rv);
  ok(outAt >= 0, `P2 went out (frame ${outAt})`);
  ok(!rv.rail.dead, 'section not failed while P1 still alive');
  ok(!hitOnOut, 'an out P2 cannot be hit');
  ok(shotsWhileOut === 0, `an out P2 fires no new rounds (${shotsWhileOut})`);
  ok(revAt >= 0 && rv.p2.st === 'alive', 'coopRevive brings P2 back');
  ok((rv.rail.p2Hits || 0) > hitsAtOut, `revived P2 lands hits again (${hitsAtOut} -> ${rv.rail.p2Hits || 0})`);
  ok(rv.rail.done && !rv.rail.dead, 'revive run finishes');

  // 5. unit: separate bodies fail only when BOTH are out; P1 out keeps it going
  if (kind !== 'ptboat') {
    const r = new SECTIONS[kind].Ctor(); const a = mk('p1', 'us', 1), b = mk('p2', 'vc', 1);
    r.coopJoin(b); r.step(0, DT, a, 0, b);
    a.hp = 1; r.hurtT = 0; r.hurt(a, 1);
    ok(a.st === 'out' && !r.dead && !r.done, 'P1 out, P2 alive: the section keeps going');
    for (let i = 0; i < 30; i++) r.step(0, DT, a, C.FIRE | (kind === 'parley' ? 0 : C.UP), b);
    b.hp = 1; r.c2.hurtT = 0; r.hurt(b, 1);
    ok(b.st === 'out' && r.dead && r.done, 'both out: dead');
  } else {
    const r = new PTBoat(); const a = mk('p1', 'us', 0), b = mk('p2', 'vc', 3);
    a.st = 'out'; r.coopJoin(b);
    const y0 = r.py; for (let i = 0; i < 30; i++) r.step(C.DOWN, DT, a, C.UP, b);
    ok(r.py < y0 - 50, `P1 out: P2 takes the helm (py ${y0} -> ${r.py.toFixed(0)})`);
    a.hp = 1; r.hurtT = 0; b.lives = 1; r.hurt(a, 5);
    ok(b.st === 'out' && r.dead, 'pooled hull: both out = dead');
  }
}

for (const f of ['boat.js', 'boss2.js']) { try { unlinkSync(path.join(ROOT, 'public', `_orig_${f}`)); } catch (_) {} }
console.log(`\n${fails ? `RESULT: FAIL (${fails})` : 'RESULT: PASS'}`);
process.exit(fails ? 1 : 0);
