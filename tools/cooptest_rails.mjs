// Headless co-op check for the two shared-vehicle rails (DoorGun, Skyraider).
// P2 (Charlie) gets a free-aimed second gun in each. This runs every section
// three ways -- solo, co-op from frame 0, P2 dropping in halfway -- plus a
// P2 out -> coopRevive cycle, and proves solo play is bit-identical to the
// last committed rails.js under a seeded RNG.
// Usage: bash tools/assemble.sh && node tools/cooptest_rails.mjs
import { execSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { C, CFG } from '../public/config.js';
import { IMG } from '../public/assets.js';
import { DoorGun, Skyraider, railBot } from '../public/rails.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = pathToFileURL(join(ROOT, 'public') + '/').href;
const DT = 1000 / 60, CAP = 120000;
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };

// ---- seeded Math.random so solo runs can be compared frame for frame
const realRandom = Math.random;
function seed(s) { let x = s >>> 0; Math.random = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }

// ---- stub canvas: every call is a no-op, gradients take colour stops
const grad = { addColorStop() {} };
const ctx = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
    if (k === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
// assets.tinted() builds an offscreen canvas for the hit flash
globalThis.document = globalThis.document || { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
// fake art so the sprite branches (huey, m60, skyraider) are exercised
for (const k of ['huey_doorgun', 'm60_doorgun', 'skyraider', 'alien_trooper', 'ufo_small']) IMG[k] = IMG[k] || { width: 120, height: 60 };
const drawRotor = () => {};

const mkP = (pid, hero) => ({ pid, hero, st: 'alive', lives: 99, hp: CFG.hpMax, deaths: 0 });

// P2 bot: steer the crosshair onto the nearest live foe ahead, lead it a
// little, hold FIRE.
function bot2(rail) {
  if (rail.p2x === undefined) return C.FIRE;
  let best = null, bd = 1e9;
  for (const f of rail.foes) {
    if (f.k === 'burst' || f.hp <= 0 || f.dying || f.x < 360 || f.x > 1260) continue;
    const d = Math.abs(f.x - rail.p2x) + Math.abs(f.y - rail.p2y);
    if (d < bd) { bd = d; best = f; }
  }
  let b = C.FIRE;
  if (!best) return b;
  const tx = best.x - 70, ty = best.y - (best.k === 'rat' ? 30 : 0);
  if (tx < rail.p2x - 10) b |= C.L; else if (tx > rail.p2x + 10) b |= C.R;
  if (ty < rail.p2y - 10) b |= C.UP; else if (ty > rail.p2y + 10) b |= C.DOWN;
  return b;
}

// one full section. mode: 'solo' | 'coop' | 'join' | 'revive'
// bot1: railBot from the SAME module as Ctor (it tests `instanceof Skyraider`)
function run(Ctor, mode, s, joinAtMs = 0, bot1 = railBot) {
  seed(s);
  const rail = new Ctor();
  const p = mkP('p1', 'us');
  let p2 = mode === 'coop' || mode === 'revive' ? mkP('p2', 'vc') : undefined;
  let fr = 0, ms = 0, err = null, renders = 0, p2Draws = 0, evCount = 0;
  const trace = [];
  const orig = rail.drawP2Gun ? rail.drawP2Gun.bind(rail) : null;
  if (orig) rail.drawP2Gun = (c, n) => { p2Draws++; orig(c, n); };
  const rv = { outShots: -1, outDraws: -1, killsAtRevive: 0, killsAfter: 0 };
  let joinedAt = -1;
  try {
    while (!rail.done && !rail.dead && p.st !== 'out' && ms < CAP) {
      // drop in halfway through the section's timer
      if (mode === 'join' && !p2 && ms >= joinAtMs) {
        p2 = mkP('p2', 'vc'); rail.coopJoin(p2); joinedAt = rail.t;
      }
      // revive cycle: P2 goes out at 8s for 4s, then is brought back
      if (mode === 'revive') {
        if (fr === 480) { p2.st = 'out'; p2.lives = 0; rv.shots0 = rail.shots.filter(x => x.p2).length; rv.draws0 = p2Draws; }
        if (fr === 600) { rv.outShots = rail.shots.filter(x => x.p2).length; rv.outDraws = p2Draws - rv.draws0; rv.outFireT = rail.p2FireT; }
        if (fr === 720) { rail.coopRevive(p2); rv.killsAtRevive = rail.kills2 || 0; rv.drawsAtRevive = p2Draws; }
      }
      const b1 = bot1(rail, fr);
      const b2 = p2 ? bot2(rail) : 0;
      rail._p2 = p2;
      if (mode === 'solo') rail.step(b1, DT, p);
      else rail.step(b1, DT, p, b2, p2);
      if (fr % 7 === 0) {
        if (rail instanceof DoorGun) rail.render(ctx, ms, drawRotor); else rail.render(ctx, ms);
        renders++;
      }
      evCount += rail.events.length; rail.events.length = 0;
      if (fr % 30 === 0) trace.push(`${fr}:${rail.kills}:${p.hp}:${p.lives}:${rail.foes.length}:${rail.shots.length}:${(rail.hy || rail.py).toFixed(3)}`);
      ms += DT; fr++;
    }
  } catch (e) { err = e; }
  if (mode === 'revive') { rv.killsAfter = (rail.kills2 || 0) - rv.killsAtRevive; rv.drawsAfter = p2Draws - rv.drawsAtRevive; }
  Math.random = realRandom;
  return { rail, p, p2, err, ms, renders, p2Draws, evCount, joinedAt, rv,
    digest: `${rail.done}|${rail.kills}|${p.hp}|${p.lives}|${fr}|${evCount}|${trace.join(',')}` };
}

// ---- baseline: the committed rails.js, imported against the same public/ modules
const head = execSync('git show HEAD:game/rails.js', { cwd: ROOT, encoding: 'utf8' })
  .replace(/from '\.\/([a-z0-9_]+\.js)'/g, (_, f) => `from '${PUB}${f}'`);
const bdir = mkdtempSync(join(tmpdir(), 'am-rails-base-'));
writeFileSync(join(bdir, 'rails_head.mjs'), head);
const BASE = await import(pathToFileURL(join(bdir, 'rails_head.mjs')).href);

const SEEDS = [1337, 4242, 90210];
for (const [name, Ctor, BaseCtor] of [['DoorGun', DoorGun, BASE.DoorGun], ['Skyraider', Skyraider, BASE.Skyraider]]) {
  console.log(`\n== ${name} ==`);
  for (const s of SEEDS) {
    const solo = run(Ctor, 'solo', s);
    const base = run(BaseCtor, 'solo', s, 0, BASE.railBot);
    ok(!solo.err, `${name} solo seed ${s}: no exception${solo.err ? ' -> ' + solo.err.stack : ''}`);
    ok(solo.rail.done, `${name} solo seed ${s}: done in ${(solo.ms / 1000).toFixed(1)}s, kills ${solo.rail.kills}`);
    ok(solo.digest === base.digest, `${name} solo seed ${s}: identical to committed rails.js (kills ${solo.rail.kills} vs ${base.rail.kills}, ${solo.evCount} vs ${base.evCount} events)`);
    ok(solo.p2Draws === 0 && solo.rail.p2x === undefined && !solo.rail.shots.some(x => x.p2), `${name} solo seed ${s}: no P2 gun, marker or shots`);
  }
  const s = SEEDS[0];
  const solo = run(Ctor, 'solo', s);
  const coop = run(Ctor, 'coop', s);
  ok(!coop.err, `${name} co-op: no exception${coop.err ? ' -> ' + coop.err.stack : ''}`);
  ok(coop.rail.done, `${name} co-op: done in ${(coop.ms / 1000).toFixed(1)}s (solo ${(solo.ms / 1000).toFixed(1)}s)`);
  ok((coop.rail.kills2 || 0) > 0, `${name} co-op: P2 kills ${coop.rail.kills2 || 0} of ${coop.rail.kills} total (solo ${solo.rail.kills})`);
  ok(coop.p2Draws > 0, `${name} co-op: P2 gun + crosshair drawn on ${coop.p2Draws}/${coop.renders} rendered frames`);
  const join = run(Ctor, 'join', s, solo.ms / 2);
  ok(!join.err, `${name} join halfway: no exception${join.err ? ' -> ' + join.err.stack : ''}`);
  ok(join.joinedAt > 0, `${name} join halfway: P2 joined at ${(join.joinedAt / 1000).toFixed(1)}s of a ${(solo.ms / 1000).toFixed(1)}s solo run`);
  ok(join.rail.done, `${name} join halfway: done in ${(join.ms / 1000).toFixed(1)}s`);
  ok((join.rail.kills2 || 0) > 0, `${name} join halfway: P2 kills ${join.rail.kills2 || 0} of ${join.rail.kills}`);
  const rev = run(Ctor, 'revive', s);
  ok(!rev.err, `${name} revive: no exception${rev.err ? ' -> ' + rev.err.stack : ''}`);
  ok(rev.rv.outShots === 0 && rev.rv.outDraws === 0, `${name} revive: while P2 out, gun silent (${rev.rv.outShots} P2 rounds alive) and hidden (${rev.rv.outDraws} draws)`);
  ok(rev.p2.st === 'alive' && rev.rv.killsAfter > 0 && rev.rv.drawsAfter > 0, `${name} revive: back after coopRevive, ${rev.rv.killsAfter} more P2 kills, drawn ${rev.rv.drawsAfter} frames`);
  ok(rev.rail.done, `${name} revive: done in ${(rev.ms / 1000).toFixed(1)}s`);
}

console.log(`\nRESULT: ${fails ? 'FAIL (' + fails + ')' : 'PASS'}`);
process.exit(fails ? 1 : 0);
