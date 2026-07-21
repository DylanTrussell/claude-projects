import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (/error|failed/i.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

await page.goto('http://localhost:8787/?dev=1&warp=1&rail=parley', { waitUntil: 'load' });
await page.waitForTimeout(1000);
for (let tries = 0; tries < 8; tries++) {
  const inGame = await page.evaluate(() => window.__AM && window.__AM().mode === 'game').catch(() => false);
  if (inGame) break;
  const skipBtn = await page.$('#btn-skip');
  if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click().catch(() => {}); }
  await page.waitForTimeout(600);
}
await page.mouse.click(640, 360);
await page.waitForTimeout(2000); // chunk load + rail spin-up
await page.screenshot({ path: '/tmp/v11_parley_talk.png' });
await page.waitForTimeout(8000); // into 'reveal' phase (script fires at t=9500)
await page.screenshot({ path: '/tmp/v11_parley_reveal.png' });
await page.waitForTimeout(8000); // into 'laugh'/'fight' phase (fight at t=20800)
await page.screenshot({ path: '/tmp/v11_parley_laugh.png' });
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/v11_parley_fight_start.png' });
// mash fire + strafe to knock a pylon down and confirm the shield-spark/exposed-hit loop
for (let i = 0; i < 60; i++) {
  await page.keyboard.down('KeyJ'); await page.keyboard.down('KeyA');
  await page.waitForTimeout(140);
  await page.keyboard.up('KeyJ'); await page.keyboard.up('KeyA');
  await page.waitForTimeout(60);
}
await page.screenshot({ path: '/tmp/v11_parley_fight_combat.png' });
console.log('ERRORS:', errs.length ? JSON.stringify(errs.slice(0, 20)) : 'none');
await browser.close();
