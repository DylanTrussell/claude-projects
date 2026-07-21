import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8787/?dev=1&warp=3200', { waitUntil: 'load' });
await page.waitForTimeout(1000);
for (let tries = 0; tries < 8; tries++) {
  const inGame = await page.evaluate(() => window.__AM && window.__AM().mode === 'game').catch(() => false);
  if (inGame) break;
  const skipBtn = await page.$('#btn-skip');
  if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click().catch(() => {}); }
  await page.waitForTimeout(600);
}
await page.mouse.click(640, 360);
await page.waitForTimeout(500);

const before = await page.evaluate(() => window.__AM());
console.log('before S:', JSON.stringify(before));

await page.keyboard.down('KeyS');
await page.waitForTimeout(400);
const during = await page.evaluate(() => window.__AM());
console.log('during S hold:', JSON.stringify(during));
await page.screenshot({ path: '/tmp/v11_crouch2.png' });
await page.keyboard.up('KeyS');

// fire while moving, check fireFlash flag + take screenshot mid-flash
await page.keyboard.down('KeyD');
await page.waitForTimeout(150);
await page.keyboard.down('KeyJ');
await page.waitForTimeout(60);
const firing = await page.evaluate(() => window.__AM());
console.log('firing while moving:', JSON.stringify(firing));
await page.screenshot({ path: '/tmp/v11_fire_moving2.png' });
await page.keyboard.up('KeyJ');
await page.keyboard.up('KeyD');

await browser.close();
