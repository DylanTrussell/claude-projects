import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8787/?dev=1', { waitUntil: 'load' });
await page.waitForTimeout(1500);
const res = await page.evaluate(async () => {
  const mod = await import('./assets.js');
  const audio = mod.audio;
  audio.ensure();
  const g = audio.masterSfxGain;
  return {
    masterSfxGain: g ? g.constructor.name : 'undefined',
    isAudioNode: g instanceof AudioNode,
    ctxState: audio.ctx.state,
    sndShot: typeof mod.SND['sfx_shot'],
    sndShotIsBuffer: mod.SND['sfx_shot'] instanceof AudioBuffer,
  };
});
console.log(JSON.stringify(res, null, 2));
await browser.close();
