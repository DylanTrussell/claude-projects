import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// Warp to just BEFORE the door so we control exactly when we walk into it.
await page.goto('http://localhost:8787/?dev=1&warp=3260', { waitUntil: 'load' });
await page.waitForTimeout(1000);
for (let tries = 0; tries < 8; tries++) {
  const inGame = await page.evaluate(() => window.__AM && window.__AM().mode === 'game').catch(() => false);
  if (inGame) break;
  const skipBtn = await page.$('#btn-skip');
  if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click().catch(() => {}); }
  await page.waitForTimeout(600);
}
await page.mouse.click(640, 360);
await page.waitForTimeout(300);
let before = await page.evaluate(() => window.__AM());
console.log('pos before walking:', before.myX, 'tunnel:', !!before.tunnel);

// Walk right in small steps, poll every ~40ms without waiting for a full press-release cycle
await page.keyboard.down('KeyD');
let firedAt = null;
const shots = [];
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(40);
  const st = await page.evaluate(() => window.__AM());
  if (st.tunnel && firedAt === null) firedAt = i;
  await page.screenshot({ path: `/tmp/fallseq_${String(i).padStart(2,'0')}.png` });
  shots.push({ i, x: st.myX, tunnel: !!st.tunnel });
  if (firedAt !== null && i > firedAt + 6) break;
}
await page.keyboard.up('KeyD');
console.log(JSON.stringify(shots));
await browser.close();
