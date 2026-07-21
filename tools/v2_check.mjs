import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8787/?dev=1');
await new Promise(r => setTimeout(r, 2500));
try { if (await page.isVisible('#intro')) await page.click('#btn-skip', {timeout:3000}); } catch(_){}
await page.click('#btn-start');
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v2_brief.png' });
await page.click('#btn-go');
await new Promise(r => setTimeout(r, 1800)); // mid-insertion: heli flying in
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v2_insertion.png' });
await new Promise(r => setTimeout(r, 2400)); // ambush moment
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v2_ambush.png' });
const s1 = await page.evaluate(() => window.__AM());
console.log('during opening:', JSON.stringify(s1));
await new Promise(r => setTimeout(r, 2200)); // control unlock
// walk right into first trap zone at 1180 to test blood
await page.keyboard.down('KeyD');
await new Promise(r => setTimeout(r, 2800));
await page.keyboard.up('KeyD');
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v2_trap.png' });
const s2 = await page.evaluate(() => window.__AM());
console.log('after walk:', JSON.stringify(s2));
console.log('errors:', errs);
await browser.close();
