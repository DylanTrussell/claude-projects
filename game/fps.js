// DOOM-in-the-tunnels v2: a Wolfenstein-style raycaster sub-game.
// Lowres 320x180 retro renderer with textured floor/ceiling casting, wall
// variants (dirt / bamboo shoring / blood), a real flashlight, knife-cat
// ambushers that burst out of the walls, DOOM gore, a scripted throat-rip
// setpiece, and a light-shaft exit with a crawl-out animation.
import { CFG, C, PAL, W, H } from './config.js';
import { IMG, drawImg } from './assets.js';

const FOV = 66 * Math.PI / 180;
const RW = 320, RH = 180;       // internal retro resolution
const HORIZON = RH / 2;
const MOVE = 3.1;               // cells/sec
const TURN = 2.6;               // rad/sec
const PISTOL_MAG = 10;          // v10: pistol now has a real magazine + reload beat
const PISTOL_RELOAD_MS = 820;
const SHOTGUN_RACK_MS = [150, 450]; // window inside pumpT where the reload/rack sprite shows

export const MAPS = [
  { // 0 — the VC tunnel: rescue Pvt. Mittens. Short, scripted, scary.
    // a = knife cat hiding in a wall niche   G = throat-grab corner
    // S = shotgun   T = tuna   M = Mittens   E = exit light-shaft
    enemies: 'vc',
    grid: [
      '############',
      '#P....##T..#',
      '#.##a.##.#.#',
      '#..#.....a.#',
      '#####G######',
      '#..a.S...#.#',
      '#.####.#.#.#',
      '#..#.a.#.#M#',
      '##.#.###.#.#',
      '#E.....a...#',
      '############',
    ],
    objective: 'fpsObjective0',
  },
  { // 1 — the rat nest (optional): grab their tech, get out
    enemies: 'rat',
    grid: [
      '##########',
      '#P..#..T.#',
      '#.#.##.#.#',
      '#.#a...#.#',
      '#.###a##.#',
      '#..#.R#..#',
      '##a#.#.###',
      '#..#.#..a#',
      '#E.......#',
      '##########',
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
    this.grid = def.grid.map(r => r);
    this.enemyKind = def.enemies;
    this.events = [];
    this.done = false;
    this.result = { rescued: false, shotgun: false, loot: 0, cleared: false };
    this.px = 1.5; this.py = 1.5; this.ang = 0;
    this.enemies = []; this.items = [];
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
        else if (c === 'a') this.enemies.push({ x: cx, y: cy, hx: cx, hy: cy, hp: this.enemyKind === 'rat' ? 3 : 2, st: 'hide', t: 0, atkT: 0, dead: 0, animT: 0, lungeT: 0 });
        else if (c === 'M') this.mittens = { x: cx, y: cy };
        else if (c === 'S') this.items.push({ x: cx, y: cy, kind: 'shotgun', got: 0 });
        else if (c === 'T') this.items.push({ x: cx, y: cy, kind: 'tuna', got: 0 });
        else if (c === 'R') this.items.push({ x: cx, y: cy, kind: 'raygun', got: 0 });
        else if (c === 'E') this.exit = { x: cx, y: cy };
        else if (c === 'G') this.grabCell = { x: cx, y: cy };
      }
    }
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      if (this.solid(this.px + Math.cos(a), this.py + Math.sin(a)) === false) { this.ang = a; break; }
    }
    this.weap = 'pistol';
    this.pistolLost = false;
    this.hasShotgun = false; this.shells = 0;
    this.fireCd = 0; this.meleeT = 0; this.fireT = 0; this.pumpT = 0;
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
  solid(x, y) { return cellAt(this.grid, x | 0, y | 0) === '#'; }

  tryMove(nx, ny) {
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

  alert(radius) {
    for (const e of this.enemies) {
      if (!e.dead && e.st !== 'hide' && Math.hypot(e.x - this.px, e.y - this.py) < radius) e.st = 'chase';
      else if (!e.dead && e.st === 'hide' && Math.hypot(e.x - this.px, e.y - this.py) < radius * 0.55) this.burst(e);
    }
  }

  burst(e) { // knife cat explodes out of the wall niche
    e.st = 'burst'; e.t = 0; e.animT = 0;
    this.ev({ e: 'sfx', n: 'sfx_screech' });
    this.ev({ e: 'shake' });
    for (let i = 0; i < 10; i++) {
      this.gore.push({ x: e.x, y: e.y, z: 0.3 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 2.4, vy: (Math.random() - 0.5) * 2.4, vz: 1 + Math.random() * 2, t: 700, dirt: 1 });
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
    this.t += dt;
    const dts = dt / 1000;
    this.fireCd -= dt; this.meleeT -= dt; this.fireT -= dt; this.hurtT -= dt; this.pumpT -= dt;
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
      else if (s.phase === 'slap' && s.t > 460) { s.phase = 'grapple'; s.t = 0; s.meter = 12; this.weap = 'claws'; this.pistolLost = true; this.ev({ e: 'hint', k: 'grabPrompt' }); }
      else if (s.phase === 'grapple') {
        s.meter -= 16 * dts;
        if ((bits & C.FIRE) && !(this.prevBits & C.FIRE)) { s.meter += 13; this.ev({ e: 'sfx', n: 'sfx_meow' }); }
        s.hurtAcc = (s.hurtAcc || 0) + dt;
        if (s.hurtAcc > 1500) { s.hurtAcc = 0; p.hp -= 1; this.hurtT = 500; this.ev({ e: 'fpsHurt' }); if (p.hp <= 0) { p.hp = 1; } } // the grapple can bleed you but never kill
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
    let fwd = 0;
    if (bits & C.UP) fwd += 1;
    if (bits & C.DOWN) fwd -= 0.6;
    if (bits & C.JUMP) fwd += 1;
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
      } else if (this.weap === 'claws') {
        this.fireCd = 260; this.meleeT = 140;
        this.melee(1, 1.3);
      }
    }
    // K knife
    if ((bits & C.GREN) && !(this.prevBits & C.GREN) && this.meleeT <= -80) {
      this.meleeT = 170; this.fireCd = Math.max(this.fireCd, 200);
      this.ev({ e: 'sfx', n: 'sfx_knife' });
      this.melee(2, 1.45);
    }

    // items
    for (const it of this.items) {
      if (!it.got && Math.hypot(it.x - this.px, it.y - this.py) < 0.75) {
        it.got = 1;
        if (it.kind === 'shotgun') { this.hasShotgun = true; this.shells += 8; this.weap = 'shotgun'; this.result.shotgun = true; this.ev({ e: 'banner', k: 'gotShotgun' }); this.ev({ e: 'sfx', n: 'sfx_shotgun' }); }
        if (it.kind === 'tuna') { p.hp = Math.min(CFG.hpMax, p.hp + 2); this.ev({ e: 'banner', k: 'gotHealth' }); this.ev({ e: 'sfx', n: 'sfx_purr' }); }
        if (it.kind === 'raygun') { this.result.loot++; this.ev({ e: 'banner', k: 'gotRaygun' }); this.ev({ e: 'sfx', n: 'sfx_raygun' }); }
      }
    }
    if (this.mittens && !this.result.rescued && Math.hypot(this.mittens.x - this.px, this.mittens.y - this.py) < 0.7) {
      this.result.rescued = true;
      this.ev({ e: 'banner', k: 'mittensFreed' });
      this.ev({ e: 'sfx', n: 'sfx_purr' });
      this.ev({ e: 'hint', k: 'followLight' });
    }
    // exit: the light at the end of the tunnel
    if (this.exit && Math.hypot(this.exit.x - this.px, this.exit.y - this.py) < 0.6) {
      const need = this.mapIdx === 0 ? this.result.rescued : this.result.loot > 0;
      if (need) {
        this.result.cleared = this.enemies.every(e => e.dead);
        this.crawl = 1;
        this.ev({ e: 'sfx', n: 'sfx_purr' });
        return;
      } else if (!this.exitHint || this.t - this.exitHint > 5000) {
        this.exitHint = this.t;
        this.ev({ e: 'hint', k: 'fpsNeedMittens' });
      }
    }

    // ---- knife enemies: hide -> burst -> stalk -> lunge ----
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.atkT -= dt; e.animT += dt;
      const d = Math.hypot(e.x - this.px, e.y - this.py);
      if (e.st === 'hide') {
        if (d < 1.9 && this.los(e.x, e.y)) this.burst(e);
        continue;
      }
      if (e.st === 'burst') { e.t += dt; if (e.t > 330) e.st = 'chase'; continue; }
      if (e.st === 'lunge') {
        e.t += dt;
        const spd = 5.2 * dts;
        const nx = e.x + e.lvx * spd, ny = e.y + e.lvy * spd;
        if (!this.solid(nx, e.y)) e.x = nx;
        if (!this.solid(e.x, ny)) e.y = ny;
        if (d < 0.7 && this.hurtT <= 0) {
          p.hp -= 1; this.hurtT = 700; e.st = 'recover'; e.t = 0;
          this.ev({ e: 'fpsHurt' });
          this.splats.push({ x: W * (0.3 + Math.random() * 0.4), y: H * (0.2 + Math.random() * 0.4), r: 60, t: 800 });
          if (p.hp <= 0) {
            p.deaths++; p.lives--; p.hp = CFG.hpMax;
            if (p.lives <= 0) { p.st = 'out'; this.done = true; this.result.dead = true; return; }
            this.px = this.spawn[0]; this.py = this.spawn[1];
            this.hurtT = 2000;
          }
        }
        if (e.t > 420) { e.st = 'recover'; e.t = 0; }
        continue;
      }
      if (e.st === 'recover') { e.t += dt; if (e.t > 620) e.st = 'chase'; continue; }
      // chase: stalk down the corridors
      if (d > 1.35) {
        const vx = (this.px - e.x) / d, vy = (this.py - e.y) / d;
        const spd = (this.enemyKind === 'rat' ? 2.3 : 2.0) * dts;
        const nx = e.x + vx * spd, ny = e.y + vy * spd;
        const R2 = 0.22;
        if (nx !== e.x && !this.solid(nx + (nx > e.x ? R2 : -R2), e.y)) e.x = nx;
        if (ny !== e.y && !this.solid(e.x, ny + (ny > e.y ? R2 : -R2))) e.y = ny;
      } else if (e.atkT <= 0) { // wind up a lunge — the knife flashes as the tell
        e.atkT = this.enemyKind === 'rat' ? 1050 : 1250;
        e.flash = 220;
        e.st = 'lunge'; e.t = 0;
        e.lvx = (this.px - e.x) / d; e.lvy = (this.py - e.y) / d;
        this.ev({ e: 'sfx', n: this.enemyKind === 'rat' ? 'sfx_laser' : 'sfx_screech' });
      }
      if (e.flash > 0) e.flash -= dt;
    }
    this.updateNav(dts);
    this.prevBits = bits;
  }

  // v10 (Dylan: "I still don't know how to get out of the tunnel, make some
  // kind of markings that I can follow"): reuses the same target-priority
  // list and BFS the headless autopilot already uses to find its way, but
  // just to steer a HUD compass arrow — the player still has to walk it.
  navTargets() {
    const targets = [];
    if (this.mapIdx === 0) {
      if (this.grabCell) targets.push({ x: this.grabCell.x | 0, y: this.grabCell.y | 0, done: () => this.script && this.script.done });
      for (const it of this.items) if (it.kind === 'shotgun') targets.push({ x: it.x | 0, y: it.y | 0, done: () => it.got });
      if (this.mittens) targets.push({ x: this.mittens.x | 0, y: this.mittens.y | 0, done: () => this.result.rescued });
    }
    for (const it of this.items) if (it.kind === 'raygun') targets.push({ x: it.x | 0, y: it.y | 0, done: () => it.got });
    if (this.exit) targets.push({ x: this.exit.x | 0, y: this.exit.y | 0, done: () => false });
    return targets;
  }

  updateNav(dts) {
    const targets = this.navTargets();
    const t2 = targets.find(t => !t.done());
    if (!t2) return;
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

  melee(dmg, range) {
    for (const e of this.enemies) {
      if (e.dead || e.st === 'hide') continue;
      const d = Math.hypot(e.x - this.px, e.y - this.py);
      if (d < range) {
        let da = Math.atan2(e.y - this.py, e.x - this.px) - this.ang;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        if (Math.abs(da) < 0.9) { this.hit(e, dmg, d < 1.0); return; }
      }
    }
  }

  hit(e, dmg, close) {
    e.hp -= dmg;
    if (e.st === 'hide') this.burst(e); else e.st = e.st === 'lunge' ? 'lunge' : 'chase';
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
    }
  }

  // ---------- rendering ----------
  buildFlats() {
    const grab = (id, fallback) => {
      const img = IMG[id];
      if (!img) return fallback;
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 64, 64);
      return x.getImageData(0, 0, 64, 64).data;
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
    if (!this._fdata) this._fdata = sc.createImageData(RW, RH);
    const px8 = this._fdata.data;
    const cosA = Math.cos(this.ang), sinA = Math.sin(this.ang);
    const flick = 0.92 + 0.08 * Math.sin(now / 90) * Math.sin(now / 51 + 2) + (Math.sin(now / 4000) > 0.996 ? -0.3 : 0);
    for (let y = 0; y < RH; y++) {
      const dy = y - HORIZON;
      if (dy === 0) continue;
      const below = dy > 0;
      const rowDist = (RH / 2) / Math.abs(dy);
      const tex = below ? this._flat.floor : this._flat.ceil;
      for (let x = 0; x < RW; x++) {
        const colAng = (x / RW - 0.5) * FOV;
        const corr = rowDist / Math.cos(colAng);
        const wx = this.px + Math.cos(this.ang + colAng) * corr;
        const wy = this.py + Math.sin(this.ang + colAng) * corr;
        const i = (y * RW + x) * 4;
        let r, g, b;
        if (tex) {
          const tx = ((wx % 1 + 1) % 1 * 64) | 0, ty = ((wy % 1 + 1) % 1 * 64) | 0;
          const j = (ty * 64 + tx) * 4;
          r = tex[j]; g = tex[j + 1]; b = tex[j + 2];
        } else { r = below ? 40 : 16; g = below ? 28 : 11; b = below ? 16 : 7; }
        // flashlight cone + falloff
        const cone = 0.22 + 0.78 * Math.max(0, Math.cos(colAng * 2.4)) ** 2;
        let lt = Math.max(0.04, Math.min(1, (1.55 - rowDist * 0.30) * cone * flick));
        if (!below) lt *= 0.7;
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
      let side = 0, guard = 0;
      while (guard++ < 64) {
        if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; } else { sdy += ddy; mapY += stepY; side = 1; }
        if (cellAt(this.grid, mapX, mapY) === '#') break;
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
      const cone = 0.24 + 0.76 * Math.max(0, Math.cos(colAng * 2.4)) ** 2;
      let b = Math.max(0, Math.min(1, (1.8 - dist * 0.26) * cone * flick + boost));
      if (side === 1) b *= 0.8;
      sc.fillStyle = `rgba(0,0,0,${(1 - b).toFixed(3)})`;
      sc.fillRect(c, y0 - 1, 1.5, hgt + 2);
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
    for (const pl of this.pools) sprites.push({ x: pl[0], y: pl[1], kind: 'pool', r: pl[2] });
    for (const e of this.enemies) {
      if (e.st === 'hide' && !e.dead) continue; // invisible until they burst
      sprites.push({ x: e.x, y: e.y, kind: e.dead ? 'corpse' : 'enemy', e });
    }
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
        sc.fillStyle = `rgba(110,10,8,${(0.75 * b).toFixed(2)})`;
        sc.beginPath(); sc.ellipse(sx, floorY - 1, (s.r * RH * 0.5) / d, (s.r * RH * 0.14) / d, 0, 0, 7); sc.fill();
        continue;
      }
      if (s.kind === 'gore') {
        if (this.zbuf[col] < d - 0.12) continue;
        const gy = HORIZON + (RH / 2) / d - (s.g.z * RH) / d;
        sc.fillStyle = s.g.dirt ? `rgba(90,66,40,${b})` : `rgba(170,18,12,${b})`;
        const gr = Math.max(1, 2.6 / d);
        sc.fillRect(sx - gr / 2, gy - gr / 2, gr, gr);
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
        if (this.enemyKind === 'rat') {
          if (s.e.flash > 0 && IMG.rat_blade_hurt) img = IMG.rat_blade_hurt;
          else if (s.e.st === 'lunge') img = IMG.rat_blade_lunge || IMG.rat_blade;
          else if (s.e.st === 'burst') img = IMG.rat_blade;
          else img = walking ? (IMG.rat_blade_walk1 || IMG.rat_blade) : (IMG.rat_blade_walk2 || IMG.rat_blade);
          if (!img) img = IMG.alien_trooper;
        } else {
          // v10 (Dylan: "the animation for the enemies is super flat and
          // sucks, completely redo it"): real walk cycle for chase, a
          // dedicated lunge pose instead of reusing the idle frame, and a
          // brief hit-react frame when just shot.
          if (s.e.flash > 0 && IMG.vc_knife_hurt) img = IMG.vc_knife_hurt;
          else if (s.e.st === 'lunge') img = IMG.vc_knife_lunge2 || IMG.vc_knife_a || IMG.grunt_vc;
          else if (s.e.st === 'burst') img = IMG.vc_knife_a || IMG.grunt_vc;
          else img = walking ? (IMG.vc_knife_walk1 || IMG.vc_knife_a || IMG.grunt_vc) : (IMG.vc_knife_walk2 || IMG.vc_knife_b || IMG.grunt_vc);
        }
      } else if (s.kind === 'corpse') {
        img = this.enemyKind === 'rat' ? IMG.alien_trooper : (IMG.vc_corpse || IMG.grunt_vc);
      } else if (s.kind === 'mittens') img = IMG.hero_us;
      else if (s.kind === 'shotgun') img = IMG.pickup_shotgun_glow || IMG.fps_shotgun || IMG.pickup_flame;
      else if (s.kind === 'raygun') img = IMG.pickup_raygun;
      else if (s.kind === 'tuna') img = IMG.pickup_health;
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
        if (s.e && s.e.flash > 0) sc.filter = 'brightness(1.7) saturate(1.5)';
        sc.globalAlpha = 1;
        try { sc.drawImage(img, sx - sw / 2, drawY, sw, drawH); } catch (_) {}
        sc.filter = 'none';
        sc.globalAlpha = Math.min(0.8, 1 - b);
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

    // ---- screen blood splats ----
    for (const sp of this.splats) {
      ctx.fillStyle = `rgba(150,12,8,${Math.min(0.55, sp.t / 1200)})`;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(sp.x + sp.r * 0.5, sp.y + sp.r * 0.6, sp.r * 0.35, 0, 7); ctx.fill();
    }
    // hurt vignette
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
      const cxp = W / 2 + Math.max(-1, Math.min(1, rel / (FOV * 0.7))) * (W * 0.34);
      const cyp = H - 46;
      const pulse = 0.6 + 0.4 * Math.sin(now / 260);
      ctx.save();
      ctx.translate(cxp, cyp);
      ctx.rotate(Math.PI / 2 + Math.max(-1.1, Math.min(1.1, rel)));
      ctx.fillStyle = `rgba(200,30,20,${(0.55 * pulse).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(0, -13); ctx.lineTo(11, 8); ctx.lineTo(0, 3); ctx.lineTo(-11, 8);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
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
    const knifing = this.meleeT > 0 && this.prevBits & C.GREN;
    // v10 (Dylan: "the gun is still facing sideways... there's no animation
    // for it reloading, there's no animation for it even firing"): a real
    // fire/reload state machine instead of one static per-weapon sprite. The
    // fire/reload art has the muzzle flash and shell casing painted directly
    // into the frame (see fps_pistol_fire/fps_shotgun_fire), so no separate
    // procedural flash overlay is needed anymore.
    let id;
    if (knifing) id = 'fps_knife';
    else if (this.weap === 'pistol') id = this.reloadT > 0 ? 'fps_pistol_reload' : this.fireT > 40 ? 'fps_pistol_fire' : 'fps_pistol';
    else if (this.weap === 'shotgun') {
      const rackPh = this.pumpT > 0 ? (620 - this.pumpT) : -1;
      const racking = rackPh >= SHOTGUN_RACK_MS[0] && rackPh <= SHOTGUN_RACK_MS[1];
      id = this.fireT > 40 ? 'fps_shotgun_fire' : racking ? 'fps_shotgun_reload' : 'fps_shotgun';
    } else id = 'fps_claws';
    const fallbackId = knifing ? 'fps_knife' : this.weap === 'pistol' ? 'fps_pistol' : this.weap === 'shotgun' ? 'fps_shotgun' : 'fps_claws';
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
    const vh = 340;
    const vw = vh * (img.width / img.height);
    const x0 = W / 2 - vw / 2 + bx + (knifing ? 90 : 0);
    const y0 = H - vh + by + kick + pump;
    ctx.save();
    ctx.translate(x0 + vw / 2, H + 40);
    ctx.rotate(rot);
    ctx.translate(-(x0 + vw / 2), -(H + 40));
    ctx.drawImage(img, x0, y0, vw, vh);
    ctx.restore();
    // melee slash streak
    if (this.meleeT > 0) {
      const k = this.meleeT / 170;
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
      if (field.has(key) || cellAt(grid, nx, ny) === '#') continue;
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
    const d = Math.hypot(e.x - tun.px, e.y - tun.py);
    let ea = Math.atan2(e.y - tun.py, e.x - tun.px) - tun.ang;
    while (ea > Math.PI) ea -= 2 * Math.PI;
    while (ea < -Math.PI) ea += 2 * Math.PI;
    if (d < 6 && Math.abs(ea) < 0.5) { b |= C.FIRE; if (d < 1.2) b |= C.GREN; break; }
  }
  return b;
}
