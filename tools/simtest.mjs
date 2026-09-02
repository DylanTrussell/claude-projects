// Headless full-playthrough: a bot fights east to the mothership and must win.
// Verifies director, waves, camera locks, invasion flip, boss phases, victory —
// and that the level is completable by construction (§7.1 parameter consistency).
import { makeGame, step, LEVEL, spawnTunnelSkirmish } from '../public/sim.js';
import { C, CFG } from '../public/config.js';
import { Tunnel, botPlan, botStep } from '../public/fps.js';
import { DoorGun, Skyraider, railBot } from '../public/rails.js';
// v11: PT-boat/surf/parley are now reachable — exercise them here the same
// way doorgun/skyraider already are, so this test actually covers the whole
// game end to end instead of stopping short of content that's live now.
import { PTBoat, Surf, boatBot } from '../public/boat.js';
import { ParleyBoss, parleyBot } from '../public/boss2.js';

const RAIL_CTOR = { skyraider: Skyraider, doorgun: DoorGun, ptboat: PTBoat, surf: Surf, parley: ParleyBoss };
const RAIL_BOT = { ptboat: boatBot, surf: boatBot, parley: parleyBot };
function runRail(kind, p, setup) {
  const rail = new (RAIL_CTOR[kind] || DoorGun)();
  if (setup) setup(rail);
  const bot = RAIL_BOT[kind] || railBot;
  const cap = kind === 'parley' ? 180000 : 90000; // parley has no built-in timer (super(999999), ends on win/death)
  let ms = 0, fr = 0;
  // Stop on death, not just on rail.done. RailBase.hurt() sets p.st = 'out'
  // when lives run out, and the outer sim loop then skips that player forever,
  // so no gameover ever fires -- with lives=9 this harness silently ground on
  // to the 10-minute cap instead of reporting anything, which hid exactly how
  // lethal the rail sections are. main.js handles this correctly; the harness
  // did not.
  while (!rail.done && !rail.dead && p.st !== 'out' && ms < cap) {
    rail.step(bot(rail, fr++), 1000 / 60, p);
    rail.events.length = 0;
    ms += 1000 / 60;
  }
  console.log(`RAIL ${kind}: done=${rail.done} kills=${rail.kills} dead=${!!rail.dead} in ${(ms / 1000).toFixed(1)}s`);
  if (!rail.done && !rail.dead && p.st !== 'out') { console.log('RESULT: FAIL — rail timeout'); process.exit(1); }
  return rail;
}

const seats = [{ pid: 'p1', hero: 'us' }];
const g = makeGame(1337, seats);
// v13.11 FORK 1: the player picks the Huey or the Skyraider after the truce and
// only plays one. The harness has to pick too, or the gate silently covers half
// the game. --branch=heli|sky; default heli, and gate.sh runs both.
const BRANCH = (process.argv.find(a => a.startsWith('--branch=')) || '--branch=heli').split('=')[1];
g.airPick = BRANCH === 'sky' ? 'sky' : 'heli';
// v13.11 FORK 2: --boat=ramp takes the wreck's fin into the jungle; --boat=around
// takes the open water and the surfboard. Both must be covered.
const BOAT = (process.argv.find(a => a.startsWith('--boat=')) || '--boat=around').split('=')[1];
console.log('branch:', g.airPick, '/ boat:', BOAT);
for (const p of g.players) p.lives = 99; // test-only endurance so we exercise ALL content

const seen = new Set();
let victory = false, gameover = false;
let simMs = 0;
const MAXMS = 10 * 60 * 1000;
let jumpT = 0;

