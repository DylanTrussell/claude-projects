import { chromium } from 'playwright';
import fs from 'fs';
const webm = fs.readFileSync('/tmp/intro_test.webm');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
await page.route('**/*.mp4', r => r.fulfill({ status: 200, contentType: 'video/webm', body: webm }));
await page.goto('http://localhost:8787/?dev=1');
await new Promise(r => setTimeout(r, 4000));
console.log(JSON.stringify(await page.evaluate(() => {
  const w = document.querySelector('#intro .cutwrap'); const r = w.getBoundingClientRect();
  return { transform: getComputedStyle(w).transform, wrap: {w:Math.round(r.width),h:Math.round(r.height)},
           touchDisplay: getComputedStyle(document.getElementById('touch')).display,
           coarse: matchMedia('(pointer: coarse)').matches };
}), null, 1));
await page.screenshot({ path: '/tmp/v12_desktop_film.png' });
console.log('errors:', errs.filter(e => !/404|CONNECTION_RESET|Failed to fetch/.test(e)));
await browser.close();
