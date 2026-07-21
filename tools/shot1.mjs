import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto('http://localhost:8787/?dev=1&warp=3300', { waitUntil: 'load' });
await page.waitForTimeout(1000);
const skipBtn = await page.$('#btn-skip');
if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click(); await page.waitForTimeout(800); }
await page.mouse.click(640, 360);
await page.waitForTimeout(300);

// walk right into the tunnel door
await page.keyboard.down('KeyD');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyD');
await page.waitForTimeout(700);
await page.screenshot({ path: 'shot_tunnel_enter.png' });
console.log('saved shot_tunnel_enter.png');

// idle viewmodel pose
await page.waitForTimeout(600);
await page.screenshot({ path: 'shot_tunnel_idle.png' });
console.log('saved shot_tunnel_idle.png');

// fire pose
await page.keyboard.down('KeyJ');
await page.waitForTimeout(80);
await page.screenshot({ path: 'shot_tunnel_fire.png' });
await page.keyboard.up('KeyJ');
console.log('saved shot_tunnel_fire.png');

// keep firing to try to trigger a reload (every 10th shot) and get closer to enemies
for (let i = 0; i < 14; i++) {
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(60);
  await page.keyboard.up('KeyJ');
  await page.waitForTimeout(220);
}
await page.screenshot({ path: 'shot_tunnel_reload.png' });
console.log('saved shot_tunnel_reload.png');

// walk further to hopefully see enemies / pickups
await page.keyboard.down('KeyD');
await page.waitForTimeout(2500);
await page.keyboard.up('KeyD');
await page.waitForTimeout(300);
await page.screenshot({ path: 'shot_tunnel_deeper.png' });
console.log('saved shot_tunnel_deeper.png');

await browser.close();
