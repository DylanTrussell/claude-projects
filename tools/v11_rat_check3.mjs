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

let capturedActive = false, capturedLunge = false, capturedHurt = false;
for (let i = 0; i < 260; i++) {
  await page.keyboard.down('KeyW');
  await page.mouse.down({ button: 'left' }); // hold fire
  await page.waitForTimeout(120);
  await page.keyboard.up('KeyW');
  await page.mouse.up({ button: 'left' });
  const tun = await page.evaluate(() => window.__AMtun && window.__AMtun());
  if (tun) {
    const active = tun.enemies.filter(e => !e.dead && e.st !== 'hide');
    if (active.length) {
      if (!capturedActive) { capturedActive = true; await page.screenshot({ path: '/tmp/v11_rat_active.png' }); console.log(i, 'ACTIVE:', JSON.stringify(active)); }
      if (!capturedLunge && active.some(e => e.st === 'lunge')) { capturedLunge = true; await page.screenshot({ path: '/tmp/v11_rat_lunge.png' }); console.log(i, 'LUNGE:', JSON.stringify(active)); }
    }
  }
  await page.waitForTimeout(60);
  if (capturedActive && capturedLunge) break;
}
await page.screenshot({ path: '/tmp/v11_rat_endstate.png' });
console.log('done. capturedActive=', capturedActive, 'capturedLunge=', capturedLunge);
await browser.close();
