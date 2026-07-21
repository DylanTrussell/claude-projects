import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto('http://localhost:8787/?dev=1&warp=3300&godmode=1', { waitUntil: 'load' });
await page.waitForTimeout(1000);
const skipBtn = await page.$('#btn-skip');
if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click(); await page.waitForTimeout(800); }
await page.mouse.click(640, 360);
await page.waitForTimeout(300);

// walk into and deep through the tunnel, firing continuously, screenshotting periodically
await page.keyboard.down('KeyD');
await page.keyboard.down('KeyJ');
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `shot_walk_${i}.png` });
}
await page.keyboard.up('KeyD');
await page.keyboard.up('KeyJ');
console.log('done walking, saved shot_walk_0..9.png');

await browser.close();
