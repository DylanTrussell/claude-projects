import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => console.log('[console]', m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://localhost:8787/?dev=1', { waitUntil: 'load' });
await page.waitForTimeout(1500);
const res = await page.evaluate(async () => {
  const mod = await import('./assets.js');
  const audio = mod.audio;
  audio.ensure();
  return 'sfxBus=' + !!audio.sfxBus + ' masterSfxGain=' + !!audio.masterSfxGain;
});
console.log(res);
await browser.close();
