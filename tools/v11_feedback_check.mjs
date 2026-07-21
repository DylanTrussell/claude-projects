import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (/error|failed/i.test(m.text()) && !/favicon/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

// 1) Overworld: crouch pose + muzzle flash while moving + flying aliens + no dark patch after tunnel x-range
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
// crouch pose
await page.keyboard.down('KeyS');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/v11_crouch.png' });
await page.keyboard.up('KeyS');
// fire while moving right (muzzle flash sync)
await page.keyboard.down('KeyD');
await page.waitForTimeout(150);
await page.keyboard.down('KeyJ');
await page.waitForTimeout(80);
await page.screenshot({ path: '/tmp/v11_fire_moving.png' });
await page.keyboard.up('KeyJ');
await page.keyboard.up('KeyD');

console.log('ERRORS after overworld:', errs.length ? JSON.stringify(errs.slice(0,20)) : 'none');
await browser.close();
