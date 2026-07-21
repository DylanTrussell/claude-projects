import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const failed = [];
page.on('response', r => { if (r.status() === 404) failed.push(r.url()); });
await page.goto('http://localhost:8787/?dev=1&warp=3300', { waitUntil: 'load' });
await page.waitForTimeout(1500);
for (let tries = 0; tries < 8; tries++) {
  const inGame = await page.evaluate(() => window.__AM && window.__AM().mode === 'game').catch(() => false);
  if (inGame) break;
  const skipBtn = await page.$('#btn-skip');
  if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click().catch(() => {}); }
  await page.waitForTimeout(600);
}
await page.mouse.click(640, 360);
await page.waitForTimeout(2000);
console.log('404s:', JSON.stringify(failed));
await browser.close();
