import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8787/?dev=1&warp=1&rail=doorgun', { waitUntil: 'load' });
await page.waitForTimeout(200);
await page.goto('http://localhost:8787/?dev=1&warp=3350', { waitUntil: 'load' });
await page.waitForTimeout(1000);
for (let tries = 0; tries < 8; tries++) {
  const inGame = await page.evaluate(() => window.__AM && window.__AM().mode === 'game').catch(() => false);
  if (inGame) break;
  const skipBtn = await page.$('#btn-skip');
  if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click().catch(() => {}); }
  await page.waitForTimeout(600);
}
await page.mouse.click(640, 360);
await page.waitForTimeout(300);
await page.keyboard.down('KeyD');
await page.waitForTimeout(600);
await page.keyboard.up('KeyD');
for (let i = 0; i < 10; i++) {
  const st = await page.evaluate(() => window.__AM());
  if (st.tunnel) break;
  await page.waitForTimeout(150);
}
await page.waitForTimeout(900);

const items = await page.evaluate(() => window.__AMtun());
console.log('items:', JSON.stringify(items.items));
const shotgunItem = items.items.find(i => i.kind === 'shotgun' && !i.got);
if (shotgunItem) {
  await page.evaluate(({ x, y }) => window.__AMtp(x, y), { x: shotgunItem.x, y: shotgunItem.y });
  await page.waitForTimeout(500);
} else {
  console.log('no shotgun item found or already got');
}
const after = await page.evaluate(() => window.__AM());
console.log('after teleport, tunnel:', JSON.stringify(after.tunnel));
await page.screenshot({ path: '/tmp/v11_1_shotgun_idle2.png' });

// fire it
await page.keyboard.down('KeyJ');
await page.waitForTimeout(60);
await page.screenshot({ path: '/tmp/v11_1_shotgun_fire2.png' });
await page.keyboard.up('KeyJ');

console.log('done');
await browser.close();
