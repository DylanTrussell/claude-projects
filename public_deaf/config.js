// All balance & polish numbers live here (design/thresholds.md is the contract).
export const W = 1280, H = 720;            // logical canvas
export const STEP = 1000 / 60;

export const CFG = {
  dprCap: 1.5,
  // movement (FROZEN agency metrics)
  heroH: 96,
  run: 260,
  gravity: 1600,
  jumpVy: -700, // apex ~153px, jump length ~227px — clears every 120-150px pit with margin
  coyoteMs: 90,
  bufferMs: 120,
  invulnMs: 2000,
  hitInvulnMs: 900,       // i-frames after a non-fatal hit
  hitboxScale: 0.6,
  lives: 9,               // v13: Dylan's release number (was 20 for testing)
  hpMax: 5,               // health meter: most hits cost 1
  // weapons
  rifleCd: 160, rifleSpd: 760,
  gatlingCd: 66, gatlingAmmo: 200,
  // v13.3 Metal Slug weapon set. Tuned to the series' rule that every special
  // lands in a ~10-18s active-use band, against the rifle's 6.25 DPS baseline.
  // TRENCH BROOM: 7 pellets in a cone, huge close DPS, falls off with range.
  shotCd: 420, shotAmmo: 30, shotPellets: 7, shotSpread: 0.46, shotSpd: 900, shotRange: 300,
  // LAW TUBE: slow, heavy, splash. The commitment weapon.
  rocketCd: 700, rocketAmmo: 30, rocketSpd: 620, rocketSplash: 88, rocketDmg: 8,
  // SKIPPER: bouncing napalm canisters that leave fire pools.
  skipCd: 550, skipAmmo: 30, skipSpd: 380, skipBounce: 0.72, skipSplash: 90,
  raygunCd: 210, raygunSpd: 700, raygunAmmo: 60, raygunDmg: 2, raygunPierce: 3,
  // v13 (Dylan: "flamethrower is weak"). Faster cadence = a continuous stream
  // rather than a dotted line of puffs; a touch more reach and life so the
  // cone actually covers ground and leaves burning patches behind it.
  // flameAmmo 220 -> 480: at flameCd 34ms, 220 rounds is 7.5 seconds, the
  // SHORTEST duration of any weapon (raygun 12.6s, gatling 13.2s) despite
  // being the one-per-game crate reward. 480 puts it at ~16s, in line.
  flameCd: 34, flameSpd: 470, flameAmmo: 480, flameLife: 620,
  grenadeCd: 420, grenadeVy: -420, grenadeVx: 340, startGrenades: 5,
  grenadeRadius: 160, shrapnelN: 9, shrapnelSpd: 540, shrapnelLife: 340,
  meleeRange: 58, meleeCd: 320, meleeDmg: 3,
  cheeseVx: 300, cheeseVy: -360, cheeseLife: 6000, cheeseRadius: 260,
  // v13.3: 380ms was below the reaction floor. A typical simple visual
  // reaction is ~250ms and a slower player needs 400-600ms, so the tell
  // expired before they had moved -- and at close range (a grunt walks to
  // ~150px before firing) the whole tell-plus-travel budget collapsed to about
  // 850ms. The TUNNEL already uses 560ms and its own comment calls that "an
  // honest dodge window", which is the tell that 380 was never scrutinised.
  // 600 matches it and clears the floor.
  aimTellMs: 600,         // enemies visibly aim before firing — dodge window
  // enemies (slower, rarer, telegraphed shots = dodgeable)
  gruntHp: 2, gruntSpd: 70, gruntFireCd: 1800, gruntBulletSpd: 320,
  alienHp: 3, alienSpd: 85, alienFireCd: 1500, rayBulletSpd: 380,
  ufoHp: 5, ufoBeamDps: 0, ufoPull: 300, ufoHover: 150,
  heliHp: 24,
  // 320 was a measured 60s of holding one button -- half of ALL on-foot
  // playtime in the game, spent on the least interesting input. 140 overshot
  // the other way: five grenades (5 x 30 = 150) cleared it outright and the
  // best measured kill was 4.1s. 190 lands the rifle at ~30s (still down from
  // 51s) and the grenade line at ~8-15s, so the hatch read is worth making
  // without trivialising the fight. Pairs with b.open 2400 -> 1200 in sim.js.
  bossHp: 190,
  // pacing
  snapHz: 20, inputHz: 30, lerpMs: 100,
  // pools / caps (thresholds.md)
  maxEnemies: 60, bulletPool: 96, particlePool: 256,
  // polish (config data, live-tunable)
  shakeHit: 3, shakeBoom: 9, hitPauseMs: 40, flashMs: 90,
  // world
  worldLen: 11600,
  groundY: 620,
  sections: { A: 0, tunnel: 3000, invasion: 3800, B: 3900, exam: 6400, boss: 7000, ride: 8600, rideEnd: 11350 },
  // act III bike
  bikeBase: 250, bikeMin: 150, bikeMax: 400, bikeJumpVy: -620, bikeGunCd: 95,
  // audio mix (audio.md levels)
  // v13 (Dylan: "default the music volume higher 10% and lower sound effects
  // 10%"). Relative, not absolute: 0.22*1.10 and 0.50*0.90.
  gainMusic: 0.242, gainSfx: 0.45, gainHum: 0.27,
};

