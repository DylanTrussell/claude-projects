import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8787/?dev=1&warp=6150', { waitUntil: 'load' });
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
for (let i=0;i<10;i++) {
  await page.keyboard.down('KeyS'); await page.waitForTimeout(80); await page.keyboard.up('KeyS');
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => window.__AM());
  console.log(i, st.myX, st.tunnel ? 'TUNNEL' : 'no-tunnel');
  if (st.tunnel) break;
}
await browser.close();