while (simMs < MAXMS && !victory && !gameover) {
  const inputs = {};
  for (const p of g.players) {
    let bits = C.R | C.FIRE;
    if (g.boss && g.boss.st !== 'enter' && p.x > g.boss.x - 45) bits &= ~C.R; // park under the hovering hull
    if (g.airSupport === 'ready') bits |= C.CHEESE;   // call it in when pinned
    // aim up when a flyer is near — or when standing under the boss
    const flyer = g.enemies.find(e => e.st !== 'gone' && (e.k === 'heli' || e.k === 'ufo') &&
      Math.abs(e.x - p.x) < 160);
    if (flyer || (g.boss && Math.abs(g.boss.x - p.x) < 120)) bits |= C.UP;
    // jump over pits & traps ahead — TAP jump (edge-triggered), don't hold it
    const ahead = p.x + 90;
    // v13.3: a pit wider than one jump (228px) is crossed by hopping the
    // bobbing islands over it -- LEVEL.islands puts two across the 500px chasm
    // at 5100-5600. This bot did not know that: it took one leap at the lip and
    // fell in, over and over, until the run timed out with the camera still
    // locked behind an uncleared wave. That is why THE BUILD GATE ITSELF failed
    // 5 runs in 12 -- a flaky gate, not a flaky game. Over a wide pit, jump
    // again on every landing, because every landing is an island.
    const widePit = LEVEL.pits.find(([a, b]) => b - a > 240 && p.x > a - 50 && p.x < b);
    // p.onG is the sim's own "standing on something" flag. `y >= groundY` only
    // means "at ground LEVEL", which is false while you are on a floating
    // island -- so the bot climbed onto the first island over the chasm and
    // then never jumped off it again.
    const onGround = !!p.onG;
    const nearPit = LEVEL.pits.some(([a, b]) => ahead > a - 30 && p.x < b);
    const nearTrap = g.traps.some(t => t.armed && Math.abs(t.x - ahead) < 60);
    jumpT -= 16.67;
    const tap = (Math.floor(simMs / (1000 / 60)) % 22) < 8; // rhythmic taps create press edges
    // `tap` is the rhythmic on/off that creates the press EDGES the sim needs --
    // holding JUMP down is one jump, not many. Over a wide pit, tap while
    // GROUNDED (i.e. standing on an island) so each landing launches the next
    // hop; everywhere else, the original single-leap behaviour.
    const wantJump = widePit ? (onGround && tap) : ((nearPit || nearTrap || jumpT < -2400) && tap);
    if (wantJump) { bits |= C.JUMP; if (jumpT < -2400) jumpT = 0; }
    // grenades at the boss / heli
    if ((g.boss || flyer) && (simMs % 900) < 20) bits |= C.GREN;
    inputs[p.pid] = bits;
  }
  step(g, 1000 / 60, inputs);
  simMs += 1000 / 60;
  for (const ev of g.events.splice(0)) {
    if (ev.e === 'fps') { // run the first-person tunnel with the BFS autopilot
      const tun = new Tunnel(ev.map);
      const plan = botPlan(tun);
      const p = g.players[0];
      let ms = 0;
      while (!tun.done && ms < 180000) {
        tun.step(botStep(tun, plan), 1000 / 60, p);
        tun.events.length = 0;
        ms += 1000 / 60;
      }
      console.log(`${(simMs / 1000).toFixed(1)}s FPS map ${ev.map}: done=${tun.done} rescued=${tun.result.rescued} shotgun=${tun.result.shotgun} cleared=${tun.result.cleared} tunnelTime=${(ms / 1000).toFixed(1)}s`);
      if (!tun.done) { console.log('RESULT: FAIL — tunnel timeout'); process.exit(1); }
      if (ev.map === 0) { g.fps0 = 'done'; if (tun.result.rescued) { g.pows++; p.weap = 'gatling'; p.ammo = 200; } p.x = LEVEL.fpsDoors.main + 60; spawnTunnelSkirmish(g, p.x); }
      else { g.fps1 = 'done'; p.x = LEVEL.fpsDoors.nest + 60; }
      p.y = 100; p.invulnT = 2200; if (p.st !== 'out') p.st = 'alive';
      simMs += ms;
      continue;
    }
    if (ev.e === 'cutscene' && ev.which === 'truce') { // truce film -> the air fork
      // the truce cleanup belongs to the truce, not the door gun -- both
      // branches need the duel cat gone and the player back on his feet
      for (const e of g.enemies) if (e.duel) e.st = 'gone';
      { const p0 = g.players[0]; p0.invulnT = 2600; if (p0.st !== 'out') p0.st = 'alive'; }
      if (g.airPick === 'sky') continue;   // this branch flies the plane later instead
      const p = g.players[0];
      const r = runRail('doorgun', p);
      for (const e of g.enemies) if (e.duel) e.st = 'gone';
      p.invulnT = 2200; if (p.st !== 'out') p.st = 'alive';
      simMs += 52000;
    }
    if (ev.e === 'rail' && ev.k === 'skyraider') {
      const p = g.players[0];
      runRail('skyraider', p);
      p.invulnT = 2200; if (p.st !== 'out') p.st = 'alive';
      simMs += 52000;
    }
    if (ev.e === 'rail' && ev.k === 'ptboat') { // v11: mirrors main.js's rail-done chaining exactly
      const p = g.players[0];
      const r1 = runRail('ptboat', p, (rail) => { rail.botRoute = BOAT; });
      g.score += r1.kills * 100;
      console.log('  boat route taken:', r1.route);
      if (r1.route !== 'jungle') {
        const r2 = runRail('surf', p);
        g.score += r2.kills * 100;
      }   // the ramp path just skips the surf; it never moves him
      p.invulnT = 2200; if (p.st !== 'out') p.st = 'alive';
      g.heliEvac = { t: 2600 }; // washed up at the LZ — evac timer resumes under normal step()
      simMs += 54000 + 46000;
    }
    if (ev.e === 'rail' && ev.k === 'parley') {
      const p = g.players[0];
      const r = runRail('parley', p);
      g.score += r.kills * 100;
      if (r.dead) { g.over = true; gameover = true; }
      else { g.over = true; g.won = true; victory = true; }
      simMs += 30000; // rough — no fixed duration, see runRail's cap
    }
    if (['banner', 'cutscene', 'invasion', 'victory', 'gameover', 'evac', 'greenflash'].includes(ev.e)) {
      const key = ev.e + ':' + (ev.k || ev.which || '');
      if (!seen.has(key)) { seen.add(key); console.log((simMs / 1000).toFixed(1) + 's', key, 'x=' + Math.round(Math.max(...g.players.map(p => p.x)))); }
    }
    if (ev.e === 'banner' && (ev.k === 'outOfAmmo' || ev.k === 'duelJam' || ev.k === 'theyreOutToo'))
      console.log((simMs / 1000).toFixed(1) + 's DUEL BANNER:', ev.k);
    if (ev.e === 'victory') victory = true;
    if (ev.e === 'gameover') gameover = true;
  }
}

