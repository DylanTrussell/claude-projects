import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
try {
  await page.goto('https://soft-cabin-573.higgsfield.gg/?__raw=1&dev=1&warp=3300', { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/live_prod_check.png' });
  console.log('SUCCESS');
} catch (e) {
  console.log('FAILED:', e.message);
}
await browser.close();
