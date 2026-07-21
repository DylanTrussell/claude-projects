import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => console.log('[console]', m.type(), m.text()));
await page.goto('http://localhost:8787/?dev=1&warp=3300', { waitUntil: 'load' });
await page.waitForTimeout(1500);
for (let tries = 0; tries < 8; tries++) {
  const st = await page.evaluate(() => window.__AM && window.__AM().mode).catch(e => 'ERR:'+e.message);
  console.log('try', tries, 'mode:', st);
  if (st === 'game') break;
  const skipBtn = await page.$('#btn-skip');
  if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click().catch(() => {}); console.log('clicked skip'); }
  await page.waitForTimeout(700);
}
await page.mouse.click(640, 360);
await page.waitForTimeout(500);
console.log('final mode:', await page.evaluate(() => window.__AM().mode));
console.log('tunnel:', await page.evaluate(() => window.__AMtun && window.__AMtun()));
await browser.close();
