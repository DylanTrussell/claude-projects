// Carve-based tunnel map builder + validator. Emits grid strings for fps.js.
const W0 = 16, H0 = 14;

function blank(w, h) { return Array.from({ length: h }, () => Array(w).fill('#')); }
function carve(g, x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = '.'; }
function set(g, x, y, c) { g[y][x] = c; }

// ---------------- MAP 0 — the VC tunnel (Mittens) ----------------
// Flow: entry -> FIGHT ROOM (use the pistol!) -> grab corner -> SHOTGUN
// CHAMBER dead ahead -> gunner hall -> prison arena -> loop out to exit.
// v3: ONE spine, no bypasses. Loop-1 agent got the shotgun twice with the
// pistol still in hand and never hit the throat-grab -- the merged rooms had
// side routes around G. Now: entry -> fight room -> DOWN (only exit) -> grab
// corridor with G as the sole doorway to the shotgun chamber -> chamber ->
// hall -> prison -> loop-back exit. Corridors 2-wide on the spine (loop-1:
// wedged in 1-wide corners staring at wall texture).
const m0 = blank(W0, H0);
// entry hall (west, 2 tall)
carve(m0, 1, 1, 5, 2);
// fight room (wide, seen across)
carve(m0, 7, 1, 11, 3);
carve(m0, 6, 1, 6, 2);            // 2-wide doorway entry->fight
// secret pocket top-right; its corridor hangs off the fight room, torch-lit
carve(m0, 13, 1, 14, 1);          // pocket (sealed by D below)
carve(m0, 12, 3, 14, 3);          // corridor under it, joined to fight room
set(m0, 13, 2, 'D'); set(m0, 14, 2, 'D');
// fight room's ONLY forward exit: 2-wide shaft down to the grab corridor
carve(m0, 8, 4, 9, 5);
// grab corridor west, 2-wide; ends at the chamber doorway
carve(m0, 2, 5, 9, 6);
carve(m0, 8, 6, 9, 6);
// shotgun chamber: dead-end pocket whose ONLY doorway is the grab corner
set(m0, 2, 7, 'G');               // the doorway itself -- nobody skips it
carve(m0, 1, 8, 3, 9);            // chamber behind it
set(m0, 2, 9, 'S');
set(m0, 3, 9, 'H');               // spare shells WITH the shotgun -- you leave the grab armed
// THE GREAT HALL (rows 8-9, full width): the level's landmark. DOOM E1M1's
// navigability comes from one big room you keep re-entering from different
// sides, so you always re-orient the moment you step into it. Every branch
// below hangs off this hall, it is torch-lit at both ends, and it is
// straight, so from anywhere in it you can see where you came in.
carve(m0, 5, 8, 14, 9);
carve(m0, 4, 8, 4, 8);            // chamber -> hall doorway
// prison arena (south-east), entered from the hall's east end
carve(m0, 9, 11, 14, 12);
carve(m0, 12, 10, 12, 10);        // hall -> prison doorway
// exit corridor runs back WEST beneath the hall and surfaces beside the
// entry, so the level closes a loop instead of dead-ending somewhere new
carve(m0, 1, 11, 7, 12);
carve(m0, 8, 12, 8, 12);          // prison -> exit corridor
set(m0, 1, 12, 'E');
// spawn + cast
set(m0, 1, 1, 'P');
set(m0, 4, 2, 'c');               // entry torch
set(m0, 10, 1, 'a'); set(m0, 8, 3, 'a');   // fight room ambushers (seen across)
// Dylan: "put the barrel next to the enemy that's in the corner, and then
// make it so the barrel explodes if you shoot it, and the enemy catches
// fire." Barrel is now adjacent to the corner ambusher at (10,1), so one
// shot at the drum cooks the cat lurking beside it.
// Dylan: "put multiple barrels, two or three, to make sure you hit at least
// one." Three in the fight room, flanking BOTH ambushers, so almost any shot
// down the room cooks something.
set(m0, 11, 1, 'B'); set(m0, 9, 2, 'B'); set(m0, 7, 3, 'B');
set(m0, 13, 1, 'T'); set(m0, 14, 1, 'H');  // secret loot
set(m0, 12, 3, 'c');              // torch NEXT to the secret wall -- light draws the eye
set(m0, 3, 5, 'c');               // grab-corridor torch, lights the way west
set(m0, 1, 8, 'c');               // chamber torch (lights the prize)
set(m0, 7, 9, 'g'); set(m0, 11, 8, 'B'); set(m0, 14, 9, 'g'); // hall gunners + barrel
set(m0, 5, 8, 'H');               // resupply ON the main route (loop-3: ran dry mid-hall, run was unwinnable)
set(m0, 6, 5, 'a');               // grab-corridor lurker (before the grab: pistol still in paw)
set(m0, 9, 12, 'B'); set(m0, 10, 11, 'a'); set(m0, 13, 11, 'g'); // prison defenders
set(m0, 14, 12, 'M');             // Mittens' cell
set(m0, 4, 12, 'c'); set(m0, 5, 11, 'a');  // exit corridor: torch + one last lurker
set(m0, 10, 12, 'c');             // prison torch
// A torch at EVERY junction and at both ends of the great hall. Dylan got
// lost and one room read as pointless; light is the cheapest wayfinding
// there is -- each junction becomes a place you recognise on the way back,
// which is exactly how E1M1 keeps you oriented without a map.
set(m0, 13, 8, 'c');              // hall east end (by the prison door)
set(m0, 9, 5, 'c');               // top of the shaft down from the fight room
set(m0, 2, 6, 'c');               // grab-corridor west end, right above the G doorway
set(m0, 1, 11, 'c');              // where the exit corridor turns for the light

