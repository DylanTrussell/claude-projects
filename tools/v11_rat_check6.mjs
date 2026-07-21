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
const e0 = tun0.enemies[0];
await page.evaluate(([ex, ey]) => window.__AMtp(ex - 1.5, ey, undefined), [e0.x, e0.y]);
await page.evaluate(([ex, ey]) => window.__AMlook(ex, ey), [e0.x, e0.y]);
await page.waitForTimeout(200);
// fire once to trigger alert
await page.mouse.down({ button: 'left' }); await page.waitForTimeout(60); await page.mouse.up({ button: 'left' });
await page.waitForTimeout(150);

for (let i = 0; i < 30; i++) {
  const t = await page.evaluate(() => window.__AMtun && window.__AMtun());
  const e = t.enemies[0];
  console.log(i, e.st, e.x.toFixed(2), e.y.toFixed(2));
  if (e.st === 'lunge') { await page.screenshot({ path: '/tmp/v11_rat_lunge2.png' }); break; }
  if (e.st === 'chase' || e.st === 'burst') {
    await page.evaluate(([ex, ey]) => window.__AMlook(ex, ey), [e.x, e.y]);
    await page.screenshot({ path: `/tmp/v11_rat_chase_${i}.png` });
  }
  await page.waitForTimeout(120);
}
await browser.close();