const maxX = Math.round(Math.max(...g.players.map(p => p.x)));
console.log('---');
console.log('simulated', (simMs / 1000).toFixed(0) + 's, maxX=' + maxX, 'cam=' + Math.round(g.cam), 'score=' + g.score, 'pows=' + g.pows, 'deaths=' + g.players.reduce((a, p) => a + p.deaths, 0));
console.log('waves done:', g.waves.filter(w => w.done).length + '/' + g.waves.length, 'camLock=' + Math.round(g.camLock));
// v13.9: prove the duel's dry-click was CAUSED. duelDry means the player shot
// the magazine empty; duelJam means they never fired and the gun jammed instead.
console.log('duel: standoff=' + !!g.standoff + ' invasion=' + !!g.invasion + ' ammoLeft=' + (g.duelAmmo === undefined ? 'n/a' : g.duelAmmo) + ' ranDry=' + !!g.duelDry + ' jammed=' + !!g.duelJam);
if (victory) console.log('RESULT: VICTORY — level completable end to end');
else {
  console.log('RESULT: FAIL — no victory. boss=', g.boss && { hp: g.boss.hp, st: g.boss.st }, 'bossDone=', g.bossDone);
  const pend = g.waves.filter(w => w.done && w.alive.length);
  for (const w of pend) console.log('stuck wave at', w.x, 'alive ids', w.alive, g.enemies.filter(e => w.alive.includes(e.id)).map(e => e.k + '@' + Math.round(e.x) + ',' + Math.round(e.y) + ' st=' + e.st + ' hp=' + e.hp));
  process.exit(1);
}

// standalone check: the optional rat nest (map 1) is completable too
{
  const tun = new Tunnel(1);
  const plan = botPlan(tun);
  const fake = { hp: CFG.hpMax, lives: 99, deaths: 0, st: 'alive' };
  let ms = 0;
  while (!tun.done && ms < 180000) { tun.step(botStep(tun, plan), 1000 / 60, fake); tun.events.length = 0; ms += 1000 / 60; }
  console.log(`NEST map1: done=${tun.done} cleared=${tun.result.cleared} loot=${tun.result.loot} in ${(ms / 1000).toFixed(1)}s`);
  if (!tun.done) { console.log('RESULT: FAIL — nest timeout'); process.exit(1); }
}
