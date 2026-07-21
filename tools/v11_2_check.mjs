import { chromium } from 'playwright';
const RAIL = process.argv[2] || 'doorgun';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
await page.goto(`http://localhost:8787/?dev=1&rail=${RAIL}`);
await new Promise(r => setTimeout(r, 2000));
try { if (await page.isVisible('#intro')) await page.click('#btn-skip', {timeout:3000}); } catch(_){}
try { await page.click('#btn-start', {timeout:3000}); } catch(_){}
await new Promise(r => setTimeout(r, 400));
try { await page.click('#btn-go', {timeout:3000}); } catch(_){}
await new Promise(r => setTimeout(r, 1200));
// aim UP (W) briefly, screenshot, then aim DOWN, screenshot -- to see the gunner sprite rotate
await page.keyboard.down('KeyA');
await new Promise(r => setTimeout(r, 500));
await page.keyboard.up('KeyA');
await page.screenshot({ path: `/tmp/v11_2_${RAIL}_aimA.png` });
await page.keyboard.down('KeyD');
await new Promise(r => setTimeout(r, 1000));
await page.keyboard.up('KeyD');
await page.screenshot({ path: `/tmp/v11_2_${RAIL}_aimD.png` });
// fire to see muzzle burst on the new sprite
await page.keyboard.down('Space');
await new Promise(r => setTimeout(r, 150));
await page.screenshot({ path: `/tmp/v11_2_${RAIL}_fire.png` });
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: `/tmp/v11_2_${RAIL}_later.png` });
await page.keyboard.up('Space');
console.log('errors:', errs.filter(e => !e.includes('404') && !e.includes('CONNECTION_RESET') && !e.includes('Failed to fetch')));
await browser.close();
