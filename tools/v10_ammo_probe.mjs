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

console.log('start:', await page.evaluate(() => window.__AM().tunnel));

for (let i = 0; i < 12; i++) {
  await page.keyboard.down('KeyJ'); await page.waitForTimeout(30); await page.keyboard.up('KeyJ');
  await page.waitForTimeout(450);
  const st = await page.evaluate(() => window.__AM().tunnel);
  console.log(`shot ${i}:`, JSON.stringify(st));
  if (st.reloadT > 0) {
    await page.screenshot({ path: `v10_reload_caught_${i}.png` });
    console.log('  -> screenshot saved (reloading)');
  }
}
await page.waitForTimeout(1000);
console.log('after wait:', await page.evaluate(() => window.__AM().tunnel));
await page.screenshot({ path: 'v10_reload_after.png' });

await browser.close();
