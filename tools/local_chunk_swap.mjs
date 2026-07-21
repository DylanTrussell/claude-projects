// Rewrites public/chunks.js so each named chunk's images/audio point at
// ./local_<name>/<id>.<ext> instead of the real CDN, for local Playwright
// testing (Playwright-launched Chromium in this sandbox can't reach the CDN —
// see project notes). Run this AFTER tools/assemble.sh (which regenerates
// public/chunks.js fresh from game/chunks.js and would otherwise overwrite
// this swap). Restore the real CDN URLs before any production deploy by
// simply re-running assemble.sh with no swap.
//
// v11: generalized from a tunnel-only hardcoded version to handle any chunk
// in CHUNKS (added ptboat/boss2 alongside tunnel) — finds each top-level
// "  name: {" key inside the CHUNKS object generically instead of assuming
// tunnel is followed by a literal "\n  ptboat:".
import fs from 'fs';

const path = 'public/chunks.js';
let src = fs.readFileSync(path, 'utf8');

const chunksStart = src.indexOf('export const CHUNKS = {');
if (chunksStart === -1) { console.error('CHUNKS export not found in public/chunks.js'); process.exit(1); }
const chunksEnd = src.indexOf('\n};', chunksStart);
if (chunksEnd === -1) { console.error('could not find end of CHUNKS object'); process.exit(1); }

// every top-level "  name: {" key inside the CHUNKS body, in source order
const keyRe = /\n {2}(\w+): \{/g;
const keys = [];
let km;
while ((km = keyRe.exec(src)) && km.index < chunksEnd) {
  if (km.index > chunksStart) keys.push({ name: km[1], idx: km.index + 1 }); // +1 to skip the leading \n
}

let out = src;
let swapped = [];
// walk keys in reverse so earlier splice offsets stay valid as we edit `out`
for (let i = keys.length - 1; i >= 0; i--) {
  const { name, idx } = keys[i];
  const blockEnd = i + 1 < keys.length ? keys[i + 1].idx : chunksEnd;
  const before = out.slice(0, idx);
  let block = out.slice(idx, blockEnd);
  const after = out.slice(blockEnd);
  const localDir = './local_' + name + '/';
  const swappedBlock = block.replace(/(\w+):\s*(?:CDN|HF)\s*\+\s*'[\w.-]+\.(png|mp3)'/g, (m, key, ext) => {
    return `${key}: '${localDir}${key}.${ext}'`;
  });
  if (swappedBlock !== block) swapped.push(name);
  out = before + swappedBlock + after;
}

fs.writeFileSync(path, out, 'utf8');
console.log('swapped chunk(s) to local_<name>/ paths in public/chunks.js:', swapped.reverse().join(', ') || '(none found)');
