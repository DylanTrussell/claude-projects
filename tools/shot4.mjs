import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto('http://localhost:8787/?dev=1&warp=200', { waitUntil: 'load' });
await page.waitForTimeout(1000);
const skipBtn = await page.$('#btn-skip');
if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click(); await page.waitForTimeout(800); }
await page.mouse.click(640, 360);
await page.waitForTimeout(300);

await page.screenshot({ path: 'shot_normal_idle.png' });
console.log('saved shot_normal_idle.png (baseline standing size)');

await page.keyboard.down('KeyW'); // aim up (per controls: W forward is used differently outside/tunnel — try ArrowUp too)
await page.waitForTimeout(150);
await page.screenshot({ path: 'shot_normal_up1.png' });
await page.keyboard.up('KeyW');

await browser.close();
