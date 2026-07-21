import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8787/?room=bosscheck&dev=1&warp=6900');
await new Promise(r => setTimeout(r, 2500));
try { if (await page.isVisible('#intro')) await page.click('#btn-skip'); } catch(_){}
await page.click('#btn-start'); await new Promise(r => setTimeout(r, 500));
await page.click('#btn-go'); await new Promise(r => setTimeout(r, 800));
await page.keyboard.down('KeyD');
await new Promise(r => setTimeout(r, 2600));
await page.keyboard.up('KeyD');
await new Promise(r => setTimeout(r, 4500)); // boss enters, attacks telegraph
await page.keyboard.down('KeyJ');
await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/boss_check.png' });
const s = await page.evaluate(() => window.__AM());
console.log('state:', JSON.stringify(s), 'errors:', errs);
await browser.close();
