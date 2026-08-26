// Verify the PATH, not the artifact: load the running game and record every
// URL it actually fetches, then diff against what chunks.js declares.
import { chromium } from 'playwright';
import { CHUNKS, VIDEO_URLS } from '../game/chunks.js';

const BASE = process.argv[2] || 'http://localhost:8787';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const fetched = new Set();
page.on('request', r => fetched.add(r.url()));

// visit every section that owns a chunk so each ensureChunk() gets a chance to run
for (const [q, label] of [['?dev=1&warp=3100', 'tunnel'], ['?dev=1&rail=doorgun', 'doorgun'],
                          ['?dev=1&rail=skyraider', 'skyraider'], ['?dev=1&rail=ptboat', 'ptboat'],
                          ['?dev=1&rail=parley', 'boss2']]) {
  await page.goto(BASE + '/' + q);
  await new Promise(r => setTimeout(r, 1500));
  try { if (await page.isVisible('#intro')) await page.click('#btn-skip', {timeout:2000}); } catch(_){}
  try { await page.click('#btn-start', {timeout:2000}); } catch(_){}
  try { await page.click('#btn-go', {timeout:2000}); } catch(_){}
  await new Promise(r => setTimeout(r, 3500));
}

const declared = [];
for (const [name, c] of Object.entries(CHUNKS)) {
  for (const [id, u] of Object.entries(c.images || {})) declared.push([`${name}.images.${id}`, u]);
  for (const [id, u] of Object.entries(c.audio || {})) declared.push([`${name}.audio.${id}`, u]);
}
for (const [id, u] of Object.entries(VIDEO_URLS)) declared.push([`VIDEO_URLS.${id}`, u]);

const never = declared.filter(([, u]) => !fetched.has(u));
console.log(`declared assets: ${declared.length}`);
console.log(`total URLs the game actually requested: ${fetched.size}`);
console.log(`\nDECLARED BUT NEVER FETCHED (${never.length}):`);
for (const [k, u] of never) console.log('  ' + k + '\n    ' + u);
await browser.close();
