import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto('http://localhost:8787/?dev=1&warp=3300', { waitUntil: 'load' });
await page.waitForTimeout(1000);
for (let tries = 0; tries < 6; tries++) {
  const inGame = await page.evaluate(() => window.__AM && window.__AM().mode === 'game').catch(() => false);
  if (inGame) break;
  const skipBtn = await page.$('#btn-skip');
  if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click().catch(() => {}); }
  await page.waitForTimeout(600);
}
await page.mouse.click(640, 360);
await page.waitForTimeout(300);

let tun = null;
for (let i = 0; i < 15; i++) {
  tun = await page.evaluate(() => window.__AMtun && window.__AMtun());
  if (tun) break;
  await page.waitForTimeout(300);
}
if (!tun) {
  await page.keyboard.down('KeyD'); await page.waitForTimeout(600); await page.keyboard.up('KeyD');
  for (let i = 0; i < 10; i++) {
    tun = await page.evaluate(() => window.__AMtun && window.__AMtun());
    if (tun) break;
    await page.waitForTimeout(300);
  }
}
console.log('tunnel present:', !!tun);
if (!tun) { console.log('ABORT: never entered tunnel'); await browser.close(); process.exit(1); }

// grabCell is at grid 'G' (5,4) per the map -> world (5.5,4.5). Teleport
// just outside the 0.65-radius trigger, then step in to arm the script.
await page.evaluate(() => { window.__AMtp(5.5, 5.3); window.__AMlook(5.5, 4.5); });
await page.waitForTimeout(300);
await page.evaluate(() => { window.__AMtp(5.5, 4.9); window.__AMlook(5.5, 4.5); }); // within 0.65 to arm
await page.waitForTimeout(700); // let 'appear' phase (620ms) play out
await page.screenshot({ path: 'v10_throat_appear.png' });
console.log('saved appear');

await page.waitForTimeout(500); // slap phase (460ms)
await page.screenshot({ path: 'v10_throat_slap.png' });
console.log('saved slap, now in grapple - mashing fire to fill meter');

// grapple: mash FIRE (KeyJ) repeatedly; meter needs to hit 100, drains 16/s while filling 13 per press
for (let i = 0; i < 14; i++) {
  await page.keyboard.down('KeyJ'); await page.waitForTimeout(20); await page.keyboard.up('KeyJ');
  await page.waitForTimeout(120);
  const st = await page.evaluate(() => window.__AM().tunnel).catch(() => null);
}
await page.waitForTimeout(150);
await page.screenshot({ path: 'v10_throat_rip_early.png' }); // should be fps_throat_mid (<500ms into rip)
console.log('saved rip_early');
await page.waitForTimeout(600);
await page.screenshot({ path: 'v10_throat_rip_late.png' }); // should be fps_throat_aftermath (>500ms into rip)
console.log('saved rip_late');

await browser.close();
