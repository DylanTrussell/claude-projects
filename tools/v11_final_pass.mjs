import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (/error|failed|404/i.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

await page.goto('http://localhost:8787/?dev=1&warp=3323', { waitUntil: 'load' });
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

// enter the main tunnel (map 0)
for (let i = 0; i < 15; i++) {
  await page.keyboard.down('KeyS'); await page.waitForTimeout(80); await page.keyboard.up('KeyS');
  await page.waitForTimeout(250);
  const st = await page.evaluate(() => window.__AM());
  if (st.tunnel) break;
}
const st1 = await page.evaluate(() => window.__AM());
console.log('in tunnel:', !!st1.tunnel);
await page.screenshot({ path: '/tmp/v11_final_pistol_idle.png' });

// fire pistol
await page.keyboard.down('KeyJ'); await page.waitForTimeout(70); await page.keyboard.up('KeyJ');
await page.screenshot({ path: '/tmp/v11_final_pistol_fire.png' });
await page.waitForTimeout(300);

// pause menu
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/v11_final_pause.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('ERRORS:', errs.length ? JSON.stringify(errs.slice(0, 20)) : 'none');
await browser.close();
