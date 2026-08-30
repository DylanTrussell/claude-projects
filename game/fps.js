// DOOM-in-the-tunnels v2: a Wolfenstein-style raycaster sub-game.
// Lowres 320x180 retro renderer with textured floor/ceiling casting, wall
// variants (dirt / bamboo shoring / blood), a real flashlight, knife-cat
// ambushers that burst out of the walls, DOOM gore, a scripted throat-rip
// setpiece, and a light-shaft exit with a crawl-out animation.
import { CFG, C, PAL, W, H } from './config.js';
import { IMG, SHEET, drawImg } from './assets.js';

const FOV = 66 * Math.PI / 180;
const RW = 320, RH = 180;       // internal retro resolution
const HORIZON = RH / 2;
const MOVE = 3.1;               // cells/sec
const TURN = 2.6;               // rad/sec
const PISTOL_MAG = 10;          // v10: pistol now has a real magazine + reload beat
const PISTOL_RELOAD_MS = 820;
const SHOTGUN_RACK_MS = [150, 450]; // window inside pumpT where the reload/rack sprite shows

// v13.1 map rebuild (Dylan: "rebuild the tunnel outright... think wolfenstein,
// doom, really make it fun"). The old grids were dense 1-wide mazes with
// ambushers parked adjacent to doorways -- a playtester burned 8 lives in
// there without ever seeing what killed them and called it "an unlit blurry
// maze with no wayfinding". These are DOOM-shaped instead: rooms and loops,
// torches as landmarks along the main path, ambushers placed ACROSS rooms so
// they burst at range, and both grids are machine-validated (connectivity,
// secret pocket sealed, nothing critical behind a secret, no ambush within 4
// tiles of spawn) rather than eyeballed.
// Legend:  P start   E exit shaft   G throat-grab corner   M Mittens
//          a knife-cat in a wall niche (glowing eyes telegraph it now)
//          g GUNNER — stands guard, visible aim windup, dodgeable bolt
//          B explosive barrel (chains; hurts everyone)
//          D secret wall — claw the gold scratches to open it
//          S shotgun   T tuna   H shell box   R alien raygun   c torch
// v13.2 maps (built + validated by scratchpad mapbuild.mjs, not eyeballed):
// the round-1 rebuild put the throat-grab BEFORE any enemy, so the pistol was
// taken away unused -- "you need to be able to use the gun first" (Dylan).
// New flow: entry -> open FIGHT ROOM (two telegraphed ambushers + a barrel,
// the pistol gets a real workout) -> grab corner -> torch-lit SHOTGUN chamber
// immediately after (a gunner snipes across the hall while you take it) ->
// gunner hall -> prison arena (Mittens) -> loop-back exit corridor.
export const MAPS = [
  { // 0 — the VC tunnel: rescue Pvt. Mittens.
    enemies: 'vc',
    grid: [
      '################',
      '#P........aB#TH#',
      '#...c....B..#DD#',
      '#######Ba...c..#',
      '########..######',
      '##.c..a..c######',
      '##c.......######',
      '##G#############',
      // barrel moved 11 -> 14: at 11 it sat 3.2 cells from the nearest gunner,
      // outside its own 1.9-cell blast, so it could never light anybody. Dylan
      // asked for the barrel to be next to the enemy in the corner; at 14 it is
      // directly above the gunner at (14,9).
      '#c...H.......cB#',
      '#.SH#..g......g#',
      '############.###',
      '#c...a..#.a..g.#',
      '#E..c....Bc...M#',
      '################',
    ],
    objective: 'fpsObjective0',
  },
  { // 1 — the rat nest (optional): grab their tech, get out
    enemies: 'rat',
    grid: [
      '##############',
      '#P...#.a....T#',
      '#..c....B###.#',
      '#.####...###.#',
      '#.#####.####.#',
      '#.###.g....a.#',
      '#.####..a#####',
      '#..c...R....##',
      // same fix: 2.8 cells from the nearest enemy is outside the blast. At 10
      // it sits directly on top of the gunner at (10,9).
      '#.####...#B###',
      '#.########g###',
      '#.########c###',
      // and the last one: at 9 it was exactly 2.0 cells from the ambusher at 7,
      // a tenth of a cell outside the 1.9 blast. Moved to 8, right beside him.
      '#E..c..aB...##',
      '##############',
    ],
    objective: 'fpsObjective1',
  },
];

function cellAt(grid, x, y) {
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return '#';
  return grid[y][x];
}

