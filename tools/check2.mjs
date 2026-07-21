import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8787/?dev=1');
await new Promise(r => setTimeout(r, 2500));
try { if (await page.isVisible('#intro')) await page.click('#btn-skip', {timeout:3000}); } catch(_){}
await page.click('#btn-start'); await new Promise(r => setTimeout(r, 400));
await page.click('#btn-go'); await new Promise(r => setTimeout(r, 2500));
// aim up + fire
await page.keyboard.down('KeyW'); await page.keyboard.down('KeyJ');
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v5/shot_aimup.png' });
await page.keyboard.up('KeyJ'); await page.keyboard.up('KeyW');
// wait for the ambient air-war heli (first spawn ~7s after render start, crosses ~8s)
await new Promise(r => setTimeout(r, 7000));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v5/shot_airwar1.png' });
await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v5/shot_airwar2.png' });
console.log('errors:', errs);
await browser.close();
