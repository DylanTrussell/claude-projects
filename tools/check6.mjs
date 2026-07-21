import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
// 1) tunnel with new art
await page.goto('http://localhost:8787/?dev=1&warp=3200');
await new Promise(r => setTimeout(r, 2200));
try { if (await page.isVisible('#btn-skip')) await page.click('#btn-skip', {timeout:2500}); } catch(_){}
await new Promise(r => setTimeout(r, 1200));
await page.keyboard.down('KeyD'); await new Promise(r => setTimeout(r, 800)); await page.keyboard.up('KeyD');
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v6/shot_tunnel1.png' });
await page.keyboard.down('KeyW'); await new Promise(r => setTimeout(r, 1300)); 
await page.keyboard.down('KeyJ'); await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v6/shot_tunnel2.png' });
await page.keyboard.up('KeyJ'); await page.keyboard.up('KeyW');
// walk toward the grab corner: keep going forward with turns via bot-ish wiggle
await page.keyboard.down('KeyW');
for (let i = 0; i < 7; i++) {
  await page.keyboard.down('KeyA'); await new Promise(r => setTimeout(r, 190)); await page.keyboard.up('KeyA');
  await new Promise(r => setTimeout(r, 420));
  await page.keyboard.down('KeyD'); await new Promise(r => setTimeout(r, 190)); await page.keyboard.up('KeyD');
  await new Promise(r => setTimeout(r, 420));
}
await page.keyboard.up('KeyW');
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v6/shot_tunnel3.png' });
console.log('tunnel errs:', errs);
// 2) doorgun rail
await page.goto('http://localhost:8787/?dev=1&rail=doorgun');
await new Promise(r => setTimeout(r, 2200));
try { if (await page.isVisible('#btn-skip')) await page.click('#btn-skip', {timeout:2500}); } catch(_){}
await new Promise(r => setTimeout(r, 3500));
await page.keyboard.down('KeyJ'); await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v6/shot_doorgun.png' });
await page.keyboard.up('KeyJ');
// 3) skyraider rail
await page.goto('http://localhost:8787/?dev=1&rail=skyraider');
await new Promise(r => setTimeout(r, 2200));
try { if (await page.isVisible('#btn-skip')) await page.click('#btn-skip', {timeout:2500}); } catch(_){}
await new Promise(r => setTimeout(r, 3500));
await page.keyboard.down('KeyJ'); await new Promise(r => setTimeout(r, 800));
await page.keyboard.down('KeyK'); await new Promise(r => setTimeout(r, 120)); await page.keyboard.up('KeyK');
await new Promise(r => setTimeout(r, 1300));
await page.screenshot({ path: '/home/claude/apocalypse-meow/work/v6/shot_skyraider.png' });
console.log('rail errs:', errs);
await browser.close();
