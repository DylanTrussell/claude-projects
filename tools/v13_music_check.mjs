// v13: verify the intro-film -> level music handoff.
//
// NOTE ON WHAT THIS CAN AND CANNOT TEST. The sandbox Chromium build ships
// without an H.264 decoder, so intro.mp4 fails with MediaError code 4 and the
// film cannot actually play here. This test therefore drives the 'ended' path
// directly instead of watching a real playthrough. That is the right target
// anyway: the bug was never in the video, it was that the 'ended' handler runs
// with no user gesture in the stack, so the AudioContext stays suspended and
// music() silently does nothing.
//
// Launched WITHOUT --autoplay-policy=no-user-gesture-required so the browser
// enforces the real gesture requirement and the bug can actually reproduce.
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://127.0.0.1:8787/?dev=1';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await b.newPage();
const errs = [];
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto(URL, { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => document.getElementById('intro')?.style.display === 'flex', { timeout: 60000 });

const readAudio = () => pg.evaluate(async () => {
  const m = await import('./assets.js');
  return {
    mode: window.__AM ? window.__AM().mode : '?',
    ctxState: m.audio.ctx ? m.audio.ctx.state : 'none',
    pending: m.audio.pendingMusic,
    playing: m.audio.playingMusic,
    hasSrc: !!m.audio.musicSrc,
  };
});

const before = await readAudio();

// Fire the exact path a completed film takes: no click, no keypress.
await pg.evaluate(() => document.getElementById('introvid').dispatchEvent(new Event('ended')));
await pg.waitForTimeout(600);
const afterEnded = await readAudio();

// Now the player touches a control for the first time. Pre-fix this changed
// nothing (music was never re-issued); post-fix unlockMusic() replays it.
await pg.keyboard.press('KeyD');
await pg.waitForTimeout(800);
const afterInput = await readAudio();

console.log('before film ends :', JSON.stringify(before));
console.log('after ended      :', JSON.stringify(afterEnded));
console.log('after first input:', JSON.stringify(afterInput));
console.log('console errors   :', errs.length ? errs.slice(0, 4) : 'none');

// The contract: whatever the context was doing at 'ended', the level must be
// running and music must be genuinely sounding by the time the player has
// pressed a single key.
const ok = afterEnded.mode === 'game'
  && afterEnded.pending === 'music_rock'
  && afterInput.ctxState === 'running'
  && afterInput.playing === 'music_rock'
  && afterInput.hasSrc;
console.log(ok ? 'RESULT: MUSIC OK' : 'RESULT: MUSIC FAIL');
await b.close();
process.exit(ok ? 0 : 1);
