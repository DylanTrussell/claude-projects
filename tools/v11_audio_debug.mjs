import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.stack || e.message));
await page.goto('http://localhost:8787/?dev=1', { waitUntil: 'load' });
await page.waitForTimeout(1500);
const res = await page.evaluate(async () => {
  const mod = await import('./assets.js');
  const audio = mod.audio;
  audio.ensure();
  try {
    audio.sfx('sfx_shot', 1);
    return 'ok, masterSfxGain=' + (audio.masterSfxGain ? audio.masterSfxGain.constructor.name : 'undefined') + ' sfxBus=' + (audio.sfxBus ? audio.sfxBus.constructor.name : 'undefined');
  } catch (e) {
    return 'ERROR: ' + e.stack;
  }
});
console.log(res);
await browser.close();
