import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function checkRail(url, waitMs, outPrefix) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log(`[pageerror ${outPrefix}]`, e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const skipBtn = await page.$('#btn-skip');
  if (skipBtn && await skipBtn.isVisible()) { await skipBtn.click(); await page.waitForTimeout(800); }
  await page.mouse.click(640, 360);
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: `${outPrefix}.png` });
  console.log('saved', outPrefix);
  await page.close();
}

await checkRail('http://localhost:8787/?dev=1&rail=ptboat', 33000, 'shot_ptboat2');

await browser.close();
