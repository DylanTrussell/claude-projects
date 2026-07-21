import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8787/?room=mobilecheck');
await new Promise(r => setTimeout(r, 3000));
try { if (await page.isVisible('#intro')) await page.tap('#btn-skip'); } catch(_){}
await page.tap('#btn-start');
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/mobile_lobby.png' });
await page.tap('#btn-go');
await new Promise(r => setTimeout(r, 1200));
// touch-only: hold right button + fire button via touchscreen
const r1 = await page.locator('#tR').boundingBox();
const f1 = await page.locator('#tF').boundingBox();
await page.touchscreen.tap(r1.x + r1.width/2, r1.y + r1.height/2);
// press-and-hold move right
await page.evaluate(() => { document.getElementById('tR').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true})); });
await new Promise(r => setTimeout(r, 1500));
await page.evaluate(() => { document.getElementById('tR').dispatchEvent(new PointerEvent('pointerup', {bubbles:true})); });
const s = await page.evaluate(() => window.__AM());
console.log('mobile state:', JSON.stringify(s));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/mobile_game.png' });
console.log('errors:', errs);
await browser.close();
if (!s || s.mode !== 'game' || !(s.myX > 300)) { console.log('MOBILE FAIL'); process.exit(1); }
console.log('MOBILE OK');
