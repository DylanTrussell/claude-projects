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
if (!tun) { console.log('ABORT'); await browser.close(); process.exit(1); }

await page.evaluate(() => { window.__AMtp(5.5, 5.3); window.__AMlook(5.5, 4.5); });
await page.waitForTimeout(300);
await page.evaluate(() => { window.__AMtp(5.5, 4.9); window.__AMlook(5.5, 4.5); });

// poll script phase until 'grapple', then mash fire while polling for 'rip'
let phase = null;
for (let i = 0; i < 30; i++) {
  const st = await page.evaluate(() => window.__AM().tunnel?.script);
  phase = st?.phase;
  if (phase === 'grapple') break;
  await page.waitForTimeout(100);
}
console.log('reached phase:', phase);
await page.screenshot({ path: 'v10_throat_slap2.png' });

for (let i = 0; i < 20; i++) {
  await page.keyboard.down('KeyJ'); await page.waitForTimeout(15); await page.keyboard.up('KeyJ');
  const st = await page.evaluate(() => window.__AM().tunnel?.script);
  if (st?.phase === 'rip') { console.log('entered rip at iter', i, JSON.stringify(st)); break; }
  await page.waitForTimeout(60);
}

// now poll within the rip phase (900ms window) and grab two frames
let gotEarly = false, gotLate = false;
for (let i = 0; i < 40; i++) {
  const st = await page.evaluate(() => window.__AM().tunnel?.script);
  if (!st || st.phase !== 'rip') { console.log('rip phase ended, last seen:', JSON.stringify(st)); break; }
  if (!gotEarly && st.t < 480) {
    await page.screenshot({ path: 'v10_throat_rip_mid.png' });
    console.log('saved rip_mid at t=', st.t);
    gotEarly = true;
  }
  if (!gotLate && st.t >= 520 && st.t < 890) {
    await page.screenshot({ path: 'v10_throat_rip_aftermath.png' });
    console.log('saved rip_aftermath at t=', st.t);
    gotLate = true;
  }
  await page.waitForTimeout(60);
}
console.log('gotEarly:', gotEarly, 'gotLate:', gotLate);

await browser.close();
