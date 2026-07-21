import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (/error|failed/i.test(m.text()) && !/favicon/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

// Warp right near the tunnel door area (fpsDoors.main) and approach it to trigger 'fps' event naturally.
await page.goto('http://localhost:8787/?dev=1&warp=3300', { waitUntil: 'load' });
await page.waitForTimeout(1000);
for (let tries = 0; tries < 8; tries++) {
  const inGame = await page.evaluate(() => window.__AM && window.__AM().mode === 'game').catch(() => false);
  if (inGame) break;
  const skipBtn = await page.$('#btn-skip');
  if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click().catch(() => {}); }
  await page.waitForTimeout(600);
}
await page.mouse.click(640, 360);
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/v11_before_tunnel_walkup.png' });
// walk right toward the tunnel door repeatedly, screenshotting along the way to catch the fall animation
let sawFps = false;
for (let i = 0; i < 40; i++) {
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(120);
  const st = await page.evaluate(() => window.__AM());
  if (st.tunnel && !sawFps) {
    sawFps = true;
    console.log('entered tunnel at iter', i, JSON.stringify(st));
  }
  if (i % 5 === 0) await page.screenshot({ path: `/tmp/v11_walkup_${i}.png` });
  if (sawFps) break;
}
await page.keyboard.up('KeyD');
await page.screenshot({ path: '/tmp/v11_at_tunnel_entry.png' });
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/v11_in_tunnel.png' });
console.log('ERRORS:', errs.length ? JSON.stringify(errs.slice(0,20)) : 'none');
await browser.close();
