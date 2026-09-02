// Headless play harness for BALANCE testing, built on simtest's proven loop.
//
// simtest answers one question -- "is the level completable?" -- with a bot
// that holds RIGHT and FIRE and 99 lives. That is a build gate, not a playtest.
// This runs the same sequence at a chosen SKILL LEVEL with the REAL life count,
// and reports where a player of that skill actually dies and how long each
// section takes them. A section that is fine for an expert and a meat grinder
// for a novice shows up as two very different reports off one build.
//
//   node tools/playtest.mjs --skill=novice
//   node tools/playtest.mjs --skill=expert --seed=99
//
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

const argOf = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
// dodge: how often the player reacts to an incoming threat at all
// jumpMiss: how often a jump that was needed gets fluffed
// idle: fraction of frames spent hesitating instead of advancing
// fire: trigger discipline
const SKILLS = {
  novice: { dodge: 0.10, jumpMiss: 0.40, idle: 0.30, fire: 0.55 },
  casual: { dodge: 0.35, jumpMiss: 0.18, idle: 0.15, fire: 0.75 },
  good:   { dodge: 0.65, jumpMiss: 0.07, idle: 0.05, fire: 0.92 },
  expert: { dodge: 0.90, jumpMiss: 0.02, idle: 0.01, fire: 0.99 },
};
const SKILL_NAME = argOf('skill', 'casual');
const S = SKILLS[SKILL_NAME];
if (!S) { console.error(`unknown skill "${SKILL_NAME}" (${Object.keys(SKILLS).join(', ')})`); process.exit(2); }
let _seed = ((+argOf('seed', 7)) >>> 0) || 7;
const rnd = () => (_seed = (_seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const SECTIONS = [];
const noteSection = (name, o) => SECTIONS.push(Object.assign({ name }, o));

const RAIL_CTOR = { skyraider: Skyraider, doorgun: DoorGun, ptboat: PTBoat, surf: Surf, parley: ParleyBoss };
const RAIL_BOT = { ptboat: boatBot, surf: boatBot, parley: parleyBot };
function runRail(kind, p, setup) {
  const rail = new (RAIL_CTOR[kind] || DoorGun)();
  if (setup) setup(rail);
  const bot = RAIL_BOT[kind] || railBot;
  const cap = kind === 'parley' ? 180000 : 90000; // parley has no built-in timer (super(999999), ends on win/death)
  let ms = 0, fr = 0; const _d0 = p.deaths;
  // Stop on death, not just on rail.done. RailBase.hurt() sets p.st = 'out'
  // when lives run out, and the outer sim loop then skips that player forever,
  // so no gameover ever fires -- with lives=9 this harness silently ground on
  // to the 10-minute cap instead of reporting anything, which hid exactly how
  // lethal the rail sections are. main.js handles this correctly; the harness
  // did not.
  while (!rail.done && !rail.dead && p.st !== 'out' && ms < cap) {
    let rbits = bot(rail, fr++);
    if (rnd() > S.fire) rbits &= ~C.FIRE;                 // imperfect trigger
    if (rnd() > S.dodge) rbits &= ~(C.UP | C.DOWN);       // late or no reaction
    rail.step(rbits, 1000 / 60, p);
    rail.events.length = 0;
    ms += 1000 / 60;
  }
  noteSection(kind, { seconds: +(ms / 1000).toFixed(1), kills: rail.kills, deaths: p.deaths - _d0,
    tier: rail.tier, pips: rail.pips, timedOut: !rail.done && !rail.dead && p.st !== 'out' });
  console.log(`RAIL ${kind}: done=${rail.done} kills=${rail.kills} deaths=${p.deaths - _d0} dead=${!!rail.dead} in ${(ms / 1000).toFixed(1)}s`);
  if (!rail.done && !rail.dead && p.st !== 'out') { console.log('RESULT: FAIL — rail timeout'); process.exit(1); }
  return rail;
}

const seats = [{ pid: 'p1', hero: 'us' }];
const g = makeGame(1337, seats);
// v13.11: --branch=heli|sky picks the air fork. Default heli.
g.airPick = (process.argv.find(a => a.startsWith('--branch=')) || '--branch=heli').split('=')[1] === 'sky' ? 'sky' : 'heli';
const BOAT = (process.argv.find(a => a.startsWith('--boat=')) || '--boat=around').split('=')[1];
// The REAL life count. simtest forces 99 so it can exercise every section even
// when the bot is bad; a playtest that does that cannot tell you anything about
// difficulty, which is the entire question here.
const START_LIVES = g.players[0].lives;

const seen = new Set();
let victory = false, gameover = false;
let simMs = 0;
const MAXMS = 10 * 60 * 1000;
let jumpT = 0;
let jumpedPit = null, jumpHeld = 0;

while (simMs < MAXMS && !victory && !gameover) {
  const inputs = {};
  for (const p of g.players) {
    let bits = C.R;
    if (rnd() < S.fire) bits |= C.FIRE;
    // Hesitation applies on the GROUND only. Dropping RIGHT mid-jump cut the
    // arc short and dumped the bot into pits -- with idle 0.01 across ~50
    // airborne frames that still fires 39% of the time, which is why EXPERT
    // was falling into a pit that NOVICE cleared. Nobody hesitates in mid-air.
    const airborne = p.y < CFG.groundY - 2;
    if (!airborne && rnd() < S.idle) bits &= ~C.R;         // hesitates, backtracks
    if (g.boss && g.boss.st !== 'enter' && p.x > g.boss.x - 45) bits &= ~C.R; // park under the hovering hull
    if (g.airSupport === 'ready') bits |= C.CHEESE;   // call it in when pinned
    // aim up when a flyer is near — or when standing under the boss
    const flyer = g.enemies.find(e => e.st !== 'gone' && (e.k === 'heli' || e.k === 'ufo') &&
      Math.abs(e.x - p.x) < 160);
    if (flyer || (g.boss && Math.abs(g.boss.x - p.x) < 120)) bits |= C.UP;
    // jump over pits & traps ahead — TAP jump (edge-triggered), don't hold it
    const ahead = p.x + 90;
    // Pit jumping has to be DETERMINISTIC in the proxy, or the measurement is
    // meaningless. Two artefacts bit here already: a window that opened 120px
    // early made the bot jump into the hole from a set-back respawn, and then
    // gating the jump on a rhythmic `tap` pattern meant a bot running at
    // constant speed could phase-miss every tap frame in the window -- which
    // made EXPERT die at a pit that NOVICE cleared, purely because hesitation
    // re-phased it. Now each pit gets exactly one committed press edge, fired
    // 40px before its lip, tracked so it cannot re-fire mid-flight.
    const grounded = !!p.onG;   // sim's own grounded flag; y>=groundY is false on an island
    // A pit wider than a jump (228px) is crossed by hopping the bobbing
    // islands over it, not by one leap -- LEVEL.islands puts two across the
    // 500px chasm at 5100-5600. Without knowing that, the proxy took one jump
    // at the lip and fell in EVERY time: 43 of 43 expert pit deaths were that
    // one hole, which read as a game bug and is not. Over a wide pit, jump
    // again each time we are back on solid footing (an island).
    const wide = LEVEL.pits.find(([a, b]) => b - a > 240 && p.x > a - 46 && p.x < b);
    const pit = wide || LEVEL.pits.find(([a, b]) => p.x > a - 46 && p.x < b);
    // A pit approach SUPPRESSES the idle boredom-jump. Otherwise a boredom jump
    // could fire just before the lip, leaving the bot airborne when the pit
    // window opened, so its one committed jump was swallowed and it walked off
    // the edge -- which is what kept killing the high-skill bots at a pit the
    // isolation test clears from every start position and every jump timing.
    const pitSoon = LEVEL.pits.some(([a]) => p.x > a - 220 && p.x < a);
    let wantJump = false;
    if (pit && grounded) {
      // over a wide pit every landing is an island, so re-arm on each landing
      const key = wide ? pit[0] + '@' + Math.round(p.x / 40) : pit[0];
      if (jumpedPit !== key) { jumpedPit = key; wantJump = rnd() > S.jumpMiss; jumpHeld = 0; }
    } else if (!pit && grounded) jumpedPit = null;
    const nearTrap = g.traps.some(t => t.armed && Math.abs(t.x - ahead) < 60);
    jumpT -= 16.67;
    const tap = (Math.floor(simMs / (1000 / 60)) % 22) < 8; // rhythmic taps create press edges
    if (wantJump && jumpHeld < 6) { bits |= C.JUMP; jumpHeld++; }
    if (!pitSoon && (nearTrap || jumpT < -2400) && tap && rnd() > S.jumpMiss) { bits |= C.JUMP; if (jumpT < -2400) jumpT = 0; }
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
        let tbits = botStep(tun, plan);
        if (rnd() < S.idle) tbits = 0;                    // hesitation / getting lost
        tun.step(tbits, 1000 / 60, p);
        tun.events.length = 0;
        ms += 1000 / 60;
      }
      noteSection('tunnel' + ev.map, { seconds: +(ms / 1000).toFixed(1), rescued: tun.result.rescued,
        secrets: tun.result.secrets, seen: tun.seen ? tun.seen.size : 0,
        cells: tun.grid.length * tun.grid[0].length, timedOut: !tun.done });
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
      const r2 = r1.route === 'jungle' ? { kills: 0 } : runRail('surf', p);
      g.score += r2.kills * 100;
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
    if (ev.e === 'victory') victory = true;
    if (ev.e === 'gameover') gameover = true;
  }
}

const maxX = Math.round(Math.max(...g.players.map(p => p.x)));
console.log('---');
console.log('simulated', (simMs / 1000).toFixed(0) + 's, maxX=' + maxX, 'cam=' + Math.round(g.cam), 'score=' + g.score, 'pows=' + g.pows, 'deaths=' + g.players.reduce((a, p) => a + p.deaths, 0));
console.log('waves done:', g.waves.filter(w => w.done).length + '/' + g.waves.length, 'camLock=' + Math.round(g.camLock));
if (victory) console.log('RESULT: VICTORY — level completable end to end');
else {
  console.log('RESULT: ' + (g.players[0].st === 'out' ? 'GAME OVER — ran out of lives' : 'DID NOT FINISH'));
  const pend = g.waves.filter(w => w.done && w.alive.length);
  for (const w of pend) console.log('stuck wave at', w.x, 'alive ids', w.alive);
}


// ---- playtest summary ----
console.log(`\n=== ${SKILL_NAME.toUpperCase()} (seed ${argOf('seed', 7)}) -> ${victory ? 'VICTORY' : (g.players[0].st === 'out' ? 'GAME OVER' : 'UNFINISHED')} ===`);
console.log(`lives used ${START_LIVES - g.players[0].lives}/${START_LIVES}   deaths ${g.players[0].deaths}   score ${g.score}   reached ${Math.round(g.cam)}/${CFG.worldLen}`);
console.log('\nsection                time   deaths  detail');
for (const sec of SECTIONS) {
  const detail = [sec.kills !== undefined ? 'kills ' + sec.kills : null,
                  sec.rescued !== undefined ? 'rescued ' + sec.rescued : null,
                  sec.seen !== undefined ? `explored ${sec.seen}/${sec.cells}` : null,
                  sec.tier !== undefined ? `finished tier ${sec.tier}, ${sec.pips} pips` : null,
                  sec.timedOut ? 'TIMED OUT' : null].filter(Boolean).join('  ');
  console.log('  ' + sec.name.padEnd(20) + String(sec.seconds).padStart(6) + 's' + String(sec.deaths ?? '-').padStart(8) + '   ' + detail);
}
const worst = SECTIONS.filter(x => x.deaths > 0).sort((a, b) => b.deaths - a.deaths);
console.log('\ndeadliest: ' + (worst.length ? worst.map(x => `${x.name} (${x.deaths})`).join(', ') : 'nothing killed this player'));
if (!victory) process.exitCode = 0;   // losing is a finding here, not a build failure