// ---------------- MAP 1 — the rat nest ----------------
const W1 = 14, H1 = 13;
const m1 = blank(W1, H1);
carve(m1, 1, 1, 4, 2);            // entry
carve(m1, 1, 3, 1, 6);            // west spine
carve(m1, 6, 1, 8, 3);            // north chamber
carve(m1, 5, 2, 5, 2);            // doorway
carve(m1, 10, 1, 12, 1);          // NE corridor
carve(m1, 9, 1, 9, 1);
carve(m1, 12, 2, 12, 5);          // east spine
carve(m1, 7, 4, 7, 5);            // chamber -> core
carve(m1, 5, 5, 12, 5);           // mid corridor
carve(m1, 6, 6, 8, 8);            // CORE room (raygun)
carve(m1, 1, 7, 4, 7);            // west link
carve(m1, 1, 8, 1, 11);
carve(m1, 5, 7, 5, 7);            // doorway west->core
carve(m1, 9, 7, 11, 7);           // east pocket
carve(m1, 10, 8, 10, 10);
carve(m1, 1, 11, 11, 11);         // south corridor
set(m1, 1, 11, 'E');
set(m1, 1, 1, 'P');
set(m1, 3, 2, 'c'); set(m1, 7, 1, 'a'); set(m1, 8, 2, 'B');
set(m1, 12, 1, 'T');
set(m1, 6, 5, 'g'); set(m1, 11, 5, 'a');
set(m1, 7, 7, 'R'); set(m1, 6, 8, 'B'); set(m1, 8, 6, 'a');
set(m1, 3, 7, 'c'); set(m1, 10, 9, 'g'); set(m1, 10, 10, 'c');
set(m1, 4, 11, 'c'); set(m1, 7, 11, 'a'); set(m1, 9, 11, 'B');

// ---------------- validate ----------------
function bfs(grid, sx, sy, solidSet) {
  const seen = new Set([sx + ',' + sy]); const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[0].length) continue;
      if (solidSet.has(grid[ny][nx])) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}
function check(name, grid, needs) {
  const errs = [];
  const w = grid[0].length;
  const find = (ch) => { const out = []; for (let y = 0; y < grid.length; y++) for (let x = 0; x < w; x++) if (grid[y][x] === ch) out.push([x, y]); return out; };
  const P = find('P'), E = find('E');
  if (P.length !== 1) errs.push(`P count ${P.length}`);
  if (E.length !== 1) errs.push(`E count ${E.length}`);
  for (const ch of needs) if (!find(ch).length) errs.push(`missing '${ch}'`);
  const [px, py] = P[0];
  const open = bfs(grid, px, py, new Set(['#', 'D']));
  const openAll = bfs(grid, px, py, new Set(['#']));
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < w; x++) {
    const c = grid[y][x];
    if (c === '#' || c === 'D') continue;
    if (!openAll.has(x + ',' + y)) errs.push(`(${x},${y})='${c}' unreachable`);
  }
  const secretCells = [...openAll].filter(k => !open.has(k));
  if (find('D').length) {
    if (!secretCells.length) errs.push('secret leaks (no sealed pocket)');
    const loot = secretCells.some(k => { const [x, y] = k.split(',').map(Number); return 'TH'.includes(grid[y][x]); });
    if (!loot) errs.push('secret pocket has no loot');
    for (const k of secretCells) { const [x, y] = k.split(',').map(Number); if ('aMgSER'.includes(grid[y][x])) errs.push(`critical '${grid[y][x]}' sealed at (${x},${y})`); }
  }
  for (const [ax, ay] of find('a')) if (Math.abs(ax - px) + Math.abs(ay - py) < 4) errs.push(`ambusher (${ax},${ay}) near spawn`);
  for (const [gx, gy] of find('G')) if (Math.abs(gx - px) + Math.abs(gy - py) < 3) errs.push(`grab near spawn`);
  // THE check the old validator was missing: is G a genuine cut vertex? Wall
  // it off and everything past it (shotgun, Mittens, exit) must become
  // unreachable. Without this, "unskippable grab" was an unverified claim --
  // and it was false: loop 2 walked around it.
  const G = find('G');
  if (G.length) {
    const [gx, gy] = G[0];
    const walled = grid.map(r => r.slice());
    walled[gy][gx] = '#';
    const past = bfs(walled, px, py, new Set(['#']));
    for (const ch of ['S', 'M', 'E']) {
      for (const [x, y] of find(ch)) {
        if (past.has(x + ',' + y)) errs.push(`'${ch}' at (${x},${y}) reachable WITHOUT the grab — G is not a choke`);
      }
    }
  }
  console.log(`${name}: ${errs.length ? 'FAIL' : 'OK'} (${w}x${grid.length}, secret: ${secretCells.length})`);
  for (const e of errs) console.log('  - ' + e);
  return !errs.length;
}
const ok0 = check('MAP0', m0, ['G','S','M','c','B','g','a','T','H']);
const ok1 = check('MAP1', m1, ['R','c','B','g','a']);
console.log('\nMAP0:'); for (const r of m0) console.log("      '" + r.join('') + "',");
console.log('MAP1:'); for (const r of m1) console.log("      '" + r.join('') + "',");
process.exit(ok0 && ok1 ? 0 : 1);
