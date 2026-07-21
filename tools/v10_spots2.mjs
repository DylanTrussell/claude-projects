import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto('http://localhost:8787/?dev=1&warp=3300', { waitUntil: 'load' });
await page.waitForTimeout(1000);
const skipBtn = await page.$('#btn-skip');
if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click(); await page.waitForTimeout(800); }
await page.mouse.click(640, 360);
await page.waitForTimeout(300);
await page.keyboard.down('KeyD');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyD');
await page.waitForTimeout(1500);

const tun = await page.evaluate(() => window.__AMtun());
console.log(JSON.stringify(tun, null, 1));

async function lookAt(px, py, tx, ty, file) {
  await page.evaluate(({ px, py, tx, ty }) => { window.__AMtp(px, py); window.__AMlook(tx, ty); }, { px, py, tx, ty });
  await page.waitForTimeout(250);
  await page.screenshot({ path: file });
  console.log('saved', file);
}

const health = tun.items.find(i => i.kind === 'tuna');
const shotgun = tun.items.find(i => i.kind === 'shotgun');
if (health) await lookAt(health.x - 1.2, health.y, health.x, health.y, 'v10_spot_health2.png');
if (shotgun) await lookAt(shotgun.x - 1.2, shotgun.y, shotgun.x, shotgun.y, 'v10_spot_shotgun2.png');

// enemy: find first not-dead
const en = tun.enemies[0];
if (en) {
  await lookAt(en.x - 1.5, en.y, en.x, en.y, 'v10_spot_enemy_a.png');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'v10_spot_enemy_b.png' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'v10_spot_enemy_c.png' });
}

await browser.close();
