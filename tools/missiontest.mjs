// Headless run of every Part Two mission and both roads out of each fork.
import { Mission, Cine, MISSIONS, missionBot } from '../public/missions.js';
import { CFG } from '../public/config.js';
const only = process.argv[2];
let fail = 0;
for (const id of Object.keys(MISSIONS)) {
  if (only && only !== id) continue;
  for (const route of MISSIONS[id].exits.length > 1 ? ['up', 'low'] : ['low']) {
    const m = new Mission(id); m.botRoute = route;
    const p = { hp: CFG.hpMax, lives: 99, deaths: 0, st: 'alive' };
    let ms = 0, fr = 0; const seen = {};
    while (!m.done && ms < 420000) {
      m.step(missionBot(m, fr++), 1000 / 60, p); m.events.length = 0; ms += 1000 / 60;
      if (!seen[m.phase]) { seen[m.phase] = (ms / 1000).toFixed(0); }
    }
    const ok = m.done && !m.dead && (MISSIONS[id].exits.length === 0 ? m.next === null : !!m.next) && (MISSIONS[id].exits.length < 2 || m.route === route);
    if (!ok) fail++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${id}/${route}: ${(ms / 1000).toFixed(0)}s next=${m.next} route=${m.route} deaths=${p.deaths} kills=${m.kills} phase=${m.phase} x=${Math.round(m.h.x)} cam=${Math.round(m.cam)} phases=${JSON.stringify(seen)} boss=${m.boss ? Math.round(m.boss.hp) : '-'} en=${m.en.length}`);
  }
}
for (const n of ['aftermath', 'map', 'ramp', 'finale']) { const c = new Cine(n, { done: ['graveyard'], from: 'graveyard', to: 'bridge' }); let ms = 0; while (!c.done && ms < 20000) { c.step(0, 1000 / 60); ms += 1000 / 60; } console.log(c.done ? 'OK  ' : 'FAIL', 'cine', n, (ms / 1000).toFixed(1) + 's'); if (!c.done) fail++; }
console.log(fail ? 'MISSIONS: FAIL' : 'MISSIONS: ALL GREEN'); process.exit(fail ? 1 : 0);
