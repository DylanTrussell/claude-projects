import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8787/?dev=1&warp=4150');
await new Promise(r => setTimeout(r, 2500));
try { if (await page.isVisible('#intro')) await page.click('#btn-skip', {timeout:3000}); } catch(_){}
await page.click('#btn-start'); await new Promise(r => setTimeout(r, 400));
await page.click('#btn-go'); await new Promise(r => setTimeout(r, 1500));
// fight aliens: hold fire, throw a grenade for the shrapnel/explosion check
await page.keyboard.down('KeyD'); await new Promise(r => setTimeout(r, 900)); await page.keyboard.up('KeyD');
await page.keyboard.down('KeyJ'); await new Promise(r => setTimeout(r, 1600));
await page.keyboard.press('KeyK');
await new Promise(r => setTimeout(r, 550));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v3_boom.png' });
await page.keyboard.up('KeyJ');
await new Promise(r => setTimeout(r, 2600));
const s = await page.evaluate(() => window.__AM());
console.log('state:', JSON.stringify(s));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v3_after.png' });
console.log('errors:', errs);
await browser.close();
