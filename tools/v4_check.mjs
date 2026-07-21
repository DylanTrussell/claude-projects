import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
// boss check
await page.goto('http://localhost:8787/?dev=1&warp=6900');
await new Promise(r => setTimeout(r, 2500));
try { if (await page.isVisible('#intro')) await page.click('#btn-skip', {timeout:3000}); } catch(_){}
await page.click('#btn-start'); await new Promise(r => setTimeout(r, 400));
await page.click('#btn-go'); await new Promise(r => setTimeout(r, 800));
await page.keyboard.down('KeyD'); await new Promise(r => setTimeout(r, 2200)); await page.keyboard.up('KeyD');
await new Promise(r => setTimeout(r, 5200));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v4_boss.png' });
// long gap + islands check
const p2 = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p2.on('pageerror', e => errs.push('B:'+String(e)));
await p2.goto('http://localhost:8787/?dev=1&warp=4900');
await new Promise(r => setTimeout(r, 2500));
try { if (await p2.isVisible('#intro')) await p2.click('#btn-skip', {timeout:3000}); } catch(_){}
await p2.click('#btn-start'); await new Promise(r => setTimeout(r, 400));
await p2.click('#btn-go'); await new Promise(r => setTimeout(r, 900));
await p2.keyboard.down('KeyD'); await new Promise(r => setTimeout(r, 900)); await p2.keyboard.up('KeyD');
await new Promise(r => setTimeout(r, 400));
await p2.screenshot({ path: '/home/claude/apocalypse-meow/work/v4_gap.png' });
const s = await p2.evaluate(() => window.__AM());
console.log('gap state:', JSON.stringify(s), 'errors:', errs);
await browser.close();
