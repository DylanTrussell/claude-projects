import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => { if (/error|fail|404/i.test(m.text())) console.log('CONSOLE:', m.text()); });
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

let entered = false;
for (let i = 0; i < 15; i++) {
  await page.keyboard.down('KeyS'); await page.waitForTimeout(80); await page.keyboard.up('KeyS');
  await page.waitForTimeout(250);
  const st = await page.evaluate(() => window.__AM());
  console.log(i, 'myX=', st.myX, st.tunnel ? 'TUNNEL' : 'no-tunnel');
  if (st.tunnel) { entered = true; break; }
}
if (!entered) { console.log('FAILED to enter nest tunnel'); await browser.close(); process.exit(1); }

// Walk the tunnel forward, screenshotting periodically to catch a rat enemy on screen.
await page.screenshot({ path: '/tmp/v11_rat_enter.png' });
let sawRat = false;
for (let i = 0; i < 40; i++) {
  await page.keyboard.down('KeyW'); await page.waitForTimeout(180); await page.keyboard.up('KeyW');
  const tun = await page.evaluate(() => window.__AMtun && window.__AMtun());
  if (tun) {
    const alive = tun.enemies.filter(e => !e.dead);
    if (alive.length && !sawRat) {
      sawRat = true;
      await page.screenshot({ path: '/tmp/v11_rat_seen.png' });
      console.log('rat enemies visible:', JSON.stringify(alive));
    }
  }
  await page.waitForTimeout(80);
}
await page.screenshot({ path: '/tmp/v11_rat_final.png' });
console.log('done. sawRat=', sawRat);
await browser.close();
