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
console.log('tunnel present after wait loop:', !!tun, 'iterations waited approx');

const full = await page.evaluate(async () => {
  const m = await import('/assets.js');
  return {
    pickup_health: !!m.IMG.pickup_health,
    pickup_shotgun_glow: !!m.IMG.pickup_shotgun_glow,
    fps_pistol: !!m.IMG.fps_pistol,
    vc_knife_walk1: !!m.IMG.vc_knife_walk1,
    totalKeys: Object.keys(m.IMG).length,
    keys: Object.keys(m.IMG).filter(k=>/pickup|tuna/.test(k)),
  };
});
console.log('full check:', JSON.stringify(full));

await browser.close();
