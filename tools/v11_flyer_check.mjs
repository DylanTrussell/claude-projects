import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8787/?dev=1&warp=5200&skiprail=1', { waitUntil: 'load' });
await page.waitForTimeout(1000);
for (let tries = 0; tries < 8; tries++) {
  const inGame = await page.evaluate(() => window.__AM && window.__AM().mode === 'game').catch(() => false);
  if (inGame) break;
  const skipBtn = await page.$('#btn-skip');
  if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click().catch(() => {}); }
  await page.waitForTimeout(600);
}
await page.mouse.click(640, 360);
// walk right for a while to let waves spawn, take periodic screenshots
for (let i = 0; i < 20; i++) {
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(100);
}
await page.screenshot({ path: '/tmp/v11_invasion_scan.png' });
const st = await page.evaluate(() => window.__AM());
console.log('state:', JSON.stringify(st));
await browser.close();
