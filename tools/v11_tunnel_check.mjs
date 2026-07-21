import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console error]', m.text()); });

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
if (!tun) { console.log('ABORT'); await browser.close(); process.exit(1); }

// idle pistol viewmodel
await page.screenshot({ path: '/tmp/v11_pistol_idle.png' });

// fire the pistol and grab a frame mid-fire
await page.keyboard.down('KeyJ');
await page.waitForTimeout(60);
await page.screenshot({ path: '/tmp/v11_pistol_fire.png' });
await page.waitForTimeout(60);
await page.keyboard.up('KeyJ');

await browser.close();