export class Tunnel {
  constructor(mapIdx) {
    this.mapIdx = mapIdx;
    const def = MAPS[mapIdx];
    this.def = def;
    // char arrays, not strings: secret 'D' walls mutate to '.' when clawed open
    this.grid = def.grid.map(r => r.split(''));
    this.enemyKind = def.enemies;
    this.events = [];
    this.done = false;
    this.result = { rescued: false, shotgun: false, loot: 0, cleared: false, kills: 0, secrets: 0 };
    this.px = 1.5; this.py = 1.5; this.ang = 0;
    this.enemies = []; this.items = [];
    this.torches = [];                // 'c' cells: flame landmarks along the main path
    this.bolts = [];                  // gunner projectiles {x,y,vx,vy,t}
    this.pops = [];                   // score popups {t,n}
    this.blasts = [];                 // explosion-sheet billboards {x,y,t,s,z}
    this.flash = 0;                   // white bloom after a blast
    this.hitStop = 0;                 // brief freeze on impact
    this.mittens = null; this.exit = null; this.grabCell = null;
    this.bloodWalls = new Set();      // cells whose wall turned bloody
    this.pools = [];                  // floor blood pools [x,y,r]
    this.gore = [];                   // flying blood particles {x,y,z,vx,vy,vz,t}
    this.casings = [];                // 2D screen-space shell casings
    this.splats = [];                 // screen blood splats {x,y,r,t}
    for (let y = 0; y < this.grid.length; y++) {
      for (let x = 0; x < this.grid[0].length; x++) {
        const c = this.grid[y][x];
        const cx = x + 0.5, cy = y + 0.5;
        if (c === 'P') { this.px = cx; this.py = cy; this.spawn = [cx, cy]; }
        else if (c === 'a') this.enemies.push({ kind: 'ambush', x: cx, y: cy, hx: cx, hy: cy, hp: this.enemyKind === 'rat' ? 3 : 2, st: 'hide', t: 0, atkT: 0, dead: 0, animT: 0, lungeT: 0 });
        // gunner: a Wolfenstein guard. Stands his post, VISIBLE from the moment
        // you round the corner, winds up a glowing aim tell, then fires a bolt
        // slow enough to step out of. Drops shells when he dies.
        else if (c === 'g') this.enemies.push({ kind: 'gun', x: cx, y: cy, hp: 3, st: 'guard', t: 0, atkT: 0, dead: 0, animT: 0, aimT: 0, boltCd: 600, flash: 0 });
        // barrel: DOOM's finest. Shootable, clawable, chain-reacts, and hurts
        // whoever is standing next to it -- including you.
        // hp 1: Dylan shot a barrel and "it didn't explode, it just turned into
        // little sparks" -- it had 2hp against a 1-damage pistol, so a single
        // hit only ever chipped it. One shot pops it now.
        else if (c === 'B') this.enemies.push({ kind: 'barrel', x: cx, y: cy, hp: 1, st: 'guard', t: 0, atkT: 0, dead: 0, animT: 0, fuse: 0 });
        else if (c === 'M') this.mittens = { x: cx, y: cy };
        else if (c === 'S') this.items.push({ x: cx, y: cy, kind: 'shotgun', got: 0 });
        else if (c === 'T') this.items.push({ x: cx, y: cy, kind: 'tuna', got: 0 });
        else if (c === 'H') this.items.push({ x: cx, y: cy, kind: 'shells', got: 0 });
        else if (c === 'R') this.items.push({ x: cx, y: cy, kind: 'raygun', got: 0 });
        else if (c === 'E') this.exit = { x: cx, y: cy };
        else if (c === 'G') this.grabCell = { x: cx, y: cy };
        else if (c === 'c') {
          // Mount the torch ON THE WALL (Dylan: "the torches are in the middle
          // of the hallway... should be on the wall"). Torch cells are floor,
          // so shove the billboard 0.44 toward whichever neighbouring cell is
          // solid; it then renders flush against that wall face instead of
          // hovering in the middle of the corridor.
          let ox = 0, oy = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (cellAt(def.grid, x + dx, y + dy) === '#') { ox = dx * 0.44; oy = dy * 0.44; break; }
          }
          this.torches.push({ x: cx + ox, y: cy + oy, ph: (x * 13 + y * 7) % 10 });
        }
      }
    }
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      if (this.solid(this.px + Math.cos(a), this.py + Math.sin(a)) === false) { this.ang = a; break; }
    }
    this.weap = 'pistol';
    this.pistolLost = false;
    this.hasShotgun = false; this.shells = 0;
    this.fireCd = 0; this.meleeT = 0; this.fireT = 0; this.pumpT = 0;
    this.clawT = 0; this.clawBlood = 0; // v13: claw extend timer + blood-on-claws decay
    this.dmgDir = []; // v13: {a, t} directional damage indicators, angle relative to view
    this.rememberedMittens = false; this.vignette = null; // v13: the 'I knew I forgot something' beat
    // v13.3 automap (Dylan, twice: "the tunnel is still really confusing and
    // hard to navigate"). A compass chevron tells you which WAY the objective
    // is; it cannot tell you which corridors you have already walked, which is
    // the actual thing you lose track of down here. Doom shipped an automap
    // for exactly this reason. `seen` is the set of cells revealed so far --
    // filled in as you walk, not handed over at the start, so exploring still
    // means something.
    this.seen = new Set();
    this.mapOn = true;                 // toggled with M
    this.trail = [];                   // recent footsteps, so you can see doubling back
    this.reveal();                     // the room you spawn in is on the map from frame one
    this.ammoInMag = PISTOL_MAG; this.reloadT = 0; // v10: pistol reload state
    this.walkT = 0; this.prevBits = 0; this.sway = 0; this.turnRate = 0;
    this.zbuf = new Float32Array(RW);
    this.hurtT = 0; this.t = 0;
    this.script = null;               // throat-grab state machine
    this.crawl = 0;                   // crawl-out anim timer
    this.motes = [];                  // dust motes in the exit light shaft
    for (let i = 0; i < 14; i++) this.motes.push([Math.random(), Math.random(), 0.4 + Math.random() * 0.6]);
    // per-cell wall texture variant (dirt / bamboo), stable hash
    this.texId = (x, y) => {
      if (this.bloodWalls.has(x + ',' + y)) return 2;
      return ((x * 7 + y * 13 + this.mapIdx * 5) % 10) < 6 ? 0 : 1;
    };
    // lowres scene canvas (absent in headless tests)
    this.sc = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if (this.sc) { this.sc.width = RW; this.sc.height = RH; this.sctx = this.sc.getContext('2d'); }
    this._flat = null; // floor/ceiling texture pixels, built lazily
  }

  ev(e) { this.events.push(e); }
  // 'D' (secret wall) is solid until clawed open — see openSecret()
  solid(x, y) { const c = cellAt(this.grid, x | 0, y | 0); return c === '#' || c === 'D'; }

  openSecret(x, y) {
    // flood contiguous D cells so a 2-wide secret door opens as one
    const q = [[x, y]];
    while (q.length) {
      const [cx, cy] = q.pop();
      if (cellAt(this.grid, cx, cy) !== 'D') continue;
      this.grid[cy][cx] = '.';
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) q.push([cx + dx, cy + dy]);
    }
    this._navKey = null; // grid changed — recompute the compass field
    this.result.secrets++;
    this.pops.push({ t: 1100, n: 500 });
    this.ev({ e: 'banner', k: 'secretFound' });
    this.ev({ e: 'sfx', n: 'sfx_shrapnel' });
    this.ev({ e: 'shake' });
  }

  // v13.3 WALL CLIP. This tested only the DESTINATION point, never the path to
  // it -- and unlike the side-scroller's fixed accumulator the tunnel is
  // stepped with raw variable dt, clamped only at 250ms. On a long frame (GC,
  // an asset decode, a bad frame on weak hardware) a sprinting player moved up
  // to 1.55 cells in a single collision test against 1-cell-thick walls and
  // went straight through. A speedrun tester reproduced it twice: once into a
  // SEALED secret pocket, taking its loot without ever clawing the secret wall
  // open, and once across the only corridor joining the tunnel's two halves,
  // skipping the throat-grab set piece and the shotgun chamber entirely.
  // Sub-stepping in fractions of a cell makes the move swept.
  tryMove(nx, ny) {
    const dx = nx - this.px, dy = ny - this.py;
    const dist = Math.hypot(dx, dy);
    const STEP = 0.2;                       // well under a wall's 1-cell thickness
    const n = dist > STEP ? Math.ceil(dist / STEP) : 1;
    for (let i = 0; i < n; i++) this.moveStep(this.px + dx / n, this.py + dy / n);
    this.reveal();
  }

  moveStep(nx, ny) {
    const R = 0.28, L = 0.2;
    if (nx !== this.px) {
      const ex = nx + (nx > this.px ? R : -R);
      if (!this.solid(ex, this.py - L) && !this.solid(ex, this.py + L)) this.px = nx;
    }
    if (ny !== this.py) {
      const ey = ny + (ny > this.py ? R : -R);
      if (!this.solid(this.px - L, ey) && !this.solid(this.px + L, ey)) this.py = ny;
    }
  }

  // Corner automap. Only cells you have walked past are drawn, so it is a
  // record of where you have BEEN rather than a solution handed over up front.
  // Doubling back is the thing players actually lose track of down here, so
  // the recent path is drawn on top of the rooms.
  drawAutomap(ctx, now) {
    // v13.3: a PERMANENT control legend, drawn BEFORE the map's early-out so
    // hiding the map with M cannot take the controls with it. The tunnel
    // rebinds keys the side-scroller already taught -- W walks instead of
    // aiming, A/D turn instead of moving -- and the card that says so is a hint
    // that flashes once during the fall-in. A first-time playtester never saw
    // it, spent a minute pressing keys, and asked for exactly this: "don't
    // flash them for four seconds, put a small permanent legend in a corner."
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = '#0b0d08';
    ctx.fillRect(10, H - 42, 300, 30);
    ctx.fillStyle = '#f3e9c8';
    ctx.fillText('W FORWARD · SPACE SPRINT · S BACK · A/D TURN', 16, H - 29);
    ctx.fillText('J FIRE · K CLAWS · L WEAPON · M MAP', 16, H - 17);
    ctx.restore();
    ctx.textAlign = 'left';
    if (!this.mapOn || !this.seen || !this.seen.size) return;
    const gh = this.grid.length, gw = this.grid[0].length;
    // 168 was about an inch across on a laptop -- a first-time playtester
    // called it too small to navigate with and never used it. 240 is readable
    // at a glance without eating the play area.
    const box = 240, pad = 14;
    const cs = Math.min(box / gw, box / gh);
    const ox = W - box - pad, oy = H - box - pad;
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(12,14,10,0.72)';
    ctx.fillRect(ox - 6, oy - 6, box + 12, box + 12);
    ctx.strokeStyle = 'rgba(243,233,200,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(ox - 6, oy - 6, box + 12, box + 12);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (!this.seen.has(y * 1000 + x)) continue;
        const c = this.grid[y][x];
        // 'D' is a secret wall: it must read as solid until it is opened, or
        // the map gives every secret away for free.
        const wall = c === '#' || c === 'D';
        ctx.fillStyle = wall ? 'rgba(96,88,66,0.85)' : 'rgba(28,34,24,0.9)';
        ctx.fillRect(ox + x * cs, oy + y * cs, Math.ceil(cs), Math.ceil(cs));
      }
    }
    // path walked
    if (this.trail.length > 1) {
      ctx.strokeStyle = 'rgba(140,200,120,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ox + this.trail[0][0] * cs, oy + this.trail[0][1] * cs);
      for (const t of this.trail) ctx.lineTo(ox + t[0] * cs, oy + t[1] * cs);
      ctx.stroke();
    }
    // objective pip, but only once you have seen its part of the map -- it
    // marks a place you can already navigate to, it does not reveal one.
    const pip = (tx, ty, col) => {
      if (!this.seen.has((ty | 0) * 1000 + (tx | 0))) return;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(ox + tx * cs, oy + ty * cs, Math.max(2.5, cs * 0.42), 0, 7); ctx.fill();
    };
    if (this.mittens && !this.result.rescued) pip(this.mittens.x, this.mittens.y, '#FFC93C');
    if (this.exit) pip(this.exit.x, this.exit.y, '#8CFF3B');
    // the player: a triangle, so the map tells you which way you are facing
    ctx.save();
    ctx.translate(ox + this.px * cs, oy + this.py * cs);
    ctx.rotate(this.ang);
    ctx.fillStyle = '#f3e9c8';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 0.5;
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'right';
    ctx.fillStyle = '#f3e9c8'; ctx.fillText('M — MAP', ox + box, oy - 11);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // Light up the cells around the player plus the walls that bound them, so
  // the automap draws corridors with edges instead of a cloud of dots.
  reveal() {
    const cx = this.px | 0, cy = this.py | 0;
    for (let y = cy - 2; y <= cy + 2; y++) {
      for (let x = cx - 2; x <= cx + 2; x++) {
        if (y < 0 || x < 0 || y >= this.grid.length || x >= this.grid[0].length) continue;
        this.seen.add(y * 1000 + x);
      }
    }
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last[0] - this.px, last[1] - this.py) > 0.9) {
      this.trail.push([this.px, this.py]);
      if (this.trail.length > 120) this.trail.shift();
    }
  }

  alert(radius) {
    // v13.2: bursting a hider now needs LINE OF SIGHT (or point-blank range).
    // A pistol shot used to wake every lurker within 3+ cells THROUGH WALLS --
    // they'd hunt the player down dark corridors minutes later, which is where
    // loop-1's six "killed by something I never saw" deaths came from.
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.px, e.y - this.py);
      if (e.st !== 'hide' && d < radius) e.st = 'chase';
      else if (e.st === 'hide' && d < radius * 0.55 && (d < 1.2 || this.los(e.x, e.y))) this.burst(e);
    }
  }

  // One damage path for everything that can hurt the player (lunges, gunner
  // bolts, barrel blasts) so the directional arc, the splats, the death-cause
  // hint and the respawn all fire no matter what did the hurting. Returns true
  // if the tunnel run ended (caller must stop stepping).
  hurtFrom(p, sx, sy, dmg, why) {
    if (this.hurtT > 0) return false;
    this._lastHurt = why || 'blade'; // remembered for the death message
    p.hp -= dmg; this.hurtT = 900; // was 700 -- loop-1 measured 5->1 hp in ~2s from stacked hits
    this.ev({ e: 'fpsHurt' });
    // v13 (Dylan: "you get attacked in the tunnel and its hard to tell where
    // its coming from"): world-angle edge arc pinned to the attacker.
    this.dmgDir.push({ w: Math.atan2(sy - this.py, sx - this.px), t: 1500 });
    this.splats.push({ x: W * (0.3 + Math.random() * 0.4), y: H * (0.2 + Math.random() * 0.4), r: 60, t: 800 });
    // shove the player OFF the attacker so a hit creates space instead of
    // leaving you standing inside the swarm eating the next swing
    const kd = Math.max(0.1, Math.hypot(this.px - sx, this.py - sy));
    this.tryMove(this.px + (this.px - sx) / kd * 0.55, this.py + (this.py - sy) / kd * 0.55);
    if (p.hp <= 0) {
      p.deaths++; p.lives--; p.hp = CFG.hpMax;
      if (p.lives <= 0) { p.st = 'out'; this.done = true; this.result.dead = true; return true; }
      this.px = this.spawn[0]; this.py = this.spawn[1];
      this.hurtT = 2000;
      // Respawn safety (loop-1: killed AT the spawn point while the previous
      // death message was still on screen, and respawned mid-firefight on an
      // empty magazine): full mag, and any stalker camped near the entrance
      // gets sent back to its niche to recover.
      this.ammoInMag = PISTOL_MAG; this.reloadT = 0;
      // Mercy resupply: after the grab takes your pistol, running the shotgun
      // dry left you with claws, no shells, and ranged gunners on the only
      // route -- a run that is over but never says so (loop 3 stalled exactly
      // there, 34 cells from Mittens with 3 lives in hand). Dying weaponless
      // now hands back enough to fight your way out.
      if (this.pistolLost && this.shells <= 0) {
        this.hasShotgun = true; this.shells = 4; this.weap = 'shotgun';
        this.ev({ e: 'banner', k: 'gotShells' });
      }
      // Clear the spawn of EVERY live enemy, not just hiders (loop 3: killed
      // 2.5s after respawning while standing still; another respawn put a
      // knife-cat mid-lunge in my face). Hiders go home; chasers get pushed
      // out and reset so they have to walk back in.
      for (const e2 of this.enemies) {
        if (e2.dead || e2.kind === 'barrel') continue;
        if (Math.hypot(e2.x - this.px, e2.y - this.py) < 4.5) {
          if (e2.kind === 'ambush') { e2.x = e2.hx; e2.y = e2.hy; e2.st = 'hide'; }
          e2.t = 0; e2.atkT = 1200; e2.aiming = 0; e2.burstT = 0;
        }
      }
      // name the killer on respawn, per cause -- loop-1: "all six deaths had
      // the SAME message". Each one now teaches its own counter.
      this.ev({ e: 'hint', k: this._lastHurt === 'bolt' ? 'diedTunnelShot' : this._lastHurt === 'boom' ? 'diedTunnelBoom' : 'diedTunnel' });
    }
    return false;
  }

  burst(e) { // knife cat explodes out of the wall niche
    e.st = 'burst'; e.t = 0; e.animT = 0;
    this.ev({ e: 'sfx', n: 'sfx_screech' });
    this.ev({ e: 'shake' });
    for (let i = 0; i < 10; i++) {
      this.gore.push({ x: e.x, y: e.y, z: 0.3 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 2.4, vy: (Math.random() - 0.5) * 2.4, vz: 1 + Math.random() * 2, t: 700, dirt: 1 });
    }
  }

  // clawing at a scratched-up 'D' wall within reach pops the secret open
  checkSecret() {
    for (const r of [0.8, 1.4]) {
      const fx = (this.px + Math.cos(this.ang) * r) | 0, fy = (this.py + Math.sin(this.ang) * r) | 0;
      if (cellAt(this.grid, fx, fy) === 'D') { this.openSecret(fx, fy); return; }
    }
  }

  los(ex, ey) {
    const steps = Math.ceil(Math.hypot(ex - this.px, ey - this.py) * 4);
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      if (this.solid(this.px + (ex - this.px) * k, this.py + (ey - this.py) * k)) return false;
    }
    return true;
  }

  step(bits, dt, p) {
    if (this.done) return;
    // hit-stop: freeze the sim for a few frames on a blast so the impact
    // reads, the way Metal Slug does. Effects keep animating.
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      for (const bl of this.blasts) bl.t += dt;
      if (this.flash > 0) this.flash -= dt;
      return;
    }
    this.t += dt;
    const dts = dt / 1000;
    this._p = p; // barrels lit by the player's own shots need p for the blast
    for (const bl of this.blasts) bl.t += dt;
    this.blasts = this.blasts.filter(bl => bl.t < 620);
    if (this.flash > 0) this.flash -= dt;
    this.fireCd -= dt; this.meleeT -= dt; this.fireT -= dt; this.hurtT -= dt; this.pumpT -= dt;
    this.clawT = (this.clawT || 0) - dt; this.clawBlood = (this.clawBlood || 0) - dt;
    if (this.vignette) { this.vignette.t += dt; if (this.vignette.t > this.vignette.T) this.vignette = null; }
    for (const d2 of this.dmgDir) d2.t -= dt;
    this.dmgDir = this.dmgDir.filter(d2 => d2.t > 0);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.reloadT = 0; this.ammoInMag = PISTOL_MAG; } // reload complete
    }

    // gore particles fly regardless of state
    for (const g of this.gore) {
      g.x += g.vx * dts; g.y += g.vy * dts; g.z += g.vz * dts;
      g.vz -= 6 * dts; g.t -= dt;
      if (g.z <= 0.02 && !g.dirt) { g.z = 0.02; g.vx = g.vy = g.vz = 0; }
    }
    this.gore = this.gore.filter(g => g.t > 0);
    for (const s of this.splats) s.t -= dt;
    this.splats = this.splats.filter(s => s.t > 0);
    for (const cs of this.casings) { cs.x += cs.vx * dts * 60; cs.y += cs.vy * dts * 60; cs.vy += 0.5 * dts * 60; cs.r += cs.vr; cs.t -= dt; }
    this.casings = this.casings.filter(cs => cs.t > 0);

    // ---- crawl-out animation: controls locked, then done ----
    if (this.crawl > 0) {
      this.crawl += dt;
      if (this.crawl > 1900) { this.done = true; }
      return;
    }

    // ---- throat-grab script: the tunnel's signature beat ----
    if (this.script && !this.script.done) {
      const s = this.script;
      s.t += dt;
      if (s.phase === 'appear' && s.t > 620) { s.phase = 'slap'; s.t = 0; this.ev({ e: 'sfx', n: 'sfx_knife' }); this.ev({ e: 'shake' }); this.ev({ e: 'banner', k: 'gunSlapped' }); }
      // no 'grabPrompt' hint here: the mash meter in main.js already prints
      // that exact string in big type above the bar, so the hint rendered it a
      // second time at the bottom of the screen (loop 3: "renders twice")
      else if (s.phase === 'slap' && s.t > 460) { s.phase = 'grapple'; s.t = 0; s.meter = 12; this.weap = 'claws'; this.pistolLost = true; }
      else if (s.phase === 'grapple') {
        // v13.2 softlock fix, found by driving the grapple directly: the meter
        // had NO FLOOR. Six slow seconds put it at -91, so escaping meant
        // climbing 191 points at 13 a press -- and since the grapple bleeds
        // you but can never kill (below), a panicking player was stuck in it
        // forever with no way out and no death to reset them.
        //   - meter floors at 0, so you can always start climbing
        //   - K (claws) counts too: the prompt says RIP HIS THROAT OUT and
        //     mashing the claw button is the obvious instinct
        //   - holding the button still trickles, so a masher who can't keep
        //     up with edge-presses is not punished into a dead end
        //   - and a 12s failsafe rips free regardless. It can never hang.
        s.meter = Math.max(0, s.meter - 16 * dts);
        const mashBit = (bits & C.FIRE) || (bits & C.GREN);
        const prevMash = (this.prevBits & C.FIRE) || (this.prevBits & C.GREN);
        if (mashBit && !prevMash) { s.meter += 13; this.ev({ e: 'sfx', n: 'sfx_meow' }); }
        else if (mashBit) s.meter += 9 * dts; // holding: slower, but never stuck
        s.hurtAcc = (s.hurtAcc || 0) + dt;
        if (s.hurtAcc > 1500) { s.hurtAcc = 0; p.hp -= 1; this.hurtT = 500; this.ev({ e: 'fpsHurt' }); if (p.hp <= 0) { p.hp = 1; } } // the grapple can bleed you but never kill
        if (s.t > 12000) s.meter = 100; // failsafe: the cat wins on his own
        if (s.meter >= 100) {
          s.phase = 'rip'; s.t = 0;
          this.ev({ e: 'sfx', n: 'sfx_gore' });
          this.ev({ e: 'shake' });
          for (let i = 0; i < 26; i++) this.gore.push({ x: this.px + Math.cos(this.ang) * 0.7, y: this.py + Math.sin(this.ang) * 0.7, z: 0.5, vx: (Math.random() - 0.5) * 3.4, vy: (Math.random() - 0.5) * 3.4, vz: 1.5 + Math.random() * 2.5, t: 1100 });
          for (let i = 0; i < 6; i++) this.splats.push({ x: Math.random() * W, y: Math.random() * H * 0.8, r: 40 + Math.random() * 90, t: 1400 });
        }
        this.prevBits = bits; return; // locked in the grapple
      }
      else if (s.phase === 'rip' && s.t > 900) {
        s.done = true;
        const gx = this.px + Math.cos(this.ang) * 0.8, gy = this.py + Math.sin(this.ang) * 0.8;
        this.pools.push([gx, gy, 0.5]);
        this.bloodWalls.add(((gx + Math.cos(this.ang)) | 0) + ',' + ((gy + Math.sin(this.ang)) | 0));
        this.ev({ e: 'banner', k: 'throatRipped' });
        this.ev({ e: 'fpsKill' });
      }
      if (!s.done) { this.prevBits = bits; return; } // controls locked during appear/slap/rip
    }
    // arm the script when the player crosses the grab corner
    if (this.grabCell && !this.script && Math.hypot(this.grabCell.x - this.px, this.grabCell.y - this.py) < 0.65) {
      this.script = { phase: 'appear', t: 0, meter: 0 };
      this.ev({ e: 'sfx', n: 'sfx_screech' });
    }

    // tank controls
    const turn = (bits & C.L ? -1 : 0) + (bits & C.R ? 1 : 0);
    this.ang += turn * TURN * dts;
    this.turnRate = turn;
    // v13.3: SPACE stacked another full 1.0 on top of W, so holding both was a
    // flat DOUBLE speed with no cost, no noise and no mention anywhere -- the
    // drop-in card lists W/S/A/D/J/K/L and never Space, and the test bot only
    // ever pressed W, so nobody had run it. It is a sprint now: real, listed in
    // the control legend, and 1.45x rather than 2x so it is a choice instead of
    // a strictly-correct default. (The wall clip it enabled is fixed in
    // tryMove, which is now swept.)
    let fwd = 0;
    if (bits & C.UP) fwd += 1;
    if (bits & C.DOWN) fwd -= 0.6;
    if (bits & C.JUMP && fwd > 0) fwd *= 1.45;
    if (fwd !== 0) {
      this.walkT += dt;
      this.tryMove(this.px + Math.cos(this.ang) * MOVE * fwd * dts, this.py + Math.sin(this.ang) * MOVE * fwd * dts);
    }
    this.sway += ((this.turnRate * -26) - this.sway) * Math.min(1, dts * 7);

    // L cycles weapons (pistol may be gone after the grab)
    if ((bits & C.CHEESE) && !(this.prevBits & C.CHEESE)) {
      const order = [];
      if (!this.pistolLost) order.push('pistol');
      order.push('claws');
      if (this.hasShotgun && this.shells > 0) order.push('shotgun');
      this.weap = order[(order.indexOf(this.weap) + 1) % order.length];
      this.ev({ e: 'sfx', n: 'sfx_meow' });
    }
    // J fire
    if ((bits & C.FIRE) && this.fireCd <= 0 && !(this.weap === 'pistol' && this.reloadT > 0)) {
      if (this.weap === 'pistol') {
        this.fireCd = 380; this.fireT = 110;
        // v10.2 (Dylan: "the sound effects are terrible and shrill and
        // repetitive and annoying in the tunnel"): two confined-space
        // variants alternated per-shot instead of the single outdoor
        // sfx_shot sample reused everywhere else in the game — mashing fire
        // in here no longer sounds like the exact same clip on a loop.
        this.ev({ e: 'sfx', n: (this._pistolVariant = !this._pistolVariant) ? 'sfx_pistol_tunnel_a' : 'sfx_pistol_tunnel_b' });
        this.ejectCasing(1);
        this.shoot(1, 0.06, 20); this.alert(6);
        // v10: real magazine — empty mag triggers a visible reload beat
        // (Dylan: "there's no animation for it reloading").
        if (--this.ammoInMag <= 0) { this.reloadT = PISTOL_RELOAD_MS; this.ev({ e: 'sfx', n: 'sfx_reload' }); }
      } else if (this.weap === 'shotgun' && this.shells > 0) {
        this.fireCd = 950; this.fireT = 130; this.pumpT = 620;
        this.shells--;
        this.ev({ e: 'sfx', n: 'sfx_shotgun' });
        this.ejectCasing(2);
        for (let i = -2; i <= 2; i++) this.shoot(1, 0.09, 7, i * 0.07);
        this.alert(8);
        if (this.shells <= 0) this.weap = this.pistolLost ? 'claws' : 'pistol';
      } else if (this.weap === 'claws' && !(this.prevBits & C.FIRE)) {
        // press-edge ONLY: holding J with claws used to re-trigger every 260ms
        // -- a constant screech-as-if-shooting even when hitting nothing,
        // which Dylan called out ("making a sound effect as if I was shooting,
        // but I wasn't"). One press, one swipe, one sound.
        this.fireCd = 260; this.meleeT = 190; this.clawT = 190;
        this.ev({ e: 'sfx', n: 'sfx_screech' });
        if (this.melee(2, 1.75)) this.clawBlood = 2600;
        this.checkSecret();
        this.alert(4);
      }
    }
    // v13: K is a claw swipe too. Dylan: "if i have a knife why do i have claws?
    // pick one or the other, i vote just claws". The knife is gone as a weapon
    // -- fps_knife is no longer drawn anywhere -- but K stays bound as a heavy
    // swipe so the muscle memory and the tutorial string still work.
    if ((bits & C.GREN) && !(this.prevBits & C.GREN) && this.meleeT <= -80) {
      this.meleeT = 210; this.clawT = 210; this.fireCd = Math.max(this.fireCd, 200);
      this.ev({ e: 'sfx', n: 'sfx_screech' });
      if (this.melee(3, 1.9)) this.clawBlood = 2600;
      this.checkSecret();
      this.alert(5);
    }

    // items
    for (const it of this.items) {
      if (!it.got && Math.hypot(it.x - this.px, it.y - this.py) < 0.75) {
        it.got = 1;
        if (it.kind === 'shotgun') { this.hasShotgun = true; this.shells += 8; this.weap = 'shotgun'; this.result.shotgun = true; this.ev({ e: 'banner', k: 'gotShotgun' }); this.ev({ e: 'sfx', n: 'sfx_shotgun' }); }
        if (it.kind === 'tuna') { p.hp = Math.min(CFG.hpMax, p.hp + 2); this.ev({ e: 'banner', k: 'gotHealth' }); this.ev({ e: 'sfx', n: 'sfx_purr' }); }
        if (it.kind === 'shells') { this.shells += 5; this.ev({ e: 'banner', k: 'gotShells' }); this.ev({ e: 'sfx', n: 'sfx_reload' }); }
        if (it.kind === 'raygun') { this.result.loot++; this.ev({ e: 'banner', k: 'gotRaygun' }); this.ev({ e: 'sfx', n: 'sfx_raygun' }); }
      }
    }
    // v13.3 (Dylan: the Mittens rescue "didn't quite register"). Two reasons.
    // The trigger was 0.7 cells against a 0.28 player radius, so you had to
    // walk almost exactly onto his cell -- brushing past the corner he is
    // sitting in did nothing at all. And the rescue itself was one banner and
    // a purr, which is the same feedback a health pickup gets, for the thing
    // the entire level exists to do. Radius is now 1.45 (you cannot stand in
    // his cell's doorway and miss him), and he calls out as you close in so
    // the trigger is telegraphed rather than silent.
    if (this.mittens && !this.result.rescued) {
      const md = Math.hypot(this.mittens.x - this.px, this.mittens.y - this.py);
      if (md < 4.5 && !this.mittensHeard) {
        this.mittensHeard = true;
        this.ev({ e: 'sfx', n: 'vo_mittens' });
        this.ev({ e: 'hint', k: 'fpsMittensNear' });
      }
      this.mittensGlow = md < 5 ? Math.max(0, 1 - md / 5) : 0;
    }
    if (this.mittens && !this.result.rescued && Math.hypot(this.mittens.x - this.px, this.mittens.y - this.py) < 1.45) {
      this.result.rescued = true;
      this.ev({ e: 'banner', k: 'mittensFreed' });
      this.ev({ e: 'sfx', n: 'sfx_purr' });
      this.ev({ e: 'hint', k: 'followLight' });
      // the level's whole reason for existing gets a real beat: hitch, white
      // pop, screen shake -- the same punctuation a boss kill gets.
      this.hitStop = 140; this.flash = 300; this.ev({ e: 'shake' });
      // Mittens kept your pistol. Closes the "once the grab takes the gun I
      // could never get a gun again" hole (Dylan hit it when he missed the
      // shotgun) with a story beat instead of a floor pickup: rescuing your
      // buddy re-arms you for the walk out.
      if (this.pistolLost) {
        this.pistolLost = false;
        this.ammoInMag = PISTOL_MAG; this.reloadT = 0;
        if (this.weap === 'claws') this.weap = 'pistol';
        this.ev({ e: 'banner', k: 'gotPistolBack' });
        this.ev({ e: 'sfx', n: 'sfx_reload' });
      }
    }
    // exit: the light at the end of the tunnel
    if (this.exit && Math.hypot(this.exit.x - this.px, this.exit.y - this.py) < 0.6) {
      const need = this.mapIdx === 0 ? this.result.rescued : this.result.loot > 0;
      if (need) {
        this.result.cleared = this.enemies.every(e => e.dead);
        this.crawl = 1;
        this.ev({ e: 'sfx', n: 'sfx_purr' });
        return;
      } else if (this.mapIdx === 0 && !this.rememberedMittens) {
        // v13 (Dylan): "when you get to the light, but you forgot mittens, you
        // should show a cat in the darkness scared, meowing, holding his big
        // mini gun - and it should voice over". Fires once, the first time you
        // reach the exit without him. Drives an in-engine vignette rather than
        // a generated film: it has to react to WHEN the player wanders out,
        // which a pre-rendered video can't do, and it keeps the player in the
        // tunnel rather than cutting away from it.
        this.rememberedMittens = true;
        this.vignette = { t: 0, T: 5200 };
        this.ev({ e: 'sfx', n: 'vo_mittens' });
        this.ev({ e: 'banner', k: 'mittensRemember' });
        this.ev({ e: 'hint', k: 'fpsNeedMittens' });
      } else if (!this.exitHint || this.t - this.exitHint > 5000) {
        this.exitHint = this.t;
        this.ev({ e: 'hint', k: 'fpsNeedMittens' });
      }
    }

    // ---- enemies: ambushers (hide -> burst -> stalk -> lunge), gunners, barrels ----
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.atkT -= dt; e.animT += dt;
      // burning: ticks damage, throws embers, and the sprite lights up (see
      // the enemy draw). Set by explodeBarrel().
      if (e.burn > 0) {
        e.burn -= dt; e.burnTick = (e.burnTick || 0) + dt;
        if (e.burnTick > 380) {
          e.burnTick = 0;
          for (let i = 0; i < 3; i++) {
            this.gore.push({ x: e.x, y: e.y, z: 0.3 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, vz: 1.4 + Math.random(), t: 520, chz: 1 });
          }
          if (!e.dead) { this.ev({ e: 'sfx', n: 'sfx_screech' }); this.hit(e, 1); }
        }
      }
      const d = Math.hypot(e.x - this.px, e.y - this.py);
      if (e.kind === 'barrel') {
        // chain fuse: a nearby blast lights it, it pops a beat later
        if (e.fuse > 0) { e.fuse -= dt; if (e.fuse <= 0) this.explodeBarrel(e, p); }
        continue;
      }
      if (e.kind === 'gun') {
        // Wolfenstein guard: hold the post, wind up a visible aim, fire a
        // dodgeable bolt. Backs off if you rush him -- claws still reach.
        if (e.flash > 0) e.flash -= dt;
        e.boltCd -= dt;
        if (d < 1.4) {
          const vx = (e.x - this.px) / (d || 1), vy = (e.y - this.py) / (d || 1);
          const nx = e.x + vx * 1.5 * dts, ny = e.y + vy * 1.5 * dts;
          if (!this.solid(nx, e.y)) e.x = nx;
          if (!this.solid(e.x, ny)) e.y = ny;
        }
        // pending second round of a burst tracks the player's CURRENT position
        if (e.burstT > 0) {
          e.burstT -= dt;
          if (e.burstT <= 0) {
            const bd2 = Math.max(0.2, Math.hypot(this.px - e.x, this.py - e.y));
            const spd2 = this.enemyKind === 'rat' ? 5.2 : 4.6;
            this.bolts.push({ x: e.x, y: e.y, vx: (this.px - e.x) / bd2 * spd2, vy: (this.py - e.y) / bd2 * spd2, t: 3000 });
            this.ev({ e: 'sfx', n: 'sfx_laser' });
          }
        }
        const see = d < 8.5 && this.los(e.x, e.y);
        if (see && e.boltCd <= 0) {
          if (!e.aiming) { e.aiming = 1; e.aimT = 0; this.ev({ e: 'sfx', n: 'sfx_reload' }); } // the click IS the tell
          e.aimT += dt;
          if (e.aimT > 560) {
            // two-round burst, fast bolts. Playtest on v1 of the gunner:
            // "their bullets were going slow" -- at 2.9 cells/s a bolt took
            // 2+ seconds to arrive and read as harmless. 4.6/5.2 with a
            // follow-up round makes standing still an actual mistake while
            // the 560ms glow still gives an honest dodge window.
            e.aiming = 0; e.boltCd = 1400 + Math.random() * 500; e.burstT = 170;
            const bd = Math.max(0.2, d);
            const spd = this.enemyKind === 'rat' ? 5.2 : 4.6;
            this.bolts.push({ x: e.x, y: e.y, vx: (this.px - e.x) / bd * spd, vy: (this.py - e.y) / bd * spd, t: 3000 });
            this.ev({ e: 'sfx', n: 'sfx_laser' });
          }
        } else if (!see) { e.aiming = 0; e.aimT = 0; }
        continue;
      }
      if (e.st === 'hide') {
        if (d < 1.9 && this.los(e.x, e.y)) this.burst(e);
        continue;
      }
      if (e.st === 'burst') { e.t += dt; if (e.t > 260) e.st = 'chase'; continue; }
      if (e.st === 'wind') {
        // held in place, telegraphing. Re-aims as it winds, so backing off
        // still works but simply standing still does not save you.
        e.t += dt;
        e.flash = Math.max(e.flash, 120);
        if (d > 0.01) { e.lvx = (this.px - e.x) / d; e.lvy = (this.py - e.y) / d; }
        if (e.t >= CFG.aimTellMs) { e.st = 'lunge'; e.t = 0; }
        continue;
      }
      if (e.st === 'lunge') {
        e.t += dt;
        const spd = 5.2 * dts;
        const nx = e.x + e.lvx * spd, ny = e.y + e.lvy * spd;
        if (!this.solid(nx, e.y)) e.x = nx;
        if (!this.solid(e.x, ny)) e.y = ny;
        if (d < 0.85 && this.hurtT <= 0) {
          e.st = 'recover'; e.t = 0;
          if (this.hurtFrom(p, e.x, e.y, 1)) return;
        }
        if (e.t > 420) { e.st = 'recover'; e.t = 0; }
        continue;
      }
      if (e.st === 'recover') { e.t += dt; if (e.t > 620) e.st = 'chase'; continue; }
      // blade-out warning: a stalker closing to knife range announces itself
      // with a "shink" before it can ever swing (loop-1: first contact from
      // the dark read as instant death). One warning per few seconds each.
      if (e.st === 'chase' && d < 2.8 && (!e.warnAt || this.t - e.warnAt > 4000)) {
        e.warnAt = this.t;
        this.ev({ e: 'sfx', n: 'sfx_knife' });
      }
      // chase: stalk down the corridors
      if (d > 1.35) {
        const vx = (this.px - e.x) / d, vy = (this.py - e.y) / d;
        const spd = (this.enemyKind === 'rat' ? 2.9 : 2.6) * dts; // v13.1: stalkers actually close distance now
        const nx = e.x + vx * spd, ny = e.y + vy * spd;
        const R2 = 0.22;
        if (nx !== e.x && !this.solid(nx + (nx > e.x ? R2 : -R2), e.y)) e.x = nx;
        if (ny !== e.y && !this.solid(e.x, ny + (ny > e.y ? R2 : -R2))) e.y = ny;
      } else if (e.atkT <= 0) {
        // v13.3: this comment used to say "wind up a lunge" but there was no
        // wind-up -- it set st='lunge' and the enemy started travelling on the
        // SAME FRAME as its own tell, so the flash and the hit were
        // simultaneous. A first-time playtester: "twice the screen went solid
        // red and I died before a single frame showed me an enemy." A real
        // wind-up state now holds it still, flashing and screeching, for
        // aimTellMs before it commits -- the same dodge window every enemy
        // topside already gives you.
        e.atkT = this.enemyKind === 'rat' ? 1050 : 1250;
        e.flash = 320;
        e.st = 'wind'; e.t = 0;
        e.lvx = (this.px - e.x) / d; e.lvy = (this.py - e.y) / d;
        this.ev({ e: 'sfx', n: this.enemyKind === 'rat' ? 'sfx_laser' : 'sfx_screech' });
      }
      if (e.flash > 0) e.flash -= dt;
    }

    // ---- gunner bolts: visible, dodgeable, and they cook off barrels ----
    for (const b of this.bolts) {
      b.x += b.vx * dts; b.y += b.vy * dts; b.t -= dt;
      if (b.t <= 0) continue;
      if (this.solid(b.x, b.y)) {
        b.t = 0;
        for (let i = 0; i < 4; i++) this.gore.push({ x: b.x, y: b.y, z: 0.4, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: 0.6 + Math.random(), t: 300, dirt: 1 });
        continue;
      }
      for (const e of this.enemies) {
        if (e.kind === 'barrel' && !e.dead && Math.hypot(e.x - b.x, e.y - b.y) < 0.42) { b.t = 0; this.explodeBarrel(e, p); break; }
      }
      if (b.t > 0 && Math.hypot(this.px - b.x, this.py - b.y) < 0.38) {
        b.t = 0;
        if (this.hurtFrom(p, b.x - b.vx * 0.2, b.y - b.vy * 0.2, 1, 'bolt')) return;
      }
    }
    this.bolts = this.bolts.filter(b => b.t > 0);
    for (const pop of this.pops) pop.t -= dt;
    this.pops = this.pops.filter(pop => pop.t > 0);

    this.updateNav(dts);
    this.prevBits = bits;
  }

  explodeBarrel(e, p) {
    if (e.dead) return;
    e.dead = 1; e.noCorpse = 1;
    this.ev({ e: 'sfx', n: 'sfx_explosion' });
    this.ev({ e: 'shake' });
    // A REAL fireball, using the same 16-frame sheet the rest of the game
    // uses -- Dylan: "there's a big explosion that looks cool and looks like
    // the other explosions in the game". The tunnel previously had no
    // explosion at all: it only sprayed gore particles, which is why a shot
    // barrel read as "little sparks". Staggered triple burst so it blooms.
    this.blasts.push({ x: e.x, y: e.y, t: 0, s: 2.6, z: 0.45 });
    this.blasts.push({ x: e.x - 0.22, y: e.y + 0.18, t: -110, s: 1.7, z: 0.75 });
    this.blasts.push({ x: e.x + 0.24, y: e.y - 0.15, t: -190, s: 1.9, z: 0.25 });
    this.flash = 420;                     // white-hot screen bloom
    this.hitStop = 90;                    // brief freeze so the hit lands
    // molten cheese-oil everywhere: mixed dirt + yellow gore, scorch on the floor
    for (let i = 0; i < 22; i++) {
      this.gore.push({ x: e.x, y: e.y, z: 0.2 + Math.random() * 0.7, vx: (Math.random() - 0.5) * 4.4, vy: (Math.random() - 0.5) * 4.4, vz: 1.2 + Math.random() * 2.6, t: 900, dirt: i % 3 === 0 ? 1 : 0, chz: i % 3 !== 0 ? 1 : 0 });
    }
    this.pools.push([e.x, e.y, 0.55, 'scorch']);
    // blast: kills enemies, lights other barrels, and does NOT spare you
    for (const e2 of this.enemies) {
      if (e2.dead || e2 === e) continue;
      const dd = Math.hypot(e2.x - e.x, e2.y - e.y);
      if (e2.kind === 'barrel') { if (dd < 1.5 && e2.fuse <= 0) e2.fuse = 140; continue; }
      if (dd < 1.9) {
        if (e2.st === 'hide') this.burst(e2);
        // Dylan: "the enemy catches fire". Anything caught in the blast burns
        // for ~2.2s -- it keeps taking damage, lights itself up, trails flame
        // and screams -- instead of just silently taking a chunk of HP.
        e2.burn = 2200; e2.burnTick = 0;
        this.hit(e2, 5);
      }
    }
    if (p && Math.hypot(this.px - e.x, this.py - e.y) < 1.25) this.hurtFrom(p, e.x, e.y, 1, 'boom');
    this.alert(7);
  }

  // v10 (Dylan: "I still don't know how to get out of the tunnel, make some
  // kind of markings that I can follow"): reuses the same target-priority
  // list and BFS the headless autopilot already uses to find its way, but
  // just to steer a HUD compass arrow — the player still has to walk it.
  navTargets() {
    const targets = [];
    if (this.mapIdx === 0) {
      // the grab corner IS the road to the shotgun -- label it as the prize,
      // not "DEEPER" (loop-1: compass said DEEPER the whole level, never
      // SHOTGUN; the surprise on the way stays a surprise)
      // v13.3: the compass read plain "SHOTGUN" for the whole first half of
      // the level, so players followed it believing the shotgun WAS the
      // objective -- Dylan ("I got lost. I couldn't find Mittens") and a
      // first-time playtester who spent a dozen lives on it and never reached
      // him both did exactly that. The waypoint still routes you via the gun,
      // because you need it, but it now says what it is on the way to.
      if (this.grabCell) targets.push({ x: this.grabCell.x | 0, y: this.grabCell.y | 0, label: 'GUN, THEN MITTENS', done: () => this.script && this.script.done });
      for (const it of this.items) if (it.kind === 'shotgun') targets.push({ x: it.x | 0, y: it.y | 0, label: 'GUN, THEN MITTENS', done: () => it.got });
      if (this.mittens) targets.push({ x: this.mittens.x | 0, y: this.mittens.y | 0, label: 'MITTENS', done: () => this.result.rescued });
    }
    for (const it of this.items) if (it.kind === 'raygun') targets.push({ x: it.x | 0, y: it.y | 0, label: 'ALIEN TECH', done: () => it.got });
    if (this.exit) targets.push({ x: this.exit.x | 0, y: this.exit.y | 0, label: 'EXIT', done: () => false });
    return targets;
  }

  updateNav(dts) {
    const targets = this.navTargets();
    const t2 = targets.find(t => !t.done());
    if (!t2) return;
    this._navLabel = t2.label || '';
    const key = t2.x + ',' + t2.y;
    if (this._navKey !== key) { this._navKey = key; this._navField = distField(this.grid, t2.x, t2.y); }
    const field = this._navField;
    const cx = this.px | 0, cy = this.py | 0;
    let wp = [t2.x + 0.5, t2.y + 0.5];
    let bestD = field.get(cx + ',' + cy) ?? 1e9;
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const kk = (cx + ddx) + ',' + (cy + ddy);
      const dd = field.get(kk);
      if (dd !== undefined && dd < bestD) { bestD = dd; wp = [cx + ddx + 0.5, cy + ddy + 0.5]; }
    }
    this._navDist = field.get(cx + ',' + cy) ?? null; // paces to target, for the HUD
    const targetAng = Math.atan2(wp[1] - this.py, wp[0] - this.px);
    if (this.navAng === undefined) this.navAng = targetAng;
    let da = targetAng - this.navAng;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    this.navAng += da * Math.min(1, dts * 6);
  }

  ejectCasing(n) {
    for (let i = 0; i < n; i++) {
      this.casings.push({ x: W / 2 + 40, y: H - 320, vx: 2 + Math.random() * 3, vy: -4 - Math.random() * 2, r: 0, vr: 0.3, t: 900 });
    }
  }

  shoot(dmg, spread, range, angOff = 0) {
    const a = this.ang + angOff;
    let best = null, bestD = range;
    for (const e of this.enemies) {
      if (e.dead || e.st === 'hide') continue;
      const dx = e.x - this.px, dy = e.y - this.py;
      const d = Math.hypot(dx, dy);
      if (d > bestD) continue;
      let da = Math.atan2(dy, dx) - a;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) < spread + 0.25 / d && this.los(e.x, e.y)) { best = e; bestD = d; }
    }
    if (best) this.hit(best, dmg);
  }

  // v13 (Dylan: "nothing happens when i strike with claws"). Two reasons it
  // read as dead: the reach was shorter than the enemy's own lunge range, so a
  // stalking cat could stand just outside it and never be hit, and a swing that
  // connected produced no lasting feedback. Now returns whether it landed so
  // the caller can drive the blood-on-claws state, and the arc is wider.
  melee(dmg, range) {
    for (const e of this.enemies) {
      if (e.dead || e.st === 'hide') continue;
      const d = Math.hypot(e.x - this.px, e.y - this.py);
      if (d < range) {
        let da = Math.atan2(e.y - this.py, e.x - this.px) - this.ang;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        if (Math.abs(da) < 1.05) { this.hit(e, dmg, d < 1.0); return true; }
      }
    }
    return false;
  }

  hit(e, dmg, close) {
    if (e.kind === 'barrel') {
      e.hp -= dmg;
      for (let i = 0; i < 3; i++) this.gore.push({ x: e.x, y: e.y, z: 0.5, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: 1 + Math.random(), t: 300, chz: 1 });
      if (e.hp <= 0) this.explodeBarrel(e, this._p);
      return;
    }
    e.hp -= dmg;
    if (e.st === 'hide') this.burst(e); else if (e.kind !== 'gun') e.st = (e.st === 'lunge' || e.st === 'wind') ? e.st : 'chase';
    this.ev({ e: 'sfx', n: 'sfx_meow' });
    // blood flies
    const n = e.hp <= 0 ? 16 : 7;
    for (let i = 0; i < n; i++) {
      this.gore.push({ x: e.x, y: e.y, z: 0.35 + Math.random() * 0.4, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: 0.8 + Math.random() * 2.2, t: 900 });
    }
    if (e.hp <= 0) {
      e.dead = 1; e.deadT = this.t;
      this.pools.push([e.x, e.y, 0.4 + Math.random() * 0.25]);
      // paint the nearest wall bloody
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (this.solid(e.x + ox, e.y + oy)) { this.bloodWalls.add(((e.x + ox) | 0) + ',' + ((e.y + oy) | 0)); break; }
      }
      if (close) for (let i = 0; i < 4; i++) this.splats.push({ x: Math.random() * W, y: Math.random() * H * 0.7, r: 50 + Math.random() * 70, t: 900 });
      this.ev({ e: 'sfx', n: 'sfx_gore' });
      this.ev({ e: 'fpsKill' });
      // kills pay here the way they do topside -- the tunnel used to be the
      // one mode where a kill was worth zero points and zero feedback
      this.result.kills++;
      this.pops.push({ t: 900, n: 100 });
      // Wolfenstein rule: the guy with the gun drops his ammo
      if (e.kind === 'gun') this.items.push({ x: e.x, y: e.y, kind: 'shells', got: 0 });
    }
  }

  // ---------- rendering ----------
  buildFlats() {
    // getImageData THROWS SecurityError on a canvas tainted by cross-origin
    // art (this game's CDN images have no CORS headers -- confirmed in-pane).
    // Unguarded, one throw here aborts render() every frame and the tunnel is
    // a permanent black screen with the sim still running underneath -- which
    // is exactly the failure a playtester reported. Floor/ceiling tiles are
    // local today so it doesn't fire, but one asset moving to the CDN would
    // black out the level, so it must never be able to take the renderer down.
    const grab = (id, fallback) => {
      const img = IMG[id];
      if (!img) return fallback;
      try {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 64, 64);
      return x.getImageData(0, 0, 64, 64).data;
      } catch (e) { console.warn('flat texture blocked (tainted canvas), using flat colour:', id); return fallback; }
    };
    this._flat = {
      floor: grab('tile_floor', null),
      ceil: grab('tile_ceil', null),
    };
  }

  render(ctx, now) {
    if (!this.sctx) return;
    if (!this._flat) this.buildFlats();
    const sc = this.sctx;

    // ---- floor + ceiling casting into a 320x180 ImageData ----
    // v13.1 perf rewrite (playtest: "tons of lag"): this loop used to call
    // Math.cos/sin THREE times per pixel -- ~350k trig calls a frame at
    // 320x180, the single hottest thing in the tunnel. Ray direction, fisheye
    // correction and the flashlight cone are per-COLUMN quantities, so they're
    // now precomputed once (cone/correction once ever, direction once per
    // frame) and the inner loop is pure multiply-add.
    if (!this._fdata) this._fdata = sc.createImageData(RW, RH);
    if (!this._cols) {
      this._cols = { ca: new Float32Array(RW), inv: new Float32Array(RW), cone: new Float32Array(RW) };
      for (let x = 0; x < RW; x++) {
        const colAng = (x / RW - 0.5) * FOV;
        this._cols.ca[x] = colAng;
        this._cols.inv[x] = 1 / Math.cos(colAng);
        this._cols.cone[x] = 0.28 + 0.72 * Math.max(0, Math.cos(colAng * 2.1)) ** 2;
      }
      this._dirX = new Float32Array(RW); this._dirY = new Float32Array(RW);
    }
    for (let x = 0; x < RW; x++) {
      const a = this.ang + this._cols.ca[x];
      this._dirX[x] = Math.cos(a) * this._cols.inv[x];
      this._dirY[x] = Math.sin(a) * this._cols.inv[x];
    }
    const px8 = this._fdata.data;
    const flick = 0.92 + 0.08 * Math.sin(now / 90) * Math.sin(now / 51 + 2) + (Math.sin(now / 4000) > 0.996 ? -0.3 : 0);
    const dirX = this._dirX, dirY = this._dirY, coneT = this._cols.cone;
    const ppx = this.px, ppy = this.py;
    const floorTex = this._flat.floor, ceilTex = this._flat.ceil;
    for (let y = 0; y < RH; y++) {
      const dy = y - HORIZON;
      if (dy === 0) continue;
      const below = dy > 0;
      const rowDist = (RH / 2) / (dy < 0 ? -dy : dy);
      const tex = below ? floorTex : ceilTex;
      let rowK = (1.68 - rowDist * 0.28) * flick;
      if (!below) rowK *= 0.7;
      let i = y * RW * 4;
      for (let x = 0; x < RW; x++, i += 4) {
        const wx = ppx + dirX[x] * rowDist;
        const wy = ppy + dirY[x] * rowDist;
        let r, g, b;
        if (tex) {
          const tx = ((wx * 64) | 0) & 63, ty = ((wy * 64) | 0) & 63;
          const j = ((ty << 6) + tx) << 2;
          r = tex[j]; g = tex[j + 1]; b = tex[j + 2];
        } else { r = below ? 40 : 16; g = below ? 28 : 11; b = below ? 16 : 7; }
        let lt = rowK * coneT[x];
        if (lt > 1) lt = 1; else if (lt < 0.09) lt = 0.09;
        px8[i] = r * lt; px8[i + 1] = g * lt; px8[i + 2] = b * lt; px8[i + 3] = 255;
      }
    }
    sc.putImageData(this._fdata, 0, 0);

    // ---- walls ----
    const texes = [IMG.tile_wall_dirt || IMG.tile_tunnel, IMG.tile_wall_bamboo || IMG.tile_tunnel, IMG.tile_wall_blood || IMG.tile_tunnel];
    const boost = this.fireT > 0 ? 0.4 : 0;
    for (let c = 0; c < RW; c++) {
      const colAng = (c / RW - 0.5) * FOV;
      const ra = this.ang + colAng;
      const rdx = Math.cos(ra), rdy = Math.sin(ra);
      let mapX = this.px | 0, mapY = this.py | 0;
      const ddx = Math.abs(1 / (rdx || 1e-9)), ddy = Math.abs(1 / (rdy || 1e-9));
      let stepX, stepY, sdx, sdy;
      if (rdx < 0) { stepX = -1; sdx = (this.px - mapX) * ddx; } else { stepX = 1; sdx = (mapX + 1 - this.px) * ddx; }
      if (rdy < 0) { stepY = -1; sdy = (this.py - mapY) * ddy; } else { stepY = 1; sdy = (mapY + 1 - this.py) * ddy; }
      let side = 0, guard = 0, hitCell = '#';
      while (guard++ < 64) {
        if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; } else { sdy += ddy; mapY += stepY; side = 1; }
        const cc = cellAt(this.grid, mapX, mapY);
        if (cc === '#' || cc === 'D') { hitCell = cc; break; }
      }
      const dist = Math.max(0.05, (side === 0 ? sdx - ddx : sdy - ddy) * Math.cos(colAng));
      this.zbuf[c] = dist;
      const hgt = RH / dist;
      const y0 = HORIZON - hgt / 2;
      let wallX = side === 0 ? this.py + dist / Math.cos(colAng) * rdy : this.px + dist / Math.cos(colAng) * rdx;
      wallX -= Math.floor(wallX);
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) wallX = 1 - wallX;
      const tex = texes[this.texId(mapX, mapY)];
      if (tex) {
        const tx = (wallX * tex.width) | 0;
        sc.drawImage(tex, tx, 0, 1, tex.height, c, y0, 1.5, hgt);
      } else {
        sc.fillStyle = side ? '#3a2a18' : '#452f1c';
        sc.fillRect(c, y0, 1.5, hgt);
      }
      // v13.1: wider cone + higher base so the tunnel is dark, not ILLEGIBLE.
      // The old values left everything past ~3 cells as undifferentiated murk,
      // which is most of why it played as "an unlit blurry maze".
      const cone = 0.30 + 0.70 * Math.max(0, Math.cos(colAng * 2.1)) ** 2;
      let b = Math.max(0, Math.min(1, (1.95 - dist * 0.24) * cone * flick + boost));
      if (side === 1) b *= 0.8;
      sc.fillStyle = `rgba(0,0,0,${(1 - b).toFixed(3)})`;
      sc.fillRect(c, y0 - 1, 1.5, hgt + 2);
      // secret wall: three glowing claw scratches. Gold pulse = "interact",
      // the same language the topside supply crates now use.
      if (hitCell === 'D' && dist < 9) {
        // v13.3: these were three flat gold RECTANGLES that pulsed -- Dylan
        // screenshotted them as "ugly stripes on the wall, and they breathe".
        // They're meant to be CLAW MARKS, so draw claw marks: three gashes
        // raked diagonally, tapering to a point at each end, torn through to
        // a hot core rather than painted on. Subtle at rest, unmistakable
        // once the torch beside them catches it.
        // Each gash runs ACROSS the wall (x from X0..X1) with its THICKNESS in
        // y -- a rake, not a bar. The first attempt made them thin in x, which
        // at any close range just draws three fat vertical stripes: exactly
        // the "ugly stripes that breathe" in Dylan's screenshot.
        const X0 = 0.16, X1 = 0.84;
        if (wallX > X0 && wallX < X1) {
          const u = (wallX - X0) / (X1 - X0);            // 0..1 along the gash
          const taper = Math.sin(Math.PI * u) ** 0.6;    // points at both ends
          const glow = 0.55 + 0.2 * Math.sin(now / 420 + mapX * 2 + mapY);
          for (let k = 0; k < 3; k++) {
            const yc = y0 + hgt * (0.30 + k * 0.115 + u * 0.30); // parallel, raking down-right
            const th = Math.max(1, hgt * 0.022 * taper);
            sc.fillStyle = `rgba(18,10,5,${(0.9 * taper).toFixed(2)})`;      // torn-open shadow
            sc.fillRect(c, yc - th, 1.5, th * 2);
            sc.fillStyle = `rgba(255,196,80,${(glow * taper * Math.min(1, b + 0.4)).toFixed(2)})`;
            sc.fillRect(c, yc - th * 0.35, 1.5, th * 0.7); // hot core inside the gash
          }
        }
      }
    }

    // ---- sprites (lowres, z-buffered) ----
    const proj = (wx, wy) => {
      const dx = wx - this.px, dy = wy - this.py;
      let da = Math.atan2(dy, dx) - this.ang;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      return { da, d: Math.hypot(dx, dy) * Math.cos(da), raw: Math.hypot(dx, dy) };
    };
    const sprites = [];
    for (const pl of this.pools) sprites.push({ x: pl[0], y: pl[1], kind: 'pool', r: pl[2], sk: pl[3] });
    for (const e of this.enemies) {
      if (e.kind === 'barrel') { if (!e.dead) sprites.push({ x: e.x, y: e.y, kind: 'barrel', e }); continue; }
      if (e.st === 'hide' && !e.dead) {
        // v13.1 fairness: a hidden ambusher within sight shows glowing eyes in
        // the dark BEFORE it bursts. The playtest verdict on the old tunnel
        // was "I lost 8 lives to something I never saw" -- now you see it.
        const dHide = Math.hypot(e.x - this.px, e.y - this.py);
        if (dHide < 6.5 && this.los(e.x, e.y)) sprites.push({ x: e.x, y: e.y, kind: 'eyes', e });
        continue;
      }
      if (e.dead && e.noCorpse) continue;
      sprites.push({ x: e.x, y: e.y, kind: e.dead ? 'corpse' : 'enemy', e });
      // v13.2 (loop-1 playtest: SIX deaths to "ghosts" -- alerted stalkers
      // hunting through corridors too dark to read): live knife-cats keep
      // their eyeshine in EVERY state, so whatever the light does, the eyes
      // give the position away. Cat eyes shine in the dark; so do rat eyes.
      if (!e.dead && e.kind !== 'gun') sprites.push({ x: e.x, y: e.y, kind: 'eyes', e, over: 1 });
    }
    for (const t2 of this.torches) sprites.push({ x: t2.x, y: t2.y, kind: 'torch', tc: t2 });
    for (const b2 of this.bolts) sprites.push({ x: b2.x, y: b2.y, kind: 'bolt' });
    for (const bl of this.blasts) if (bl.t >= 0) sprites.push({ x: bl.x, y: bl.y, kind: 'blast', bl });
    for (const it of this.items) if (!it.got) sprites.push({ x: it.x, y: it.y, kind: it.kind });
    if (this.mittens && !this.result.rescued) sprites.push({ x: this.mittens.x, y: this.mittens.y, kind: 'mittens' });
    if (this.exit) sprites.push({ x: this.exit.x, y: this.exit.y, kind: 'exit' });
    for (const g of this.gore) sprites.push({ x: g.x, y: g.y, kind: 'gore', g });
    for (const s of sprites) s.dd = Math.hypot(s.x - this.px, s.y - this.py);
    sprites.sort((a, b) => b.dd - a.dd);
    for (const s of sprites) {
      const pr = proj(s.x, s.y);
      if (Math.abs(pr.da) > FOV / 2 + 0.4 || pr.d < 0.12) continue;
      const d = pr.d;
      const sx = (0.5 + pr.da / FOV) * RW;
      const col = Math.max(0, Math.min(RW - 1, sx | 0));
      if (this.zbuf[col] < d - 0.12 && s.kind !== 'gore') continue;
      const b = Math.max(0.1, Math.min(1, (1.85 - d * 0.26) * (0.3 + 0.7 * Math.max(0, Math.cos(pr.da * 2.4))) * flick));
      const floorY = HORIZON + (RH / 2) / d;
      if (s.kind === 'pool') {
        sc.fillStyle = s.sk === 'scorch' ? `rgba(24,20,14,${(0.85 * b + 0.1).toFixed(2)})` : `rgba(110,10,8,${(0.75 * b).toFixed(2)})`;
        sc.beginPath(); sc.ellipse(sx, floorY - 1, (s.r * RH * 0.5) / d, (s.r * RH * 0.14) / d, 0, 0, 7); sc.fill();
        continue;
      }
      if (s.kind === 'gore') {
        if (this.zbuf[col] < d - 0.12) continue;
        const gy = HORIZON + (RH / 2) / d - (s.g.z * RH) / d;
        sc.fillStyle = s.g.chz ? `rgba(255,190,50,${b})` : s.g.dirt ? `rgba(90,66,40,${b})` : `rgba(170,18,12,${b})`;
        const gr = Math.max(1, 2.6 / d);
        sc.fillRect(sx - gr / 2, gy - gr / 2, gr, gr);
        continue;
      }
      if (s.kind === 'eyes') {
        // paired amber eyes floating in the dark, with a slow blink
        const blink = ((now / 2900 + s.x * 0.37 + s.y * 0.61) % 1) > 0.93;
        if (blink) continue;
        // Sit the eyeshine on the HEAD. Enemy sprites draw from
        // y0 = HORIZON - (RH*0.49)/d at height (RH*0.74)/d, so eye level is
        // about 18% down from the top of the sprite -- the old constant put
        // the glow on the cat's chest, which read as buttons up close.
        const eh = HORIZON - (RH * 0.36) / d;
        const gap = (RH * 0.055) / d, er = Math.max(0.8, (RH * 0.016) / d);
        // v13.3: amber-on-brown was invisible (loop 3 spotted GREEN rat eyes at
        // range but never once saw the amber VC eyes across five deaths --
        // amber sat on the same hue as the dirt walls). Both kinds now use a
        // cold cyan-white core that shares no hue with the tunnel, sit on a
        // dark backing disc so they pop against torchlight too, and pulse.
        const ec = this.enemyKind === 'rat' ? '150,255,90' : '150,240,255';
        const tw = 0.75 + 0.25 * Math.sin(now / 220 + s.x * 3);
        sc.fillStyle = 'rgba(0,0,0,0.55)';
        sc.beginPath(); sc.arc(sx, eh, gap * 1.5, 0, 7); sc.fill();
        const gl = sc.createRadialGradient(sx, eh, 0, sx, eh, gap * 3.0);
        gl.addColorStop(0, `rgba(${ec},${(0.5 * tw).toFixed(2)})`);
        gl.addColorStop(1, `rgba(${ec},0)`);
        sc.fillStyle = gl;
        sc.beginPath(); sc.arc(sx, eh, gap * 3.0, 0, 7); sc.fill();
        const er2 = er * 1.35;
        sc.fillStyle = `rgba(${ec},1)`;
        sc.fillRect(sx - gap - er2 / 2, eh - er2 / 2, er2, er2);
        sc.fillRect(sx + gap - er2 / 2, eh - er2 / 2, er2, er2);
        sc.fillStyle = 'rgba(255,255,255,0.9)';
        sc.fillRect(sx - gap - er2 / 4, eh - er2 / 4, er2 / 2, er2 / 2);
        sc.fillRect(sx + gap - er2 / 4, eh - er2 / 4, er2 / 2, er2 / 2);
        continue;
      }
      if (s.kind === 'blast') {
        // the game's own 16-frame explosion sheet, billboarded into the
        // raycaster so a tunnel blast looks like every other blast
        const es = SHEET.sheet_explosion;
        const size = (RH * 0.95 * s.bl.s) / d;
        const cy2 = HORIZON + (RH * 0.5) / d - (s.bl.z * RH) / d;
        if (es) {
          const fr = Math.min(es.frames - 1, Math.floor(s.bl.t / (1000 / es.fps)));
          const sxs = (fr % es.cols) * es.cw, sys = Math.floor(fr / es.cols) * es.ch;
          try { sc.drawImage(es.img, sxs, sys, es.cw, es.ch, sx - size / 2, cy2 - size / 2, size, size); } catch (_) {}
        } else {
          const k2 = Math.min(1, s.bl.t / 500);
          const r2 = size * 0.5 * (0.25 + k2 * 0.75);
          const gr2 = sc.createRadialGradient(sx, cy2, 0, sx, cy2, r2);
          gr2.addColorStop(0, `rgba(255,${(240 - k2 * 150) | 0},180,${(1 - k2).toFixed(2)})`);
          gr2.addColorStop(0.6, `rgba(255,${(140 - k2 * 90) | 0},40,${(0.8 * (1 - k2)).toFixed(2)})`);
          gr2.addColorStop(1, 'rgba(120,40,10,0)');
          sc.fillStyle = gr2;
          sc.beginPath(); sc.arc(sx, cy2, r2, 0, 7); sc.fill();
        }
        continue;
      }
      if (s.kind === 'bolt') {
        const by2 = HORIZON + (RH * 0.06) / d;
        const br = Math.max(1.2, (RH * 0.035) / d);
        const bc = this.enemyKind === 'rat' ? '140,255,60' : '255,190,80';
        const gl = sc.createRadialGradient(sx, by2, 0, sx, by2, br * 3);
        gl.addColorStop(0, `rgba(${bc},0.55)`);
        gl.addColorStop(1, `rgba(${bc},0)`);
        sc.fillStyle = gl;
        sc.beginPath(); sc.arc(sx, by2, br * 3, 0, 7); sc.fill();
        sc.fillStyle = `rgba(${bc},1)`;
        sc.fillRect(sx - br / 2, by2 - br / 2, br, br);
        sc.fillStyle = 'rgba(255,255,240,0.9)';
        sc.fillRect(sx - br / 4, by2 - br / 4, br / 2, br / 2);
        continue;
      }
      if (s.kind === 'torch') {
        // real sconce art (v13.2 -- the procedural stick+triangle version got
        // called "a weird torch"), with a live warm halo behind it
        const fh = (RH * 0.34) / d;
        const baseY = HORIZON + (RH * 0.5) / d / 2;
        const fl = 0.75 + 0.25 * Math.sin(now / 70 + s.tc.ph * 2.3) * Math.sin(now / 113 + s.tc.ph);
        const gl = sc.createRadialGradient(sx, baseY - fh * 0.7, 0, sx, baseY - fh * 0.7, fh * 1.7);
        gl.addColorStop(0, `rgba(255,180,80,${(0.34 * fl).toFixed(2)})`);
        gl.addColorStop(1, 'rgba(255,150,60,0)');
        sc.fillStyle = gl;
        sc.beginPath(); sc.arc(sx, baseY - fh * 0.7, fh * 1.7, 0, 7); sc.fill();
        const timg = IMG.torch_wall;
        if (timg) {
          const tw = fh * (timg.width / timg.height);
          try { sc.drawImage(timg, sx - tw / 2, baseY - fh, tw, fh); } catch (_) {}
          sc.globalAlpha = Math.min(0.5, Math.max(0, 1 - b - 0.25));
          sc.fillStyle = '#000';
          sc.fillRect(sx - tw / 2, baseY - fh, tw, fh);
          sc.globalAlpha = 1;
        }
        continue;
      }
      if (s.kind === 'barrel') {
        const bimg = IMG.barrel_drum;
        const bh = (RH * 0.36) / d;
        const byB = HORIZON + (RH * 0.5) / d / 2 - bh;
        // gold pulse under it = shootable, same language as the topside crates
        const pulse = 0.5 + 0.5 * Math.sin(now / 280 + s.x * 2);
        const gl2 = sc.createRadialGradient(sx, byB + bh * 0.55, 0, sx, byB + bh * 0.55, bh * 0.75);
        gl2.addColorStop(0, `rgba(255,201,60,${(0.20 * pulse + 0.06).toFixed(2)})`);
        gl2.addColorStop(1, 'rgba(255,201,60,0)');
        sc.fillStyle = gl2;
        sc.beginPath(); sc.arc(sx, byB + bh * 0.55, bh * 0.75, 0, 7); sc.fill();
        if (bimg) {
          const bw = bh * (bimg.width / bimg.height);
          try { sc.drawImage(bimg, sx - bw / 2, byB, bw, bh); } catch (_) {}
          sc.globalAlpha = Math.min(0.8, 1 - b);
          sc.fillStyle = '#000';
          sc.fillRect(sx - bw / 2, byB, bw, bh);
          sc.globalAlpha = 1;
          if (s.e.fuse > 0) { // lit: it's about to go
            sc.globalAlpha = 0.5 + 0.5 * Math.sin(now / 30);
            sc.fillStyle = 'rgba(255,255,220,0.9)';
            sc.fillRect(sx - bw / 2, byB, bw, bh);
            sc.globalAlpha = 1;
          }
        }
        continue;
      }
      if (s.kind === 'shells') {
        const simg = IMG.ammo_shells;
        const shH = (RH * 0.16) / d;
        const syB = HORIZON + (RH * 0.5) / d / 2 - shH;
        const pulse2 = 0.5 + 0.5 * Math.sin(now / 300);
        const gl3 = sc.createRadialGradient(sx, syB + shH * 0.4, 0, sx, syB + shH * 0.4, shH * 1.3);
        gl3.addColorStop(0, `rgba(255,201,60,${(0.22 * pulse2 + 0.05).toFixed(2)})`);
        gl3.addColorStop(1, 'rgba(255,201,60,0)');
        sc.fillStyle = gl3;
        sc.beginPath(); sc.arc(sx, syB + shH * 0.4, shH * 1.3, 0, 7); sc.fill();
        if (simg) {
          const shW = shH * (simg.width / simg.height);
          try { sc.drawImage(simg, sx - shW / 2, syB, shW, shH); } catch (_) {}
          sc.globalAlpha = Math.min(0.7, 1 - b);
          sc.fillStyle = '#000';
          sc.fillRect(sx - shW / 2, syB, shW, shH);
          sc.globalAlpha = 1;
        }
        continue;
      }
      if (s.kind === 'exit') {
        // THE LIGHT AT THE END: a volumetric shaft from a hole in the ceiling
        const topY = HORIZON - (RH * 0.55) / d;
        const w0 = (RH * 0.22) / d, w1 = (RH * 0.42) / d;
        const gr = sc.createLinearGradient(0, topY, 0, floorY);
        gr.addColorStop(0, `rgba(255,244,200,${Math.min(0.95, 0.9 * b + 0.25)})`);
        gr.addColorStop(1, 'rgba(255,238,180,0.06)');
        sc.fillStyle = gr;
        sc.beginPath();
        sc.moveTo(sx - w0, topY); sc.lineTo(sx + w0, topY);
        sc.lineTo(sx + w1, floorY); sc.lineTo(sx - w1, floorY);
        sc.fill();
        sc.fillStyle = `rgba(255,246,210,${Math.min(0.9, b + 0.3)})`;
        sc.beginPath(); sc.ellipse(sx, topY, w0, w0 * 0.35, 0, 0, 7); sc.fill();
        sc.fillStyle = `rgba(255,240,190,${0.35 * b + 0.1})`;
        sc.beginPath(); sc.ellipse(sx, floorY, w1 * 1.15, w1 * 0.3, 0, 0, 7); sc.fill();
        // dust motes drifting in the beam
        for (const m of this.motes) {
          const my = topY + ((m[1] + now / 9000 * m[2]) % 1) * (floorY - topY);
          const mx = sx + (m[0] - 0.5) * w1 * 1.6;
          sc.fillStyle = `rgba(255,250,220,${0.5 * b})`;
          sc.fillRect(mx, my, 1, 1);
        }
        continue;
      }
      const size = (RH * (s.kind === 'enemy' || s.kind === 'corpse' ? 0.74 : s.kind === 'mittens' ? 0.6 : 0.34)) / d;
      const y0 = HORIZON + (RH * 0.5) / d / 2 - size;
      sc.save();
      let img = null;
      if (s.kind === 'enemy') {
        // v10.2 (Dylan: "the enemies are barely animated and not high
        // resolution enough... redo the enemies from scratch"): rat_blade
        // used to be a single static pose with zero animation — now it gets
        // the same walk/lunge/hurt state machine the VC knife enemies use.
        const walking = (s.e.animT / 220 | 0) % 2 === 0;
        if (s.e.kind === 'gun') {
          img = this.enemyKind === 'rat' ? IMG.alien_trooper : (IMG.grunt_vc || IMG.vc_knife_a);
          // aim windup: a red glow that swells over the tell — the "he's about
          // to shoot" read, visible even in the dark
          if (s.e.aiming) {
            const k2 = Math.min(1, (s.e.aimT || 0) / 680);
            const gy2 = HORIZON - (RH * 0.05) / d;
            const gr2 = (RH * (0.16 + k2 * 0.22)) / d;
            const gl2 = sc.createRadialGradient(sx, gy2, 0, sx, gy2, gr2);
            gl2.addColorStop(0, `rgba(255,60,40,${(0.20 + 0.35 * k2).toFixed(2)})`);
            gl2.addColorStop(1, 'rgba(255,60,40,0)');
            sc.fillStyle = gl2;
            sc.beginPath(); sc.arc(sx, gy2, gr2, 0, 7); sc.fill();
          }
        } else if (this.enemyKind === 'rat') {
          if (s.e.flash > 0 && IMG.rat_blade_hurt) img = IMG.rat_blade_hurt;
          else if (s.e.st === 'lunge' || s.e.st === 'wind') img = IMG.rat_blade_lunge || IMG.rat_blade;
          else if (s.e.st === 'burst') img = IMG.rat_blade;
          else img = walking ? (IMG.rat_blade_walk1 || IMG.rat_blade) : (IMG.rat_blade_walk2 || IMG.rat_blade);
          if (!img) img = IMG.alien_trooper;
        } else {
          // v10 (Dylan: "the animation for the enemies is super flat and
          // sucks, completely redo it"): real walk cycle for chase, a
          // dedicated lunge pose instead of reusing the idle frame, and a
          // brief hit-react frame when just shot.
          if (s.e.flash > 0 && IMG.vc_knife_hurt) img = IMG.vc_knife_hurt;
          else if (s.e.st === 'lunge' || s.e.st === 'wind') img = IMG.vc_knife_lunge2 || IMG.vc_knife_a || IMG.grunt_vc;
          else if (s.e.st === 'burst') img = IMG.vc_knife_a || IMG.grunt_vc;
          else img = walking ? (IMG.vc_knife_walk1 || IMG.vc_knife_a || IMG.grunt_vc) : (IMG.vc_knife_walk2 || IMG.vc_knife_b || IMG.grunt_vc);
        }
      } else if (s.kind === 'corpse') {
        img = this.enemyKind === 'rat' ? IMG.alien_trooper : (IMG.vc_corpse || IMG.grunt_vc);
      } else if (s.kind === 'mittens') img = IMG.grunt_us; // was hero_us -- see the vignette fix note above, same wrong-sprite bug
      else if (s.kind === 'shotgun') img = IMG.pickup_shotgun_glow || IMG.fps_shotgun || IMG.pickup_flame;
      else if (s.kind === 'raygun') img = IMG.pickup_raygun;
      else if (s.kind === 'tuna') img = IMG.pickup_health;
      // v13.3: Mittens is the reason the level exists and he was lit exactly
      // like a wall. A cage-lamp halo behind him reads through the dark from
      // down the corridor, and it brightens as you close so "getting warmer"
      // is visible rather than only a compass label.
      if (s.kind === 'mittens' && img) {
        const glow = 0.45 + (this.mittensGlow || 0) * 0.55;
        const pulse = 0.82 + Math.sin(now / 320) * 0.18;
        const my = y0 + size * 0.5;
        const gr = sc.createRadialGradient(sx, my, 0, sx, my, size * 1.15);
        gr.addColorStop(0, `rgba(255,236,180,${(0.42 * glow * pulse).toFixed(3)})`);
        gr.addColorStop(0.55, `rgba(230,180,90,${(0.18 * glow * pulse).toFixed(3)})`);
        gr.addColorStop(1, 'rgba(120,80,30,0)');
        sc.save(); sc.globalCompositeOperation = 'lighter';
        sc.fillStyle = gr;
        sc.beginPath(); sc.arc(sx, my, size * 1.15, 0, 7); sc.fill();
        sc.restore();
      }
      if (s.kind === 'shotgun' && img) {
        // v10 (Dylan: "two hands holding onto the shotgun... just make it a
        // gun that's spinning around with a light on it, illuminated, so it
        // looks enticing to pick up"): spin in place + a pulsing glow halo,
        // no viewmodel hands.
        const spin = (now / 480) % (Math.PI * 2);
        const glowPulse = 0.5 + 0.5 * Math.sin(now / 220);
        sc.save();
        sc.translate(sx, y0 + size * 0.5);
        const asp2 = img.width / img.height;
        const gr = sc.createRadialGradient(0, 0, 0, 0, 0, size * 0.75);
        gr.addColorStop(0, `rgba(255,225,120,${(0.55 * b * (0.6 + glowPulse * 0.4)).toFixed(2)})`);
        gr.addColorStop(1, 'rgba(255,225,120,0)');
        sc.fillStyle = gr;
        sc.beginPath(); sc.arc(0, 0, size * 0.75, 0, 7); sc.fill();
        sc.scale(Math.cos(spin) || 0.001, 1); // flat spin around the vertical axis
        sc.globalAlpha = 1;
        try { sc.drawImage(img, -size * asp2 / 2, -size / 2, size * asp2, size); } catch (_) {}
        sc.restore();
      } else if (s.kind === 'tuna' && img) {
        const bob = Math.sin(now / 260) * size * 0.06;
        const asp2 = img.width / img.height;
        sc.globalAlpha = 1;
        try { sc.drawImage(img, sx - size * asp2 / 2, y0 + bob, size * asp2, size); } catch (_) {}
        sc.globalAlpha = Math.min(0.8, 1 - b);
        sc.fillStyle = '#000';
        sc.fillRect(sx - size * asp2 / 2, y0 + bob, size * asp2, size);
      } else if (s.kind === 'tuna') {
        sc.fillStyle = `rgba(143,154,164,${b})`;
        sc.beginPath(); sc.ellipse(sx, y0 + size * 0.85, size * 0.4, size * 0.22, 0, 0, 7); sc.fill();
      } else if (img) {
        const useCorpseSprite = s.kind === 'corpse' && this.enemyKind !== 'rat' && IMG.vc_corpse;
        if (s.kind === 'corpse' && !useCorpseSprite) {
          sc.translate(sx, y0 + size); sc.rotate(1.45); sc.translate(-sx, -(y0 + size));
        }
        const asp = img.width / img.height;
        const sw = size * asp;
        const drawH = useCorpseSprite ? size * 0.5 : size;
        const drawY = useCorpseSprite ? y0 + size * 0.5 : y0;
        // burning enemies glow hot and flicker while they cook
        if (s.e && s.e.burn > 0) sc.filter = `brightness(${(1.5 + 0.5 * Math.random()).toFixed(2)}) saturate(2.2) hue-rotate(-18deg)`;
        else if (s.e && s.e.flash > 0) sc.filter = 'brightness(1.7) saturate(1.5)';
        sc.globalAlpha = 1;
        try { sc.drawImage(img, sx - sw / 2, drawY, sw, drawH); } catch (_) {}
        sc.filter = 'none';
        // live enemies never dim past 55% black -- a threat must stay readable
        // at the edge of the light (loop-1: "killed by something I never saw")
        sc.globalAlpha = Math.min(s.e && !s.e.dead ? 0.55 : 0.8, 1 - b);
        sc.fillStyle = '#000';
        sc.fillRect(sx - sw / 2, drawY, sw, drawH);
      }
      sc.restore();
    }

    // ---- throat-grab script rendering (in lowres world, enemy filling the view) ----
    if (this.script && !this.script.done) {
      const s = this.script;
      const face = IMG.vc_knife_a || IMG.grunt_vc;
      if (face) {
        let k = 0; // 0..1 approach
        if (s.phase === 'appear') k = Math.min(1, s.t / 620);
        else k = 1;
        const size = RH * (0.5 + k * 1.1);
        const shake = s.phase === 'grapple' ? Math.sin(now / 38) * 4 : s.phase === 'rip' ? Math.sin(now / 22) * 8 : 0;
        sc.save();
        if (s.phase === 'rip') sc.filter = 'brightness(1.3) saturate(1.6)';
        const asp = face.width / face.height;
        sc.drawImage(face, RW / 2 - size * asp / 2 + shake, RH - size, size * asp, size);
        sc.restore();
      }
    }

    // ---- upscale the retro scene ----
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.sc, 0, 0, RW, RH, 0, 0, W, H);

    // ---- tunnel exit: straight fade to white ----
    // v12 (Dylan: "inside the tunnel when you leave, get rid of the animation
    // of the cat arms floating up just fade to white and then from white back
    // into the other scene where he comes out of the tunnel"). The old exit
    // alternated two fps_claws sprites at W*0.18 and W*0.6, sliding each up
    // 130px on a 420ms cycle, to fake a climb — it read as two disembodied
    // paws bobbing in mid-air. Removed entirely; the white-out now carries the
    // transition on its own, and main.js fades back IN from white on the far
    // side so the cut reads as one continuous move out of the tunnel.
    if (this.crawl > 0) {
      const k = Math.min(1, this.crawl / 1900);
      // ease-in so the light builds slowly then takes the screen quickly
      const a = Math.min(1, Math.pow(k, 1.6) * 1.12);
      ctx.fillStyle = `rgba(255,250,238,${a.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      return; // no viewmodel/hud during the exit
    }

    // blast bloom: a hot white wash that decays fast, so an explosion lights
    // the whole corridor for an instant
    if (this.flash > 0) {
      const k = this.flash / 420;
      ctx.fillStyle = `rgba(255,236,190,${(0.55 * k * k).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // ---- screen blood splats ----
    for (const sp of this.splats) {
      ctx.fillStyle = `rgba(150,12,8,${Math.min(0.55, sp.t / 1200)})`;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(sp.x + sp.r * 0.5, sp.y + sp.r * 0.6, sp.r * 0.35, 0, 7); ctx.fill();
    }
    // hurt vignette
    // v13: directional damage arcs at the screen edge. Angle is stored relative
    // to the view at the moment of the hit, so it stays pinned to the attacker
    // in world space as the player turns to face it.
    for (const d2 of this.dmgDir) {
      // stored as a WORLD angle, so subtracting the CURRENT view angle keeps
      // the arc pinned to the attacker while the player turns toward it.
      // -PI/2 puts "dead ahead" at the top of the screen, so the arc reads like
      // a compass: swing until it climbs to 12 o'clock and the threat is in
      // front of you.
      const rel = Math.atan2(Math.sin(d2.w - this.ang), Math.cos(d2.w - this.ang));
      const a = rel - Math.PI / 2;
      const k = Math.min(1, d2.t / 1500);
      const cx = W / 2, cy = H / 2, R0 = Math.min(W, H) * 0.42;
      ctx.save();
      ctx.globalAlpha = k * 0.85;
      ctx.strokeStyle = '#e8342a';
      ctx.lineWidth = 16 * k;
      ctx.beginPath();
      ctx.arc(cx, cy, R0, a - 0.42, a + 0.42);
      ctx.stroke();
      ctx.restore();
    }
    // v13: the "I knew I forgot something" vignette. Mittens in the dark,
    // scared, hugging his minigun, lit by a single weak flicker, breathing a
    // frightened meow-shiver. Drawn as a letterboxed inset over the tunnel view
    // so the player never loses their footing in the level.
    if (this.vignette) {
      const vt = this.vignette.t, VT = this.vignette.T;
      // ease in over 400ms, hold, ease out over the last 700ms
      const a = Math.min(1, Math.min(vt / 400, (VT - vt) / 700));
      ctx.save();
      ctx.globalAlpha = a;
      // letterbox
      const bar = H * 0.14;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
      // darkened frame
      ctx.fillStyle = 'rgba(4,5,4,0.86)';
      ctx.fillRect(0, bar, W, H - bar * 2);
      // flickering shaft of light on him
      const flick = 0.62 + 0.38 * Math.abs(Math.sin(vt / 190)) * (0.7 + 0.3 * Math.sin(vt / 47));
      const cx = W / 2, cy = H * 0.60;
      const lg = ctx.createRadialGradient(cx, cy - 90, 10, cx, cy - 40, 300);
      lg.addColorStop(0, `rgba(255,214,140,${(0.30 * flick).toFixed(3)})`);
      lg.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, bar, W, H - bar * 2);
      // Mittens himself, shivering. There's no dedicated Mittens sprite in the
      // asset pipeline (he's never had his own art -- topside he's rendered
      // with the same grunt_us sprite as the other two squad buddies, see
      // SPRITE_FOR.buddy in render.js). This was drawing IMG.hero_us -- the
      // PLAYER's own portrait -- which put Sgt. Whiskers in the tunnel
      // shivering at himself. grunt_us at least matches how Mittens already
      // reads everywhere else he appears in the game.
      const mi = IMG.grunt_us;
      if (mi) {
        const mh = H * 0.46, mw = mh * (mi.width / mi.height);
        const shiver = Math.sin(vt / 55) * 1.8 + Math.sin(vt / 23) * 0.9;
        ctx.save();
        ctx.globalAlpha = a * (0.55 + 0.45 * flick);
        ctx.translate(cx + shiver, cy - mh * 0.1);
        ctx.drawImage(mi, -mw / 2, -mh / 2, mw, mh);
        ctx.restore();
      }
      // his own little scared meow, as a shaking caption under him
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = '#f3e9c8';
      ctx.font = 'bold 22px "Courier New", monospace';
      ctx.textAlign = 'center';
      const wob = Math.sin(vt / 70) * 2;
      ctx.fillText('...mrrow?', cx + wob, H * 0.80);
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
    if (this.hurtT > 0) {
      ctx.fillStyle = `rgba(160,20,10,${Math.min(0.5, this.hurtT / 900)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // ---- flashlight screen-space veil (bright center, dark edges) ----
    const swx = this.sway * 2;
    const rg = ctx.createRadialGradient(W / 2 + swx, H * 0.58, H * 0.18, W / 2 + swx, H * 0.58, H * 0.85);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, `rgba(0,0,0,${0.55 * (2 - flick)})`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    // ---- weapon viewmodel with real animation ----
    this.drawViewmodel(ctx, now);

    // shell casings (screen space)
    for (const cs of this.casings) {
      ctx.save();
      ctx.translate(cs.x, cs.y); ctx.rotate(cs.r);
      ctx.fillStyle = `rgba(210,170,80,${Math.min(1, cs.t / 500)})`;
      ctx.fillRect(-5, -2, 10, 4);
      ctx.restore();
    }

    // crosshair
    ctx.fillStyle = 'rgba(243,233,200,0.8)';
    ctx.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);

    // v10 wayfinding compass: a pulsing blood-red chevron pointing toward
    // the next objective, relative to where the camera is currently facing.
    if (this.navAng !== undefined) {
      let rel = this.navAng - this.ang;
      while (rel > Math.PI) rel -= 2 * Math.PI;
      while (rel < -Math.PI) rel += 2 * Math.PI;
      // hysteresis: with the target dead-behind, rel oscillates across +/-PI
      // and the chevron used to thrash between screen edges (loop-1). Past
      // 150 degrees it now sticks to whichever side it was already on.
      if (Math.abs(rel) > 2.6) rel = (this._navSide || (rel >= 0 ? 1 : -1)) * Math.abs(rel);
      else this._navSide = rel >= 0 ? 1 : -1;
      const cxp = W / 2 + Math.max(-1, Math.min(1, rel / (FOV * 0.7))) * (W * 0.34);
      // Compass moved to the TOP of the screen. At the bottom it sat directly
      // behind the weapon sprite, so it was legible only while you were facing
      // the WRONG way -- it vanished at the exact moment it said "you're
      // aimed right" (loop 3). Nothing occludes the top strip.
      const cyp = 86;
      const pulse = 0.6 + 0.4 * Math.sin(now / 260);
      ctx.save();
      ctx.translate(cxp, cyp);
      ctx.rotate(Math.PI / 2 + Math.max(-1.1, Math.min(1.1, rel)));
      ctx.fillStyle = `rgba(200,30,20,${(0.55 * pulse).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(0, -13); ctx.lineTo(11, 8); ctx.lineTo(0, 3); ctx.lineTo(-11, 8);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // v13.1: name what the arrow points at. The compass existed for three
      // versions and the round-2 playtester never once mentioned it -- an
      // unlabeled dim chevron reads as decoration, "-> MITTENS" reads as a
      // waypoint.
      if (this._navLabel) {
        // "SHOTGUN · 14" -- the pace count is what tells you you're getting
        // warmer, which the bare arrow never could (loop-1: lost for half the
        // session with the compass working "correctly")
        const lbl = this._navDist != null ? `${this._navLabel} · ${this._navDist}` : this._navLabel;
        ctx.save();
        ctx.globalAlpha = 0.55 + 0.35 * pulse;
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#26231c'; ctx.fillText(lbl, cxp + 1, cyp + 25);
        ctx.fillStyle = '#FFC93C'; ctx.fillText(lbl, cxp, cyp + 24);
        ctx.restore();
      }
    }

    this.drawAutomap(ctx, now);

    // kill/secret score pops, rising gold — the same reward beat as topside
    ctx.textAlign = 'center';
    let popY = H * 0.30;
    for (const pop of this.pops) {
      const k = 1 - pop.t / (pop.n >= 500 ? 1100 : 900);
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - k) * 1.8);
      ctx.font = `bold ${pop.n >= 500 ? 30 : 22}px monospace`;
      ctx.fillStyle = '#26231c'; ctx.fillText('+' + pop.n, W / 2 + 2, popY - k * 40 + 2);
      ctx.fillStyle = pop.n >= 500 ? '#FFC93C' : '#fff3d0';
      ctx.fillText('+' + pop.n, W / 2, popY - k * 40);
      ctx.restore();
      popY += 30;
    }
    ctx.textAlign = 'left';
  }

  drawViewmodel(ctx, now) {
    // grapple: the throat-rip viewmodel replaces the weapon
    // v10 (Dylan: "make the throat-ripping animation more gruesome and have
    // more frames in it"): 3-frame sequence instead of one static image —
    // grapple struggle (fps_throat) -> mid-rip, blood starting to spray
    // (fps_throat_mid) -> aftermath, held a beat so the gore actually reads
    // (fps_throat_aftermath) -- before the script marks itself done.
    if (this.script && !this.script.done && (this.script.phase === 'grapple' || this.script.phase === 'rip')) {
      let img;
      if (this.script.phase === 'grapple') img = IMG.fps_throat || IMG.fps_claws;
      else img = (this.script.t > 500 ? IMG.fps_throat_aftermath : IMG.fps_throat_mid) || IMG.fps_throat || IMG.fps_claws;
      if (img) {
        const hh = H * 0.62;
        const asp = img.width / img.height;
        const shake = Math.sin(now / 30) * (this.script.phase === 'rip' ? 14 : 6);
        ctx.drawImage(img, W / 2 - hh * asp / 2 + shake, H - hh, hh * asp, hh);
      }
      return;
    }
    // v13: no more knife viewmodel -- claws are the only melee (Dylan's call).
    const knifing = false;
    // v10 (Dylan: "the gun is still facing sideways... there's no animation
    // for it reloading, there's no animation for it even firing"): a real
    // fire/reload state machine instead of one static per-weapon sprite. The
    // fire/reload art has the muzzle flash and shell casing painted directly
    // into the frame (see fps_pistol_fire/fps_shotgun_fire), so no separate
    // procedural flash overlay is needed anymore.
    // v13 fix (was: claws only ever drew when 'claws' was the equipped weapon,
    // but K is bound as a melee action on TOP of whatever gun you're holding
    // -- see the K handler above -- so in the common case, striking showed no
    // claws and no blood at all, just the generic slash streak). Swap the
    // viewmodel to the claws sprite for the swing AND for as long as they're
    // bloodied afterward, then fall back to the held weapon.
    // Blood LINGERS 2.6s, but it must not hijack the viewmodel that whole
    // time: with the old condition, one claw hit replaced your shotgun with
    // bloody paws for 2.6 seconds while you were still firing it. Blood only
    // tints the claws when the claws are what's actually on screen -- i.e.
    // mid-swipe, or claws are the equipped weapon.
    const clawOverlay = (this.clawT || 0) > 0 || this.weap === 'claws';
    let id;
    if (clawOverlay) id = 'fps_claws';
    else if (this.weap === 'pistol') id = this.reloadT > 0 ? 'fps_pistol_reload' : this.fireT > 40 ? 'fps_pistol_fire' : 'fps_pistol';
    else if (this.weap === 'shotgun') {
      const rackPh = this.pumpT > 0 ? (620 - this.pumpT) : -1;
      const racking = rackPh >= SHOTGUN_RACK_MS[0] && rackPh <= SHOTGUN_RACK_MS[1];
      id = this.fireT > 40 ? 'fps_shotgun_fire' : racking ? 'fps_shotgun_reload' : 'fps_shotgun';
    } else id = 'fps_claws';
    const fallbackId = clawOverlay ? 'fps_claws' : this.weap === 'pistol' ? 'fps_pistol' : this.weap === 'shotgun' ? 'fps_shotgun' : 'fps_claws';
    const img = IMG[id] || IMG[fallbackId];
    if (!img) return;
    // movement bob: figure-8; turn sway lags; fire kick + recoil rotation
    const bx = Math.sin(this.walkT / 240) * 16 + this.sway;
    const by = Math.abs(Math.sin(this.walkT / 120)) * 12;
    const fireK = Math.max(0, this.fireT) / 130;
    const kick = fireK * (this.weap === 'shotgun' ? 34 : 20);
    const rot = -fireK * (this.weap === 'shotgun' ? 0.10 : 0.07) + this.sway * 0.0016;
    // shotgun pump cycle dip
    let pump = 0;
    if (this.pumpT > 0 && this.weap === 'shotgun') {
      const ph = 620 - this.pumpT;
      if (ph > 150 && ph < 450) pump = Math.sin((ph - 150) / 300 * Math.PI) * 46;
    }
    // v13 (Dylan's circled screenshots: the forearms stop dead at the bottom of
    // the screen with bare background either side of them). The viewmodel was
    // drawn at exactly vh=340 with y0 = H - vh, so the sprite's bottom edge
    // landed EXACTLY on the screen edge -- and any downward bob/kick/pump then
    // lifted... no, pushed it down, exposing the cut. Two fixes: draw bigger,
    // and deliberately overhang the bottom so the arms run off-screen the way
    // every FPS viewmodel does, instead of terminating in mid-air.
    // Claws draw BIGGER with a much deeper overhang: at 408/0.90 the sprite's
    // bottom edge sat only 41px past the screen, and the sway/thrust rotation
    // (pivot near bottom-center) lifts a corner by up to ~30px -- Dylan's
    // circled screenshots show exactly that: both paw bottoms cut off in
    // mid-air. 500/0.82 puts the bottom ~90px offscreen, beyond anything the
    // rotation can expose.
    const isClaw = id === 'fps_claws';
    const vh = isClaw ? 500 : 408;
    const vw = vh * (img.width / img.height);
    const x0 = W / 2 - vw / 2 + bx;
    const y0 = H - vh * (isClaw ? 0.82 : 0.90) + by + kick + pump;
    // v13 claw strike (Dylan: "they should animate coming out of your fur more
    // and have blood on them after you strike a cat with them"). The claw
    // viewmodel used to be a static sprite with only a white arc drawn over it,
    // which is why a swing read as "nothing happens". Now the paws lunge along
    // the view axis and rock, so the strike has a real anticipation-and-thrust
    // shape, and the claws stay bloodied for a couple of seconds afterwards.
    const clawK = clawOverlay ? Math.max(0, (this.clawT || 0)) / 210 : 0;
    // 0 -> 1 -> 0 over the swipe: quick thrust out, slower settle back
    const thrust = clawK > 0 ? Math.sin(Math.min(1, (1 - clawK) * 1.6) * Math.PI) : 0;
    ctx.save();
    ctx.translate(x0 + vw / 2, H + 40);
    ctx.rotate(rot + thrust * 0.10);
    ctx.translate(-(x0 + vw / 2), -(H + 40));
    const cScale = 1 + thrust * 0.16;          // paws come at the camera
    const cw = vw * cScale, ch = vh * cScale;
    const cx0 = x0 - (cw - vw) / 2;
    const cy0 = y0 - (ch - vh) + thrust * 26;  // and drive upward into the target
    ctx.drawImage(img, cx0, cy0, cw, ch);
    // blood: tint just the sprite's own pixels via source-atop in an offscreen
    // pass, so it stains the claws rather than painting a rectangle on screen.
    const bl = Math.max(0, this.clawBlood || 0);
    if (bl > 0 && clawOverlay) {
      const a = Math.min(1, bl / 2600) * 0.55;
      if (!this._bloodCv || this._bloodCv.width !== img.width || this._bloodCv.height !== img.height) {
        this._bloodCv = document.createElement('canvas');
        this._bloodCv.width = img.width; this._bloodCv.height = img.height;
      }
      const bc = this._bloodCv.getContext('2d');
      bc.clearRect(0, 0, img.width, img.height);
      bc.drawImage(img, 0, 0);
      bc.globalCompositeOperation = 'source-atop';
      // heaviest at the claw tips (top of the sprite), fading down the forearm
      const bg = bc.createLinearGradient(0, 0, 0, img.height);
      bg.addColorStop(0, 'rgba(150,10,10,0.95)');
      bg.addColorStop(0.42, 'rgba(150,10,10,0.35)');
      bg.addColorStop(0.75, 'rgba(150,10,10,0)');
      bc.fillStyle = bg;
      bc.fillRect(0, 0, img.width, img.height);
      bc.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a;
      ctx.drawImage(this._bloodCv, cx0, cy0, cw, ch);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // melee slash streak
    if (this.meleeT > 0) {
      const k = this.meleeT / 210;
      ctx.strokeStyle = `rgba(240,240,235,${(k * 0.8).toFixed(2)})`;
      ctx.lineWidth = 10 * k;
      ctx.beginPath();
      ctx.arc(W / 2, H * 0.55, 190, -0.7 - (1 - k) * 1.3, 0.2 - (1 - k) * 1.3);
      ctx.stroke();
    }
    // v10: the fire-pose sprites (fps_pistol_fire/fps_shotgun_fire) have the
    // muzzle flash and ejecting shell painted directly at the barrel — the
    // old procedural star-burst overlay was positioned for the sideways gun
    // and would now double up/misalign with the new forward art. A quick
    // screen-space light bloom still sells the "impact" without fighting the
    // painted flash.
    if (this.fireT > 70 && (this.weap === 'pistol' || this.weap === 'shotgun')) {
      const k = (this.fireT - 70) / 40;
      ctx.fillStyle = `rgba(255,220,150,${(0.10 * k).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

// ---------- headless autopilot (test harness only) ----------
function distField(grid, tx, ty) {
  const field = new Map();
  field.set(tx + ',' + ty, 0);
  const q = [[tx, ty]];
  while (q.length) {
    const [cx, cy] = q.shift();
    const d = field.get(cx + ',' + cy);
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + ddx, ny = cy + ddy, key = nx + ',' + ny;
      const cc = cellAt(grid, nx, ny);
      if (field.has(key) || cc === '#' || cc === 'D') continue; // secrets are not on anyone's path
      field.set(key, d + 1);
      q.push([nx, ny]);
    }
  }
  return field;
}
export function botPlan(tun) {
  const targets = [];
  if (tun.mapIdx === 0) {
    if (tun.grabCell) targets.push({ x: tun.grabCell.x | 0, y: tun.grabCell.y | 0, done: () => tun.script && tun.script.done });
    for (const it of tun.items) if (it.kind === 'shotgun') targets.push({ x: it.x | 0, y: it.y | 0, done: () => it.got });
    if (tun.mittens) targets.push({ x: tun.mittens.x | 0, y: tun.mittens.y | 0, done: () => tun.result.rescued });
  }
  for (const it of tun.items) {
    if (it.kind === 'raygun') targets.push({ x: it.x | 0, y: it.y | 0, done: () => it.got });
  }
  targets.push({ x: tun.exit.x | 0, y: tun.exit.y | 0, done: () => false });
  return { targets, i: 0, fields: {}, mash: 0 };
}
export function botStep(tun, plan) {
  let b = 0;
  // in the grapple: mash J with press edges
  if (tun.script && !tun.script.done) {
    plan.mash++;
    return (plan.mash % 2) ? C.FIRE : 0;
  }
  while (plan.i < plan.targets.length - 1 && plan.targets[plan.i].done()) plan.i++;
  const tRec = plan.targets[plan.i];
  if (!tRec) return 0;
  const t2 = [tRec.x, tRec.y];
  const field = plan.fields[plan.i] || (plan.fields[plan.i] = distField(tun.grid, t2[0], t2[1]));
  const cx = tun.px | 0, cy = tun.py | 0;
  let wp = [t2[0] + 0.5, t2[1] + 0.5];
  let bestD = field.get(cx + ',' + cy) ?? 1e9;
  for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const key = (cx + ddx) + ',' + (cy + ddy);
    const d = field.get(key);
    if (d !== undefined && d < bestD) { bestD = d; wp = [cx + ddx + 0.5, cy + ddy + 0.5]; }
  }
  let da = Math.atan2(wp[1] - tun.py, wp[0] - tun.px) - tun.ang;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  if (da > 0.12) b |= C.R; else if (da < -0.12) b |= C.L;
  if (Math.abs(da) < 0.6) b |= C.UP;
  for (const e of tun.enemies) {
    if (e.dead || e.st === 'hide') continue;
    if (e.kind === 'barrel') continue; // the bot does not claw explosives point-blank
    const d = Math.hypot(e.x - tun.px, e.y - tun.py);
    let ea = Math.atan2(e.y - tun.py, e.x - tun.px) - tun.ang;
    while (ea > Math.PI) ea -= 2 * Math.PI;
    while (ea < -Math.PI) ea += 2 * Math.PI;
    if (d < 6 && Math.abs(ea) < 0.5) { b |= C.FIRE; if (d < 1.2) b |= C.GREN; break; }
  }
  return b;
}
