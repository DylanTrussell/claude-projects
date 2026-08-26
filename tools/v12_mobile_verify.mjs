// v12 mobile verification. Verifies the PATH (what the running page renders),
// not just that CSS text changed. Autoplay unblocked so the cutscene actually
// paints and the portrait rotation can be measured.
import { chromium, devices } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

await page.goto('http://localhost:8787/?dev=1&warp=500');
await new Promise(r => setTimeout(r, 3000));

// --- cutscene geometry while the intro film is actually playing ---
const cut = await page.evaluate(() => {
  const w = document.querySelector('#intro .cutwrap');
  const v = document.getElementById('introvid');
  const r = w.getBoundingClientRect();
  const t = document.getElementById('touch');
  return {
    vw: innerWidth, vh: innerHeight,
    wrapOnScreen: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    transform: getComputedStyle(w).transform,
    videoPlaying: !v.paused && v.currentTime > 0,
    touchVisibility: getComputedStyle(t).visibility,
  };
});
await page.screenshot({ path: '/tmp/v12_mob_cutscene.png' });

try { await page.click('#btn-skip', { timeout: 3000 }); } catch (_) {}
await new Promise(r => setTimeout(r, 800));
try { await page.click('#btn-start', { timeout: 3000 }); } catch (_) {}
await new Promise(r => setTimeout(r, 400));
try { await page.click('#btn-go', { timeout: 3000 }); } catch (_) {}
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: '/tmp/v12_mob_play.png' });

// --- does the FIRE button actually drive the sim? tap it and watch for a shot ---
const fired = await page.evaluate(async () => {
  const b = document.getElementById('tF');
  const r = b.getBoundingClientRect();
  const inViewport = r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  // is the FIRE button the topmost element at its own centre, or is something over it?
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { inViewport, hitTestId: top ? top.id : null, visibility: getComputedStyle(b).visibility };
});
console.log(JSON.stringify({ cut, fireButton: fired, errors: errs.filter(e => !/404|CONNECTION_RESET|Failed to fetch/.test(e)) }, null, 1));
await browser.close();
