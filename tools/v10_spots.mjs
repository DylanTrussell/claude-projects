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

await page.keyboard.down('KeyD');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyD');
await page.waitForTimeout(1500);

// grid (map 0): row1 col8 = tuna/health 'T' -> world (8.5,1.5)
await page.evaluate(() => window.__AMtp(7.0, 1.5, 0));
await page.waitForTimeout(200);
await page.screenshot({ path: 'v10_spot_health.png' });
console.log('saved v10_spot_health.png');

// shotgun 'S' at row5 col5 -> world (5.5,5.5), look toward it from (3.5,5.5) facing +x (ang=0)
await page.evaluate(() => window.__AMtp(3.5, 5.5, 0));
await page.waitForTimeout(200);
await page.screenshot({ path: 'v10_spot_shotgun.png' });
console.log('saved v10_spot_shotgun.png');

// knife-cat enemies 'a' at several spots, e.g. row2 col4 -> world (4.5,2.5); stand nearby facing it
await page.evaluate(() => window.__AMtp(2.5, 2.5, 0));
await page.waitForTimeout(600); // let it burst out of hiding
await page.screenshot({ path: 'v10_spot_enemy1.png' });
await page.waitForTimeout(500);
await page.screenshot({ path: 'v10_spot_enemy2.png' });
await page.waitForTimeout(800);
await page.screenshot({ path: 'v10_spot_enemy3.png' });
console.log('saved v10_spot_enemy1/2/3.png');

await browser.close();
