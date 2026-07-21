import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext()).newPage();
await page.goto('http://localhost:8787/');
await new Promise(r => setTimeout(r, 3000));
const d = await page.evaluate(async () => {
  const v = document.getElementById('introvid');
  let playErr = null;
  try { await v.play(); } catch (e) { playErr = String(e); }
  return {
    canH264: document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
    err: v.error && { code: v.error.code, msg: v.error.message },
    readyState: v.readyState, networkState: v.networkState, src: v.currentSrc.split('/').pop(),
    playErr, paused: v.paused, t: v.currentTime,
  };
});
console.log(JSON.stringify(d, null, 1));
await browser.close();
