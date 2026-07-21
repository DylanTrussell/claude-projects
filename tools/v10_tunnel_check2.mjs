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

// fire once, then rapid-fire screenshots to catch the fire-pose window
await page.keyboard.down('KeyJ');
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(15);
  await page.screenshot({ path: `v10_fire_${i}.png` });
}
await page.keyboard.up('KeyJ');
console.log('saved v10_fire_0..7.png');
await page.waitForTimeout(500);

// empty the 10-round mag, then rapid-fire screenshots to catch the reload pose
for (let i = 0; i < 10; i++) {
  await page.keyboard.down('KeyJ'); await page.waitForTimeout(30); await page.keyboard.up('KeyJ');
  await page.waitForTimeout(420);
}
// this 11th press should trigger/continue reload; grab frames across the reload window
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(80);
  await page.screenshot({ path: `v10_reload_${i}.png` });
}
console.log('saved v10_reload_0..11.png');

// enemies + pickups: keep walking deeper
await page.keyboard.down('KeyD');
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `v10_deep_${i}.png` });
}
await page.keyboard.up('KeyD');
console.log('saved v10_deep_0..7.png');

await browser.close();
