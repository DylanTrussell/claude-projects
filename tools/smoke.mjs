// Two-player co-op smoke test against the local harness (netcode gate §6).
import { chromium } from 'playwright';

const URL = 'http://localhost:8787/?room=smoketest&dev=1';
const errsA = [], errsB = [];

function watch(page, sink, tag) {
  page.on('console', (m) => { if (m.type() === 'error') sink.push(m.text()); });
  page.on('pageerror', (e) => sink.push(String(e)));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function state(page) { return await page.evaluate(() => window.__AM ? window.__AM() : null); }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const A = await ctxA.newPage(); watch(A, errsA, 'A');
const B = await ctxB.newPage(); watch(B, errsB, 'B');

console.log('== load host ==');
await A.goto(URL);
await sleep(2500);
// skip intro if visible
if (await A.$('#intro') && await A.isVisible('#intro')) await A.click('#btn-skip');
await A.click('#btn-start');
await sleep(800);
let sA = await state(A);
console.log('A after lobby:', JSON.stringify(sA));

console.log('== load guest ==');
await B.goto(URL);
await sleep(2500);
if (await B.$('#intro') && await B.isVisible('#intro')) await B.click('#btn-skip');
await B.click('#btn-start');
await sleep(800);
// guest picks VC + ready
await B.click('#hero-vc');
await B.click('#btn-ready');
await sleep(600);
let sB = await state(B);
console.log('B after ready:', JSON.stringify(sB));

console.log('== host starts ==');
await A.click('#btn-go');
await sleep(1500);
sA = await state(A); sB = await state(B);
console.log('A:', JSON.stringify(sA));
console.log('B:', JSON.stringify(sB));
if (!sA || sA.mode !== 'game') { console.log('FAIL: host not in game'); }
if (!sB || sB.mode !== 'game') { console.log('FAIL: guest not in game'); }

console.log('== movement: host runs right 2s ==');
const x0 = sA.myX;
await A.keyboard.down('KeyD');
await sleep(2000);
await A.keyboard.up('KeyD');
sA = await state(A);
console.log(`host x ${x0} -> ${sA.myX}`);
if (!(sA.myX > x0 + 200)) console.log('FAIL: host did not move');

console.log('== movement: guest runs right 2s (input relay) ==');
sB = await state(B);
const gx0 = sB.myX;
await B.keyboard.down('KeyD');
await sleep(2000);
await B.keyboard.up('KeyD');
await sleep(400);
sB = await state(B);
console.log(`guest x ${gx0} -> ${sB.myX}`);
if (!(sB.myX > gx0 + 150)) console.log('FAIL: guest did not move via relay');

console.log('== host fires ==');
await A.keyboard.down('KeyJ'); await sleep(700); await A.keyboard.up('KeyJ');
sA = await state(A);
console.log('bullets seen by host:', sA.bullets, 'score', sA.score);

console.log('== guest refresh reconnect ==');
await B.reload();
await sleep(3500);
sB = await state(B);
console.log('B after refresh:', JSON.stringify(sB));
if (!sB || sB.mode !== 'game') console.log('FAIL: guest did not resume into game');

console.log('== spectator: third tab ==');
const ctxC = await browser.newContext();
const Cp = await ctxC.newPage();
await Cp.goto(URL);
await sleep(2500);
try { if (await Cp.isVisible('#intro')) await Cp.click('#btn-skip', { timeout: 2000 }); } catch (_) {}
try { if (await Cp.isVisible('#btn-start')) await Cp.click('#btn-start', { timeout: 2000 }); } catch (_) {}
await sleep(1200);
const sC = await state(Cp);
console.log('C (spectator):', JSON.stringify(sC));
if (sC && sC.role === 'spectator' && sC.mode === 'game') console.log('spectator OK');
else console.log('WARN: spectator state', sC && sC.role, sC && sC.mode);

await A.screenshot({ path: 'work/smoke_host.png' });
await B.screenshot({ path: 'work/smoke_guest.png' });

console.log('console errors A:', errsA.slice(0, 6));
console.log('console errors B:', errsB.slice(0, 6));
await browser.close();
console.log('SMOKE DONE');
