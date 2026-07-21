// subtitle overlay logic check: drive the video element's currentTime by hand
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8787/');
await new Promise(r => setTimeout(r, 3000));
const r = await page.evaluate(() => {
  const iv = document.getElementById('introvid');
  const sub = document.getElementById('introsub');
  const fake = (t) => { Object.defineProperty(iv, 'currentTime', { value: t, configurable: true }); iv.dispatchEvent(new Event('timeupdate')); return sub.textContent; };
  return { at2: fake(2), at5: fake(5.5), at8: fake(8), introVisible: getComputedStyle(document.getElementById('intro')).display !== 'none' };
});
console.log(JSON.stringify(r), 'errs:', errs);
await browser.close();
