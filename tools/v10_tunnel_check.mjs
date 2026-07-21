import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

await page.goto('http://localhost:8787/?dev=1&warp=3300', { waitUntil: 'load' });
await page.waitForTimeout(1000);
const skipBtn = await page.$('#btn-skip');
if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click(); await page.waitForTimeout(800); }
else { const bb = await page.$('#btn-begin'); if (bb && await bb.isVisible()) await bb.click(); await page.waitForTimeout(500); const sb2 = await page.$('#btn-skip'); if (sb2 && await sb2.isVisible()) { await sb2.click(); await page.waitForTimeout(800); } }
await page.mouse.click(640, 360);
await page.waitForTimeout(300);

// walk right into the tunnel door, wait through the chunk-loading beat
await page.keyboard.down('KeyD');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyD');
await page.waitForTimeout(1500); // let ensureChunk('tunnel') resolve
await page.screenshot({ path: 'v10_tunnel_idle.png' });
console.log('saved v10_tunnel_idle.png');

// fire pose — hold J briefly and grab a frame mid-fire
await page.keyboard.down('KeyJ');
await page.waitForTimeout(40);
await page.screenshot({ path: 'v10_tunnel_fire.png' });
await page.keyboard.up('KeyJ');
console.log('saved v10_tunnel_fire.png');

// empty the mag (10 rounds) to trigger a reload
for (let i = 0; i < 11; i++) {
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(50);
  await page.keyboard.up('KeyJ');
  await page.waitForTimeout(400);
}
await page.screenshot({ path: 'v10_tunnel_reload.png' });
console.log('saved v10_tunnel_reload.png');
await page.waitForTimeout(1200);

// walk deeper to find enemies / pickups, screenshot periodically + compass
await page.keyboard.down('KeyD');
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `v10_tunnel_walk_${i}.png` });
}
await page.keyboard.up('KeyD');
console.log('saved v10_tunnel_walk_0..5.png');

await browser.close();
