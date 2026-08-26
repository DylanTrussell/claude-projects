// End-to-end: does TAPPING the on-screen FIRE button actually make the game
// shoot? (Verifying the path, not the artifact — the button being present and
// hit-testable is not the same as it driving the sim.)
import { chromium, devices } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto('http://localhost:8787/?dev=1&warp=500&skiprail=1');
await new Promise(r => setTimeout(r, 3000));
try { await page.click('#btn-skip', { timeout: 2500 }); } catch (_) {}
await new Promise(r => setTimeout(r, 600));
try { await page.click('#btn-start', { timeout: 2500 }); } catch (_) {}
await new Promise(r => setTimeout(r, 400));
try { await page.click('#btn-go', { timeout: 2500 }); } catch (_) {}
await new Promise(r => setTimeout(r, 2500));

const box = await page.locator('#tF').boundingBox();
const shots = [];
// hold FIRE via real touch events and sample the canvas repeatedly
await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 6; i++) {
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await new Promise(r => setTimeout(r, 120));
  shots.push(await page.locator('#c').screenshot());
}
const fs = await import('fs');
shots.forEach((b, i) => fs.writeFileSync(`/tmp/v12_fire_${i}.png`, b));
console.log('captured', shots.length, 'frames while tapping FIRE');
await browser.close();
