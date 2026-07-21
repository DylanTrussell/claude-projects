import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (/error|failed/i.test(m.text()) && !/favicon/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

await page.goto('http://localhost:8787/?dev=1&warp=1&rail=ptboat', { waitUntil: 'load' });
await page.waitForTimeout(1000);
for (let tries = 0; tries < 8; tries++) {
  const inGame = await page.evaluate(() => window.__AM && window.__AM().mode === 'game').catch(() => false);
  if (inGame) break;
  const skipBtn = await page.$('#btn-skip');
  if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click().catch(() => {}); }
  await page.waitForTimeout(600);
}
await page.mouse.click(640, 360);
await page.waitForTimeout(2000); // let the ptboat chunk load + rail spin up
await page.screenshot({ path: '/tmp/v11_ptboat_start.png' });

// hold fire + steer for a bit so foes/mines actually appear on screen
for (let i = 0; i < 30; i++) {
  await page.keyboard.down('KeyJ');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(150);
  await page.keyboard.up('KeyJ');
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(80);
}
await page.screenshot({ path: '/tmp/v11_ptboat_combat.png' });

console.log('ERRORS:', errs.length ? JSON.stringify(errs.slice(0, 20)) : 'none');
await browser.close();
