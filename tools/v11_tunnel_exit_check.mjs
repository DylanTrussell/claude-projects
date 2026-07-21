import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8787/?dev=1&warp=3350', { waitUntil: 'load' });
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
await page.keyboard.down('KeyD');
await page.waitForTimeout(600);
await page.keyboard.up('KeyD');
for (let i=0;i<10;i++){
  const st = await page.evaluate(() => window.__AM());
  if (st.tunnel) break;
  await page.waitForTimeout(150);
}
await page.waitForTimeout(300);
const tun = await page.evaluate(() => window.__AMtun());
console.log('tunnel info:', JSON.stringify(tun));
if (tun && tun.exit) {
  await page.evaluate((exit) => window.__AMtp(exit.x, exit.y, 0), tun.exit);
  await page.waitForTimeout(200);
  // walk into the exit repeatedly (S usually backs off; try forward W toward exit assuming ang faces it)
  for (let i=0;i<6;i++){
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(150);
    const st = await page.evaluate(() => window.__AM());
    await page.screenshot({ path: `/tmp/exitseq_${i}.png` });
    if (!st.tunnel) { console.log('exited tunnel at iter', i); break; }
  }
  await page.keyboard.up('KeyW');
}
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/v11_after_exit.png' });
console.log('ERRORS:', errs.length ? JSON.stringify(errs) : 'none');
await browser.close();
