// Headless co-op run of every Part Two mission: two cats, both bot-driven.
// Cases per mission: co-op from the drop, P2 dropping in halfway, P2 running
// out of lives and being revived, and P1 running out with Charlie finishing.
import { Mission, MISSIONS, missionBot } from '../public/missions.js';
import { CFG, C } from '../public/config.js';

const DT = 1000 / 60;
const pl = (lives) => ({ hp: CFG.hpMax, lives, deaths: 0, st: 'alive' });
// the shared bot reads m.h; hand it a view where "the hero" is Charlie
const as2 = (m) => { const v = Object.create(m); Object.defineProperty(v, 'h', { value: m.h2 }); return v; };
// P2 plays like a person on the couch: shares the push right, but turns round
// to deal with anything left alive behind the pair (the solo AI Charlie did this)
function bot2(m, fr) {
  let b = missionBot(as2(m), fr);
  const h = m.h2; if (!h || m.boss || m.phase !== 'play') return b;
  let behind = null;
  for (const e of m.en) if (e.st === 'live' && !e.rise && e.x < h.x - 40 && e.x > m.cam) { if (!behind || e.x > behind.x) behind = e; }
  const ahead = m.en.some(e => e.st === 'live' && !e.rise && e.x >= h.x - 40 && e.x < m.cam + 1280);
  if (behind && !ahead) { b = (b & ~C.R) | C.FIRE; if (h.face > 0 || fr % 30 < 4) b |= C.L; }
  return b;
}
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail++; };

function run(id, route, mode) {
  const m = new Mission(id, { via: id === 'graveyard' ? null : route }); m.botRoute = route;
  const p1 = pl(99), p2 = pl(99);
  let ms = 0, fr = 0, joined = mode !== 'join', shots2 = 0, revived = false, p2wasOut = false, p1out = false;
  while (!m.done && ms < 480000) {
    if (!joined && ms > 40000) joined = true;
    const b1 = missionBot(m, fr);
    const b2 = joined && m.h2 ? bot2(m, fr + 7) : 0;
    const before = m.shots.length;
    m.step(b1, DT, p1, joined ? b2 : 0, joined ? p2 : undefined);
    if (m.h2 && m.shots.length > before && m.h2.fire > 60) shots2++;
    m.events.length = 0; ms += DT; fr++;
    if (mode === 'p2out' && m.h2 && !p2wasOut && ms > 15000 && (m.phase === 'play' || m.phase === 'boss')) {
      p2.lives = 1; m.h2.inv = 0; p2.hp = 1; m.hurtHero(p2, 1, m.h2);
      p2wasOut = p2.st === 'out' && m.h2.gone;
    }
    if (mode === 'p2out' && p2wasOut && !revived && ms > 24000) { m.coopRevive(p2); revived = !m.h2.gone && p2.st === 'alive'; }
    if (mode === 'p1out' && !p1out && ms > 15000 && (m.phase === 'play' || m.phase === 'boss') && m.h2) {
      p1.lives = 1; m.h1.inv = 0; p1.hp = 1; if (m.ride) m.ride = null; m.hurtHero(p1, 1, m.h1);
      p1out = p1.st === 'out' && m.h1.gone;
    }
  }
  const exitsOk = MISSIONS[id].exits.length === 0 ? m.next === null : !!m.next;
  let ok = m.done && !m.dead && exitsOk && !!m.h2 && shots2 > 20;
  if (mode === 'p2out') ok = ok && p2wasOut && revived;
  if (mode === 'p1out') ok = ok && p1out && m.h === m.h2;
  check(ok, `${id}/${route} ${mode}: ${(ms / 1000).toFixed(0)}s next=${m.next} kills=${m.kills} p1deaths=${p1.deaths} p2deaths=${p2.deaths} p2shots=${shots2} h2=${m.h2 ? Math.round(m.h2.x) : '-'} cam=${Math.round(m.cam)} ${mode === 'p2out' ? `out=${p2wasOut} revived=${revived}` : ''}${mode === 'p1out' ? `p1out=${p1out}` : ''}`);
}

const only = process.argv[2];
for (const id of Object.keys(MISSIONS)) {
  if (only && only !== id) continue;
  const routes = MISSIONS[id].exits.length > 1 ? ['up', 'low'] : ['low'];
  for (const r of routes) run(id, r, 'start');
  run(id, routes[0], 'join');
  run(id, routes[0], 'p2out');
  run(id, routes[0], 'p1out');
}
console.log(fail ? 'COOP MISSIONS: FAIL' : 'COOP MISSIONS: ALL GREEN');
process.exit(fail ? 1 : 0);
