import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));

await page.goto('http://localhost:8787/?dev=1&warp=6150&skiprail=1', { waitUntil: 'load' });
await page.waitForTimeout(1000);
for (let tries = 0; tries < 6; tries++) {
  const inGame = await page.evaluate(() => window.__AM && window.__AM().mode === 'game').catch(() => false);
  if (inGame) break;
  const skipBtn = await page.$('#btn-skip');
  if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click().catch(() => {}); }
  await page.waitForTimeout(600);
}
await page.mouse.click(640, 360);
await page.waitForTimeout(1000);

for (let i = 0; i < 15; i++) {
  await page.keyboard.down('KeyS'); await page.waitForTimeout(80); await page.keyboard.up('KeyS');
  await page.waitForTimeout(250);
  const st = await page.evaluate(() => window.__AM());
  if (st.tunnel) break;
}
console.log('entered tunnel');

const tun0 = await page.evaluate(() => window.__AMtun && window.__AMtun());
console.log('enemies at entry:', JSON.stringify(tun0.enemies));
// Teleport right next to the first enemy (dev hook) and look at it — this is
// purely for verification (dev=1-gated), not real gameplay.
const e0 = tun0.enemies[0];
await page.evaluate(([ex, ey]) => window.__AMtp(ex - 0.4, ey, undefined), [e0.x, e0.y]);
await page.evaluate(([ex, ey]) => window.__AMlook(ex, ey), [e0.x, e0.y]);
await page.waitForTimeout(400);
let tun = await page.evaluate(() => window.__AMtun && window.__AMtun());
console.log('after teleport near enemy0:', JSON.stringify(tun.enemies));
await page.screenshot({ path: '/tmp/v11_rat_neartp.png' });

// Now hold forward+fire to force burst/chase/lunge and capture frames.
let capturedActive = false, capturedLunge = false;
for (let i = 0; i < 60; i++) {
  const t = await page.evaluate(() => window.__AMtun && window.__AMtun());
  if (t) {
    const alive = t.enemies.filter(e => !e.dead);
    if (alive.length) {
      const nearest = alive.reduce((a, b) => (a ? (Math.hypot(a.x - t.exit ? 0 : 0) , a) : b) || b, alive[0]);
      await page.evaluate(([ex, ey]) => window.__AMlook(ex, ey), [nearest.x, nearest.y]);
    }
  }
  await page.keyboard.down('KeyW');
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(140);
  await page.keyboard.up('KeyW');
  await page.mouse.up({ button: 'left' });
  const tun2 = await page.evaluate(() => window.__AMtun && window.__AMtun());
  if (tun2) {
    const active = tun2.enemies.filter(e => !e.dead && e.st !== 'hide');
    if (active.length) {
      if (!capturedActive) { capturedActive = true; await page.screenshot({ path: '/tmp/v11_rat_active.png' }); console.log(i, 'ACTIVE:', JSON.stringify(active)); }
      if (!capturedLunge && active.some(e => e.st === 'lunge')) { capturedLunge = true; await page.screenshot({ path: '/tmp/v11_rat_lunge.png' }); console.log(i, 'LUNGE:', JSON.stringify(active)); }
    }
    if (tun2.enemies.every(e => e.dead)) { console.log(i, 'all dead'); break; }
  }
  await page.waitForTimeout(40);
}
await page.screenshot({ path: '/tmp/v11_rat_endstate.png' });
console.log('done. capturedActive=', capturedActive, 'capturedLunge=', capturedLunge);
await browser.close();
