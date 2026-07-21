import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

// doorgun aim test
await page.goto('http://localhost:8787/?dev=1&warp=1&rail=doorgun', { waitUntil: 'load' });
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
await page.screenshot({ path: '/tmp/v11_doorgun_neutral.png' });
// aim left with A, then fire
await page.keyboard.down('KeyA');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/v11_doorgun_aimleft.png' });
await page.keyboard.down('KeyJ');
await page.waitForTimeout(80);
await page.screenshot({ path: '/tmp/v11_doorgun_fireleft.png' });
await page.keyboard.up('KeyJ');
await page.keyboard.up('KeyA');
// aim right
await page.keyboard.down('KeyD');
await page.waitForTimeout(700);
await page.screenshot({ path: '/tmp/v11_doorgun_aimright.png' });
await page.keyboard.up('KeyD');
console.log('doorgun ERRORS:', errs.length ? JSON.stringify(errs) : 'none');
await browser.close();
