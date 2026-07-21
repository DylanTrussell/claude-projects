import { chromium } from 'playwright';

const grid = [
  '############',
  '#P....##T..#',
  '#.##a.##.#.#',
  '#..#.....a.#',
  '#####G######',
  '#..a.S...#.#',
  '#.####.#.#.#',
  '#..#.a.#.#M#',
  '##.#.###.#.#',
  '#E.....a...#',
  '############',
];
function cellAt(x, y) { if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return '#'; return grid[y][x]; }
function bfsNearestOpen(tx, ty) {
  // find an open neighbor cell of (tx,ty) reachable (i.e. not a wall) to stand in
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (cellAt(tx + dx, ty + dy) !== '#') return [tx + dx + 0.5, ty + dy + 0.5];
  }
  return [tx + 0.5, ty + 0.5];
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto('http://localhost:8787/?dev=1&warp=3300', { waitUntil: 'load' });
await page.waitForTimeout(1000);
for (let tries = 0; tries < 6; tries++) {
  const inGame = await page.evaluate(() => window.__AM && window.__AM().mode === 'game').catch(() => false);
  if (inGame) break;
  const skipBtn = await page.$('#btn-skip');
  if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click().catch(() => {}); }
  else {
    const bb = await page.$('#btn-begin');
    if (bb && await bb.isVisible()) await bb.click().catch(() => {});
  }
  await page.waitForTimeout(600);
}
await page.mouse.click(640, 360);
await page.waitForTimeout(300);
const st1 = await page.evaluate(() => window.__AM().mode);
console.log('mode after skip loop:', st1);
await page.keyboard.down('KeyD');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyD');
await page.waitForTimeout(1500);
console.log('tunnel present:', !!(await page.evaluate(() => window.__AMtun && window.__AMtun())));

async function lookAt(px, py, tx, ty, file) {
  await page.evaluate(({ px, py, tx, ty }) => { window.__AMtp(px, py); window.__AMlook(tx, ty); }, { px, py, tx, ty });
  await page.waitForTimeout(250);
  await page.screenshot({ path: file });
  console.log('saved', file, 'from', px, py, 'looking at', tx, ty);
}

// health item at grid (8,1) 'T' -> stand at open neighbor (9,1) '.'
await lookAt(9.5, 1.5, 8.5, 1.5, 'v10_spot_health3.png');
// shotgun at grid (5,5) 'S' -> stand at open neighbor (6,5) '.'
await lookAt(6.5, 5.5, 5.5, 5.5, 'v10_spot_shotgun3.png');
// enemy at grid (4,2) 'a' -> stand at open neighbor (5,2) '.'
await lookAt(5.5, 2.5, 4.5, 2.5, 'v10_spot_enemy_x.png');
await page.waitForTimeout(600);
await page.screenshot({ path: 'v10_spot_enemy_y.png' });
await page.waitForTimeout(600);
await page.screenshot({ path: 'v10_spot_enemy_z.png' });

await browser.close();