// Formula-derived palette for ALL procedural art (style contract, block 3/4).
export const PAL = {
  outline: '#26231c',       // dark charcoal
  jungle1: '#4c5d2a', jungle2: '#39481f', mud1: '#6b5233', mud2: '#4e3b24',
  khaki: '#b9a06a', khakiDark: '#8a7448', redAccent: '#c8372d',
  teal: '#3fa7a0', tealDark: '#2a6f6b', acid: '#8CFF3B', acidGlow: 'rgba(140,255,59,0.55)',
  cheese: '#FFC93C', cheeseDark: '#d99a1b',
  boom1: '#ff9a3c', boom2: '#ffd23c', smoke: 'rgba(60,55,45,0.55)',
  duskSky: '#7d5a3a', night: 'rgba(10,12,8,0.55)',
  hud: '#f3e9c8', hudDim: 'rgba(243,233,200,0.65)',
  tracer: '#ffe08a', ray: '#8CFF3B',
  // v13.3: blood was byte-identical to redAccent, so gore was the exact same
  // colour as the hero's bandana, his armbands and the HUD accent -- spray on
  // hero_us was indistinguishable from his costume, and it read orange rather
  // than red. Darker, deeper crimson separates it from the UI and the uniform.
  blood: '#8e1f1a', dirt: '#5d4a2e',
};

// Command bit flags (input as command objects; carries over the wire for guests)
export const C = { L: 1, R: 2, UP: 4, DOWN: 8, JUMP: 16, FIRE: 32, GREN: 64, CHEESE: 128 };

// Two clusters, no scattered aliases: LEFT HAND moves and aims (WASD or arrows),
// thumb jumps (Space), RIGHT HAND acts on one home-row run: J fire, K grenade, L special.
export const BIND = {
  KeyA: C.L, ArrowLeft: C.L,
  KeyD: C.R, ArrowRight: C.R,
  KeyW: C.UP, ArrowUp: C.UP,      // hold to aim up
  KeyS: C.DOWN, ArrowDown: C.DOWN,
  Space: C.JUMP,
  KeyJ: C.FIRE,
  KeyK: C.GREN,
  KeyL: C.CHEESE,                  // context: air support before the invasion, cheese lure after
};
// standard gamepad mapping
export const PADBIND = { 0: C.JUMP, 2: C.FIRE, 1: C.GREN, 3: C.CHEESE, 12: C.UP, 13: C.DOWN, 14: C.L, 15: C.R };
