// v13 visual verification: capture the drawing changes actually rendering.
import { chromium } from 'playwright';
const BASE = process.env.URL || 'http://127.0.0.1:8787';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function shot(query, name, setup) {
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(BASE + query, { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => document.getElementById('intro')?.style.display === 'flex', { timeout: 60000 });
  // the film cannot decode in this browser; go straight past it with a real click
  await pg.click('#btn-skip');
  await pg.waitForTimeout(1500);
  if (setup) await setup(pg);
  await pg.screenshot({ path: '/tmp/' + name + '.png' });
  const st = await pg.evaluate(() => (window.__AM ? window.__AM() : {}));
  console.log(name, JSON.stringify(st), errs.length ? 'ERRORS:' + errs.slice(0, 2) : '');
  await pg.close();
}

const hold = async (pg, keys, ms) => {
  for (const k of keys) await pg.keyboard.down(k);
  await pg.waitForTimeout(ms);
  for (const k of keys) await pg.keyboard.up(k);
};

// flamethrower: warp onto the flame pickup, then hose the ground
await shot('/?dev=1&warp=4400&skiprail=1', 'v13_flame', async (pg) => {
  await pg.evaluate(() => window.__AMweap('flame', 999));
  await hold(pg, ['KeyJ'], 1100);
  await pg.waitForTimeout(60);
});

// ordinary combat: muzzle flash + small-kill explosions
await shot('/?dev=1&warp=1200&skiprail=1', 'v13_combat', async (pg) => {
  await hold(pg, ['KeyJ'], 1400);
});

// aiming straight up: the bullet-orientation fix
await shot('/?dev=1&warp=1200&skiprail=1', 'v13_aimup', async (pg) => {
  await hold(pg, ['KeyW', 'KeyJ'], 900);
  await pg.keyboard.down('KeyW');
  await pg.waitForTimeout(150);
});

// tunnel: viewmodel framing at the bottom of the screen
await shot('/?dev=1&warp=3010&skiprail=1', 'v13_tunnel', async (pg) => {
  await pg.waitForTimeout(2500);
  await hold(pg, ['KeyJ'], 400);
});

await b.close();
