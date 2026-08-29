import { Tunnel } from '/Users/dylantrussell/Dev/apocalypse-meow/public/fps.js';
import { C, CFG } from '/Users/dylantrussell/Dev/apocalypse-meow/public/config.js';
// Drive the grapple three ways and prove none of them can hang.
function run(label, policy) {
  const t = new Tunnel(0);
  const p = { hp: CFG.hpMax, lives: 9, deaths: 0, st: 'alive' };
  t.px = t.grabCell.x; t.py = t.grabCell.y;   // walk onto the choke
  let ms = 0, bits = 0;
  while (ms < 30000) {
    bits = policy(ms);
    t.step(bits, 16, p); t.events.length = 0;
    ms += 16;
    if (t.script && t.script.done) break;
  }
  const s = t.script;
  console.log(`${label.padEnd(26)} escaped=${!!(s && s.done)} at ${(ms/1000).toFixed(1)}s  meter=${s ? Math.round(s.meter) : '-'}  hp=${p.hp}`);
}
run('perfect mash (every 120ms)', ms => (Math.floor(ms/120) % 2 ? C.FIRE : 0));
run('panicky hold (never lets go)', () => C.FIRE);
run('does NOTHING at all', () => 0);
run('mashes K instead of J', ms => (Math.floor(ms/150) % 2 ? C.GREN : 0));
