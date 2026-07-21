import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8787/?dev=1', { waitUntil: 'load' });
await page.waitForTimeout(1500);
const res = await page.evaluate(async () => {
  const mod = await import('./assets.js');
  const audio = mod.audio;
  try {
    audio.ensure();
    return 'ensure ok, ctx=' + !!audio.ctx + ' sfxBus=' + !!audio.sfxBus + ' masterSfxGain=' + !!audio.masterSfxGain;
  } catch (e) {
    return 'ensure THREW: ' + e.stack;
  }
});
console.log(res);
await browser.close();
