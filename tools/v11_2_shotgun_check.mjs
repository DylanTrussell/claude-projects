import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
await page.goto('http://localhost:8787/?dev=1&warp=2900');
await new Promise(r => setTimeout(r, 2000));
try { if (await page.isVisible('#intro')) await page.click('#btn-skip', {timeout:3000}); } catch(_){}
try { await page.click('#btn-start', {timeout:3000}); } catch(_){}
await new Promise(r => setTimeout(r, 400));
try { await page.click('#btn-go', {timeout:3000}); } catch(_){}
await new Promise(r => setTimeout(r, 2500));
let st = await page.evaluate(() => window.__AM ? window.__AM() : null);
console.log('state:', JSON.stringify(st));
// force-teleport to the shotgun crate if a tunnel dev hook exists, then cycle weapon to shotgun
await page.evaluate(() => { if (window.__AMtp) window.__AMtp(400, 0); });
await new Promise(r => setTimeout(r, 500));
// try cycling weapon with 'Q' or similar - check state first
st = await page.evaluate(() => window.__AM ? window.__AM() : null);
console.log('state2:', JSON.stringify(st));
await page.screenshot({ path: '/tmp/v11_2_tunnel_1.png' });
// try pressing E / weapon-switch keys a few times to find shotgun
for (const key of ['KeyQ','KeyE','Digit2','Digit3']) {
  await page.keyboard.press(key);
  await new Promise(r => setTimeout(r, 200));
}
st = await page.evaluate(() => window.__AM ? window.__AM() : null);
console.log('state3:', JSON.stringify(st));
await page.screenshot({ path: '/tmp/v11_2_tunnel_2.png' });
console.log('errors:', errs.filter(e => !e.includes('404') && !e.includes('CONNECTION_RESET') && !e.includes('Failed to fetch')));
await browser.close();
