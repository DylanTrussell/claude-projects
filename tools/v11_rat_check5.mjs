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
const e0 = tun0.enemies[0]; // x:3.5,y:3.5
// Teleport ~2.2 tiles away (outside lunge range but inside burst/chase radius) and look at it.
await page.evaluate(([ex, ey]) => window.__AMtp(ex - 2.2, ey, undefined), [e0.x, e0.y]);
await page.evaluate(([ex, ey]) => window.__AMlook(ex, ey), [e0.x, e0.y]);
await page.waitForTimeout(300);
let tun = await page.evaluate(() => window.__AMtun && window.__AMtun());
console.log('after teleport 2.2 away:', JSON.stringify(tun.enemies[0]));
await page.screenshot({ path: '/tmp/v11_rat_walk1.png' });

// small time steps, re-aim each tick, stop the instant state != hide/chase changes to lunge
for (let i = 0; i < 20; i++) {
  const t = await page.evaluate(() => window.__AMtun && window.__AMtun());
  const e = t.enemies[0];
  if (e.st === 'lunge') { console.log('lunge at i=', i); break; }
  await page.evaluate(([ex, ey]) => window.__AMlook(ex, ey), [e.x, e.y]);
  await page.waitForTimeout(90);
  if (i === 3) await page.screenshot({ path: '/tmp/v11_rat_walk2.png' });
  if (i === 7) await page.screenshot({ path: '/tmp/v11_rat_walk3.png' });
  console.log(i, e.st, e.x.toFixed(2), e.y.toFixed(2));
}
await page.screenshot({ path: '/tmp/v11_rat_walk4.png' });
await browser.close();
