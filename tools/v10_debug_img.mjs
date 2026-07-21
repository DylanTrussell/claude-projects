import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (/pickup|chunk/i.test(m.text())) console.log('[console]', m.text()); });

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
let tun = await page.evaluate(() => window.__AMtun && window.__AMtun());
console.log('tunnel present:', !!tun);

const imgKeys = await page.evaluate(async () => {
  const m = await import('/assets.js');
  return Object.keys(m.IMG).filter(k => /pickup|tuna|shotgun/i.test(k));
});
console.log('IMG keys matching pickup/tuna/shotgun:', imgKeys);

const full = await page.evaluate(async () => {
  const m = await import('/assets.js');
  return {
    pickup_health: !!m.IMG.pickup_health,
    pickup_shotgun_glow: !!m.IMG.pickup_shotgun_glow,
    fps_shotgun: !!m.IMG.fps_shotgun,
    pickup_flame: !!m.IMG.pickup_flame,
    totalKeys: Object.keys(m.IMG).length,
  };
});
console.log('full check:', full);

await browser.close();
