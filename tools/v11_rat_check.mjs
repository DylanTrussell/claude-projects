import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto('http://localhost:8787/?dev=1&warp=6150', { waitUntil: 'load' });
await page.waitForTimeout(1000);
for (let tries = 0; tries < 6; tries++) {
  const inGame = await page.evaluate(() => window.__AM && window.__AM().mode === 'game').catch(() => false);
  if (inGame) break;
  const skipBtn = await page.$('#btn-skip');
  if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click().catch(() => {}); }
  await page.waitForTimeout(600);
}
await page.mouse.click(640, 360);
await page.waitForTimeout(300);

// press S to drop into the nest
await page.keyboard.down('KeyS'); await page.waitForTimeout(200); await page.keyboard.up('KeyS');
await page.waitForTimeout(500);

let tun = null;
for (let i = 0; i < 15; i++) {
  tun = await page.evaluate(() => window.__AMtun && window.__AMtun());
  if (tun) break;
  await page.waitForTimeout(300);
}
console.log('tunnel present:', !!tun, 'enemies:', tun ? tun.enemies.length : 0);
if (!tun) { console.log('ABORT'); await browser.close(); process.exit(1); }

// teleport close to an enemy and look at it if any exist, else just walk forward and screenshot periodically
if (tun.enemies.length) {
  const e = tun.enemies[0];
  await page.evaluate((ex, ey) => { window.__AMtp(ex - 1.2, ey); window.__AMlook(ex, ey); }, e.x, e.y);
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/v11_rat_enemy.png' });
} else {
  // walk forward a bit to trigger a burst, then screenshot a few times
  for (let i = 0; i < 8; i++) {
    await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
    await page.waitForTimeout(200);
    const t2 = await page.evaluate(() => window.__AMtun && window.__AMtun());
    if (t2 && t2.enemies.length) {
      await page.screenshot({ path: `/tmp/v11_rat_enemy_walk${i}.png` });
    }
  }
}

await browser.close();
