import { chromium } from 'playwright';
// default Chromium blocks unmuted autoplay unless flag given — test BOTH paths
for (const allow of [false, true]) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM,
    args: allow ? ['--autoplay-policy=no-user-gesture-required'] : [] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:8787/');
  await new Promise(r => setTimeout(r, 3500));
  const introShown = await page.isVisible('#intro');
  const beginShown = await page.isVisible('#btn-begin');
  const titleShown = await page.isVisible('#screen-title');
  const playing = await page.evaluate(() => { const v = document.getElementById('introvid'); return v && !v.paused && v.currentTime > 0; });
  console.log(`autoplay=${allow}: intro=${introShown} beginBtn=${beginShown} title=${titleShown} playing=${playing} errs=${errs}`);
  if (!allow && beginShown) { // click the gate, confirm film rolls with sound
    await page.click('#btn-begin');
    await new Promise(r => setTimeout(r, 1200));
    const p2 = await page.evaluate(() => { const v = document.getElementById('introvid'); return { playing: !v.paused && v.currentTime > 0, muted: v.muted }; });
    console.log('after ROLL FILM click:', JSON.stringify(p2));
    await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v5/shot_introgate.png' });
  }
  await browser.close();
}
