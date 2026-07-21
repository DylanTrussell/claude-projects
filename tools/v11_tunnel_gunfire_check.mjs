import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8787/?dev=1&warp=1&rail=doorgun', { waitUntil: 'load' }); // dummy nav to init page context first
await page.waitForTimeout(200);
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
// walk toward door
await page.keyboard.down('KeyD');
await page.waitForTimeout(600);
await page.keyboard.up('KeyD');
// wait for tunnel to load
for (let i=0;i<10;i++){
  const st = await page.evaluate(() => window.__AM());
  if (st.tunnel) break;
  await page.waitForTimeout(150);
}
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/v11_tunnel_idle_pistol.png' });
// fire
await page.keyboard.down('KeyJ');
await page.waitForTimeout(60);
await page.screenshot({ path: '/tmp/v11_tunnel_fire_pistol.png' });
await page.keyboard.up('KeyJ');
console.log('done');
await browser.close();
