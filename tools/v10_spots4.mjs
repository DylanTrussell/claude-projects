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
  else {
    const bb = await page.$('#btn-begin');
    if (bb && await bb.isVisible()) await bb.click().catch(() => {});
  }
  await page.waitForTimeout(600);
}
await page.mouse.click(640, 360);
await page.waitForTimeout(300);
const st1 = await page.evaluate(() => window.__AM().mode);
console.log('mode after skip loop:', st1);

// DO NOT move the player at all before checking the tunnel — just directly
// query for it (the fps sub-mode should already be active per the warp).
// If tunnel isn't up yet, nudge briefly then check again.
let tun = await page.evaluate(() => window.__AMtun && window.__AMtun());
if (!tun) {
  await page.keyboard.down('KeyD'); await page.waitForTimeout(400); await page.keyboard.up('KeyD');
  await page.waitForTimeout(800);
  tun = await page.evaluate(() => window.__AMtun && window.__AMtun());
}
console.log('items:', JSON.stringify(tun?.items));

async function lookAt(px, py, tx, ty, file) {
  await page.evaluate(({ px, py, tx, ty }) => { window.__AMtp(px, py); window.__AMlook(tx, ty); }, { px, py, tx, ty });
  await page.waitForTimeout(250);
  await page.screenshot({ path: file });
  console.log('saved', file, 'from', px, py, 'looking at', tx, ty);
}

const health = tun.items.find(i => i.kind === 'tuna' && !i.got);
const shotgun = tun.items.find(i => i.kind === 'shotgun' && !i.got);
console.log('health item found (not got):', !!health, 'shotgun item found (not got):', !!shotgun);
if (health) await lookAt(9.5, 1.5, health.x, health.y, 'v10_spot_health4.png');
if (shotgun) await lookAt(6.5, 5.5, shotgun.x, shotgun.y, 'v10_spot_shotgun4.png');

await browser.close();
