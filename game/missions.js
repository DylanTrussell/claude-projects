// PART TWO -- six more missions across Vietnam, Metal Slug rules.
//
// Self-contained on purpose. The Part One side-scroller (sim.js) is a thicket
// of scripted beats -- insertion, tunnels, the duel, the ride -- and bolting six
// new levels onto it would have meant disarming every one of them per level.
// This is its own small run-and-gun engine behind the same modal contract the
// rails use: step(bits, dt, p) / render(ctx, now) / done. main.js runs it the
// way it runs the door gun or the boat, so Part One cannot be broken from here.
//
// The route forks twice, in the world, by walking: every mission that branches
// ends on a high road and a low road, each marked with what is waiting there.
//
//   BRIDGE -> (CITADEL | CAVES) -> (GRAVEYARD | COAST) -> HIVE
//
// The dead stay dead until slot three. Between slot two and slot three main.js
// plays the Cine 'rising': the cats blow up a fleeing ooze tanker, the green
// rain comes down on every rat they have killed, and the rats get back up.
// Zombies (zombie, fatz, the boss 'zero') only appear in GRAVEYARD and COAST.
import { CFG, C, PAL, W, H } from './config.js';
import { IMG, SHEET, drawImgHit, drawImgGlow, drawSheet } from './assets.js';

// where a lobbed shot will land: a shadow that tightens and a ground glow that
// heats up as it falls, so you read the spot without reading anything
function landMark(ctx, tx, wide, s, now) {
  const k = Math.max(0.2, Math.min(1, 1 - (GY - s.y) / 520)), p = 0.5 + 0.5 * Math.sin(now / 55);
  const rx = wide / 2;
  ctx.save();
  ctx.fillStyle = `rgba(20,8,4,${0.25 + 0.3 * k})`;
  ctx.beginPath(); ctx.ellipse(tx, GY - 2, rx * (0.45 + 0.55 * k), 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(255,70,20,${(0.2 + 0.3 * p) * (0.5 + 0.5 * k)})`;
  ctx.beginPath(); ctx.ellipse(tx, GY - 3, rx, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(214,30,16,${0.55 + 0.45 * p})`; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(tx, GY - 3, rx * (0.75 + 0.25 * k), 14, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = `rgba(255,220,110,${0.35 + 0.5 * p})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(tx, GY - 3, rx * (0.75 + 0.25 * k) - 4, 10, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
import { RailBase } from './rails.js';
import { drawMuzzleBurst } from './render.js';

const GY = 620;
const GRAV = 2300, RUN = 310, JUMP = -830;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- weapons --
const WEAP = {
  rifle: { cd: 150, dmg: 1, spd: 1150 },
  H: { cd: 62, dmg: 1, spd: 1250, ammo: 150 },   // heavy machine gun
  F: { cd: 55, dmg: 0.7, ammo: 90 },             // flame shot
  R: { cd: 430, dmg: 9, ammo: 20 },              // rocket launcher
};

// ------------------------------------------------------------------- rides --
// The road you take decides what you ride into the next mission. Every fork has
// its own pair (an exit's `ride`), the sign over each road shows that ride, and
// no ride is offered twice in a run: leaving the bridge it is the cyclo tank or
// the war buffalo, leaving slot two the gunship copter or the crab walker. A
// ride soaks the hits instead of you. When it goes, you are thrown clear.
//
// Tuning: seat = where the cat sits [x ahead of centre, y above the ground],
// gun = the saddle/nose gun muzzle [x, y], both in px at the ride's draw height
// hgt, measured in the direction the ride faces (nf: the art's own facing, +1 right). Change them here and nothing else moves.
const RIDE = {
  buffalo: { img: 'm_ride_buffalo', hgt: 176, hp: 3, run: 400, jump: -900, seat: [-24, 92], gun: [70, 162], cd: 62 },
  tank:    { img: 'm_ride_tank',    hgt: 156, hp: 5, run: 285, jump: -790, seat: [10, 58],   gun: [112, 78], cd: 80 },
  // flies: hold JUMP to climb, let go to sink gently. Nose gun, rockets on GREN.
  copter:  { img: 'm_ride_copter',  hgt: 130, hp: 4, run: 360, jump: -420, seat: [17, 70], gun: [88, 38], cd: 66, fly: 1, nf: -1 },   // art: nose and gun on the LEFT
  // walks: the claws snap whatever is in front of it, the saddle gun never runs dry
  crab:    { img: 'm_ride_crab',    hgt: 150, hp: 5, run: 300, jump: -820, seat: [-16, 112], gun: [62, 126], cd: 70, claw: 1 },
};
// Which ride carries you into mission `id` when you came in by road `via`.
// via is the fork you took ('up' = the stairs, 'low' = the road), as main.js
// stores it; a ride key also works. The road that leads into `id` names the ride.
export function rideInto(id, via) {
  if (RIDE[via]) return via;
  if (via !== 'up' && via !== 'low') return null;
  for (const M of Object.values(MISSIONS)) {
    const ex = M.exits; if (ex.length < 2) continue;
    const e = via === 'up' ? ex[0] : ex[ex.length - 1];
    if (e.to === id && e.ride) return e.ride;
  }
  return null;
}

// ----------------------------------------------------------------- enemies --
// nf = the art's native facing (+1 right). h = draw height. bw/bh = hit box.
const KIND = {
  rat:     { hp: 4,  img: 'alien_trooper', h: 92,  nf: -1, bw: 44, bh: 84,  pts: 100 },
  zombie:  { hp: 7,  img: 'm_zombie',      h: 104, nf: 1,  bw: 50, bh: 96,  pts: 150 },
  fatz:    { hp: 22, img: 'm_zombie_fat',  h: 150, nf: -1, bw: 90, bh: 140, pts: 400 },
  crab:    { hp: 16, img: 'm_crab',        h: 118, nf: -1, bw: 110, bh: 96, pts: 300 },
  jelly:   { hp: 5,  img: 'm_jelly',       h: 74,  nf: 1,  bw: 60, bh: 64,  pts: 150, fly: 1 },
  flamer:  { hp: 10,  img: 'm_flamer',      h: 104, nf: -1, bw: 56, bh: 96,  pts: 250 },
  chopper: { hp: 16, img: 'm_chopper',     h: 120, nf: -1, bw: 150, bh: 90, pts: 600, fly: 1, machine: 1 },
  ufo:     { hp: 10,  img: 'ufo_small',     h: 70,  nf: 1,  bw: 90, bh: 56,  pts: 300, fly: 1, machine: 1 },
};

// How each kind carries itself. Every enemy is one sprite, so all of this is
// transforms: br = breathing (scale), bp = breath period ms, step = stride bob px,
// sway = stride rock (rad), head = the head piece [x0,y0,x1,y1,pivotX,pivotY] in
// art fractions (null: the whole body moves as one), loll = idle head tilt.
const LIFE = {
  rat:     { br: 0.018, bp: 520, step: 5, sway: 0.05, head: [0, 0, 1, 0.42, 0.55, 0.42], loll: 0.05 },
  zombie:  { br: 0.02, bp: 900, step: 4, sway: 0.11, head: [0, 0, 1, 0.4, 0.5, 0.4], loll: 0.14 },
  fatz:    { br: 0.035, bp: 760, step: 3, sway: 0.05, head: [0, 0, 0.58, 0.5, 0.42, 0.48], loll: 0.08 },
  crab:    { br: 0.02, bp: 420, step: 3, sway: 0.03, head: null, loll: 0 },
  jelly:   { br: 0.09, bp: 380, step: 0, sway: 0, head: null, loll: 0 },
  flamer:  { br: 0.02, bp: 600, step: 6, sway: 0.06, head: [0, 0, 1, 0.38, 0.45, 0.38], loll: 0.05 },
  chopper: { br: 0, bp: 1, step: 0, sway: 0, head: null, loll: 0 },
  ufo:     { br: 0, bp: 1, step: 0, sway: 0, head: null, loll: 0 },
};

// ---------------------------------------------------------------- missions --
// ground: solid spans [x0,x1]. plats: one-way ledges [x,y,w]. waves trigger as
// the hero nears x; lock holds the camera until the wave is dead (the Metal
// Slug rule: the screen does not scroll past a fight).
const span = (len, pits) => { const g = []; let a = -200; for (const [p0, p1] of pits) { g.push([a, p0]); a = p1; } g.push([a, len + 1200]); return g; };
// A wave may carry `then`: a second half that comes in when the first is dead,
// on the same locked screen. heat speeds every enemy and boss cooldown in that
// mission (tells stay as long as they were), so the route ramps by slot.
// Layout rule: a locked wave never triggers on a pit lip. Every pit is either
// beyond the lock (w.x <= pit - 274) or well behind you (w.x >= pitEnd + 720).
export const MISSIONS = {
  // ---- slot 1
  bridge: {
    n: 2, bg: 'm_bg_sunset', theme: 'planks', music: 'music_gunner', len: 9000, chase: 1, heat: 1.15,
    ground: span(9000, [[1500, 1640], [2700, 2850], [3900, 4040], [4900, 5060], [5900, 6040], [6900, 7050]]),
    plats: [],
    crates: [[700, 'H'], [1900, 'gren'], [3100, 'R'], [4300, 'gren'], [5300, 'med'], [6300, 'F'], [7300, 'H'], [8560, 'med']],
    pows: [[2300, 'H'], [5500, 'R'], [6700, 'gren']],
    waves: [
      { x: 900, s: [['rat', 2, 'right']] },
      { x: 1700, s: [['rat', 2, 'right'], ['ufo', 1, 'sky']] },
      { x: 2400, s: [['flamer', 1, 'right'], ['rat', 2, 'right']] },
      { x: 3200, s: [['chopper', 1, 'sky'], ['rat', 2, 'right']] },
      { x: 4100, s: [['flamer', 1, 'right'], ['ufo', 1, 'sky'], ['rat', 2, 'right']] },
      { x: 5000, s: [['rat', 3, 'right'], ['chopper', 1, 'sky']] },
      { x: 5700, s: [['flamer', 2, 'right'], ['rat', 2, 'right']] },
      { x: 6400, s: [['rat', 3, 'right'], ['ufo', 1, 'sky']], then: [['flamer', 1, 'right']] },
      { x: 7100, s: [['chopper', 1, 'sky'], ['flamer', 1, 'right'], ['rat', 2, 'right']] },
    ],
    boss: 'eater', exits: [{ to: 'citadel', ride: 'tank' }, { to: 'caves', ride: 'buffalo' }],
  },
  // ---- slot 2
  caves: {
    n: 3, bg: 'm_bg_cave', theme: 'rock', weather: 'motes', music: 'music_tunnel', len: 6400, dark: 1, heat: 1.5,
    ground: span(6400, [[1620, 1780], [3440, 3660]]),
    plats: [[2000, 530, 170], [3470, 540, 150], [3900, 520, 180], [4120, 430, 160]],
    crates: [[500, 'H'], [1480, 'F'], [2050, 'gren'], [2900, 'med'], [3950, 'R'], [4150, 'gren'], [4760, 'H'], [5300, 'med']],
    pows: [[2200, 'R'], [4640, 'life']],
    waves: [
      { x: 700, lock: 1, s: [['jelly', 3, 'sky']], then: [['jelly', 2, 'sky'], ['rat', 2, 'right']] },
      { x: 1300, lock: 1, s: [['jelly', 3, 'sky'], ['rat', 2, 'right']], then: [['rat', 2, 'right'], ['jelly', 2, 'sky']] },
      { x: 2520, lock: 1, s: [['jelly', 4, 'sky'], ['rat', 2, 'right']], then: [['rat', 2, 'left'], ['jelly', 3, 'sky']] },
      { x: 3120, lock: 1, s: [['rat', 3, 'right'], ['jelly', 3, 'sky']], then: [['flamer', 1, 'right'], ['jelly', 2, 'sky']] },
      { x: 4400, lock: 1, s: [['flamer', 2, 'right'], ['jelly', 4, 'sky']], then: [['jelly', 3, 'sky'], ['rat', 2, 'left']] },
      { x: 5000, lock: 1, s: [['jelly', 5, 'sky'], ['rat', 3, 'left']], then: [['jelly', 4, 'sky'], ['rat', 2, 'right']] },
    ],
    boss: 'jellyq', exits: [{ to: 'graveyard', ride: 'copter' }, { to: 'coast', ride: 'crab' }],
    drips: 1,
  },
  citadel: {
    n: 3, bg: 'm_bg_citadel', theme: 'stone', weather: 'ash', music: 'music_invasion', len: 6600, heat: 1.45,
    ground: span(6600, [[1700, 1840], [3600, 3760]]),
    plats: [[1000, 530, 220], [1250, 440, 180], [2700, 520, 240], [4700, 530, 200], [4940, 440, 180]],
    crates: [[550, 'H'], [1280, 'R'], [2200, 'gren'], [3000, 'med'], [3900, 'F'], [4300, 'gren'], [4980, 'H'], [5500, 'med']],
    pows: [[1560, 'R'], [4150, 'life']],
    waves: [
      { x: 800, lock: 1, s: [['rat', 3, 'right'], ['flamer', 1, 'right']], then: [['rat', 1, 'left'], ['rat', 2, 'right']] },
      { x: 1400, lock: 1, s: [['rat', 3, 'right'], ['rat', 2, 'left']], then: [['rat', 2, 'right']] },
      { x: 2580, lock: 1, s: [['flamer', 1, 'right'], ['chopper', 1, 'sky'], ['rat', 2, 'right']], then: [['flamer', 1, 'left']] },
      { x: 3200, lock: 1, s: [['flamer', 1, 'right'], ['rat', 2, 'right'], ['ufo', 1, 'sky']], then: [['flamer', 1, 'right'], ['rat', 2, 'left']] },
      { x: 4480, lock: 1, s: [['flamer', 1, 'right'], ['rat', 2, 'left']], then: [['chopper', 1, 'sky'], ['flamer', 1, 'left']] },
      { x: 5100, lock: 1, s: [['rat', 3, 'right'], ['ufo', 2, 'sky']], then: [['flamer', 1, 'left'], ['rat', 3, 'right']] },
    ],
    boss: 'gunship', exits: [{ to: 'graveyard', ride: 'copter' }, { to: 'coast', ride: 'crab' }],
  },
  // ---- slot 3: after 'rising'. The rats you killed got back up.
  graveyard: {
    n: 4, bg: 'm_bg_graveyard', bgOnce: 1, theme: 'mud', weather: 'rain', music: 'music_tunnel', len: 6400, heat: 1.65,
    ground: span(6400, [[1720, 1850], [3520, 3660]]),
    plats: [[900, 520, 170], [2250, 510, 180], [2460, 430, 150], [3900, 520, 200]],
    crates: [[620, 'H'], [1560, 'gren'], [2290, 'F'], [2700, 'gren'], [3950, 'R'], [4200, 'gren'], [4760, 'H'], [5300, 'med']],
    pows: [[1150, 'F'], [3760, 'life']],
    waves: [
      { x: 800, lock: 1, s: [['zombie', 3, 'ground']], then: [['zombie', 2, 'ground'], ['rat', 2, 'right']] },
      { x: 1400, lock: 1, s: [['zombie', 3, 'ground'], ['rat', 2, 'right']], then: [['zombie', 2, 'ground'], ['rat', 2, 'left'], ['chopper', 1, 'sky']] },
      { x: 2600, lock: 1, s: [['fatz', 1, 'right'], ['zombie', 2, 'ground']], then: [['zombie', 3, 'ground'], ['rat', 2, 'left'], ['fatz', 1, 'right']] },
      { x: 3200, lock: 1, s: [['chopper', 1, 'sky'], ['zombie', 3, 'left']], then: [['zombie', 3, 'ground'], ['chopper', 1, 'sky']] },
      { x: 4400, lock: 1, s: [['zombie', 4, 'ground'], ['rat', 2, 'right'], ['fatz', 1, 'right']], then: [['fatz', 1, 'right'], ['zombie', 2, 'ground']] },
      { x: 5000, lock: 1, s: [['rat', 3, 'right'], ['zombie', 3, 'ground'], ['chopper', 1, 'sky']], then: [['zombie', 4, 'ground'], ['rat', 2, 'right']] },
    ],
    boss: 'zero', exits: [{ to: 'hive', icon: 'm_boss_core' }],
    flyover: 1,
  },
  coast: {
    n: 4, bg: 'm_bg_coast', theme: 'sand', music: 'music_rock', len: 6600, heat: 1.65,
    ground: span(6600, [[1700, 1850], [3600, 3760]]),
    plats: [[1150, 530, 200], [2900, 520, 220], [3150, 440, 160], [4700, 530, 200]],
    crates: [[600, 'H'], [1200, 'gren'], [2300, 'R'], [3380, 'med'], [4000, 'F'], [4750, 'H'], [4950, 'gren'], [5500, 'med']],
    pows: [[1560, 'H'], [4250, 'R']],
    // the drowned come up out of the sand with the crabs
    waves: [
      { x: 800, lock: 1, s: [['crab', 2, 'ground']], then: [['zombie', 2, 'ground'], ['rat', 2, 'right']] },
      { x: 1400, lock: 1, s: [['crab', 2, 'ground'], ['rat', 2, 'right']], then: [['zombie', 3, 'ground'], ['rat', 2, 'left']] },
      { x: 2580, lock: 1, s: [['crab', 1, 'ground'], ['chopper', 1, 'sky']], then: [['rat', 2, 'right'], ['zombie', 2, 'ground']] },
      { x: 3200, lock: 1, s: [['rat', 3, 'right'], ['zombie', 2, 'ground'], ['ufo', 1, 'sky']], then: [['crab', 2, 'ground'], ['rat', 2, 'left']] },
      { x: 4480, lock: 1, s: [['crab', 2, 'ground'], ['flamer', 1, 'right']], then: [['zombie', 3, 'ground'], ['ufo', 1, 'sky']] },
      { x: 5100, lock: 1, s: [['chopper', 1, 'sky'], ['crab', 2, 'ground'], ['rat', 2, 'left']], then: [['zombie', 3, 'ground']] },
    ],
    boss: 'barge', exits: [{ to: 'hive', icon: 'm_boss_core' }],
  },
  // ---- slot 4
  hive: {
    n: 5, bg: 'm_bg_hive', theme: 'metal', music: 'music_valkyries', len: 7600, heat: 2.2,
    ground: span(7600, [[1700, 1860], [3620, 3780], [5420, 5580]]),
    plats: [[1100, 530, 200], [2400, 520, 200], [2640, 430, 170], [4000, 530, 220], [5900, 520, 220]],
    crates: [[500, 'H'], [1150, 'R'], [2000, 'med'], [2680, 'F'], [3400, 'gren'], [4050, 'H'], [4900, 'R'], [5950, 'gren'], [6500, 'med']],
    pows: [[1500, 'H'], [4200, 'life'], [5800, 'R']],
    waves: [
      { x: 800, lock: 1, s: [['rat', 3, 'right']], then: [['rat', 2, 'left'], ['ufo', 1, 'sky']] },
      { x: 1400, lock: 1, s: [['flamer', 2, 'right'], ['jelly', 3, 'sky']], then: [['rat', 2, 'right'], ['jelly', 2, 'sky']] },
      { x: 2600, lock: 1, s: [['crab', 1, 'ground'], ['rat', 2, 'right'], ['ufo', 1, 'sky']], then: [['rat', 2, 'left'], ['flamer', 1, 'right']] },
      { x: 3200, lock: 1, s: [['crab', 1, 'ground'], ['rat', 2, 'left'], ['chopper', 1, 'sky']], then: [['crab', 1, 'ground'], ['jelly', 3, 'sky']] },
      { x: 4500, lock: 1, s: [['flamer', 2, 'right'], ['jelly', 3, 'sky']], then: [['crab', 1, 'ground'], ['rat', 2, 'right']] },
      { x: 5100, lock: 1, s: [['crab', 1, 'ground'], ['rat', 2, 'right'], ['ufo', 1, 'sky']], then: [['flamer', 1, 'left'], ['rat', 2, 'right']] },
      { x: 6300, lock: 1, s: [['chopper', 2, 'sky'], ['flamer', 2, 'right'], ['rat', 3, 'right']], then: [['jelly', 3, 'sky'], ['rat', 2, 'left']] },
    ],
    boss: 'core', exits: [], drips: 1,
  },
};
export const ROUTE_START = 'bridge';
// which slot each mission sits in (the heat ramp, the tests and the map read it)
export const SLOT = { bridge: 1, caves: 2, citadel: 2, graveyard: 3, coast: 3, hive: 4 };

// v14.6 (Dylan: "it needs to be chewing the bridge... what is the tank driving on... make it a cool futuristic
// alien hover tank"). The eater is an alien hover tank on four green jets. Its MOUTH CENTRE sits on the chew line
// at deck height, so the saws bite the planks; the hull floats over the river behind the bite.
const HT = { tilt: 0.22, k: 0.5, mouth: [840, 330], gun: [865, 95], jets: [150, 300, 520, 705], jetY: 505, saws: [[795, 245, 52], [940, 250, 50], [795, 405, 52], [940, 410, 50]] };
const HUD_GUN = [335, 53], HUD_BOMB = [458, 53], HUD_LIFE = [40, 40];   // where pickups fly to (screen)
const BOSS_FACE = { zero: 'm_zombie_fat', eater: 'm_boss_hovertank', jellyq: 'm_boss_jelly', barge: 'm_boss_barge', gunship: 'm_boss_gunship', core: 'm_boss_core' };
const THEME = {
  mud:    { a: '#5d6b3a', b: '#3b3a2c', c: '#23221b', d: '#74824a' },
  planks: { a: '#d9b98a', b: '#a57f52', c: '#5e4228', d: '#f0d9ae' },
  rock:   { a: '#2f6b55', b: '#1c4136', c: '#0e211c', d: '#48a37e' },
  sand:   { a: '#f2deab', b: '#d9bd7e', c: '#a98a52', d: '#fff3cf' },
  stone:  { a: '#8a8478', b: '#5b564d', c: '#34312c', d: '#aaa392' },
  metal:  { a: '#a08a52', b: '#5e5238', c: '#2e2a20', d: '#d6bd76' },
};

// =================================================================== Mission
export class Mission extends RailBase {
  constructor(id, o) {
    super(999999); o = o || {};
    const m = MISSIONS[id] || MISSIONS[ROUTE_START];
    this.id = MISSIONS[id] ? id : ROUTE_START; this.m = m;
    this.cam = 0; this.camLock = -1;
    this.h1 = { x: 220, y: -200, vx: 0, vy: 0, face: 1, onG: false, up: false, crouch: false, cd: 0, weap: 'rifle', ammo: 0, gren: 10, inv: 0, run: 0, safeX: 220, fire: 0, who: 'us' };
    this.h2 = null; this.kit2 = o.kit2 || null; this.prevBits2 = 0;   // v14.3 co-op: Charlie, played by P2
    this.c = { x: 150, y: -320, vy: 0, face: 1, cd: 600, run: 0, fire: 0 };       // Charlie
    this.en = []; this.shots = []; this.eshots = []; this.grens = []; this.parts = []; this.pops = [];
    this.picks = [];
    this.crates = m.crates.map(([x, k]) => ({ x, k, y: this.surfaceAt(x) }));
    this.pows = m.pows.map(([x, gift]) => ({ x, gift, st: 'tied', t: 0 }));
    this.waves = m.waves.map(w => ({ ...w, done: false, alive: [] }));
    this.phase = 'drop'; this.pt = 0;
    this.boss = null; this.score = 0; this.next = null; this.route = null;
    this.eater = m.chase ? { x: -700, eaten: 0, rev: 0, stop: false } : null;
    this.fly = m.flyover ? { t: 0 } : null;
    this.dripT = 2000; this.drips = [];
    this.arenaX = m.len - W; this.endX = m.len + 420;
    this.exitPlats = m.exits.length > 1 ? [[m.len - 70, GY - 66, 100], [m.len + 30, GY - 132, 100], [m.len + 130, GY - 196, 420]] : [];
    this.kills = 0; this.dur = 0; this.heat = m.heat || 1;
    // what you carried out of the last mission, and what you rode in on
    if (o.kit) { this.h1.weap = WEAP[o.kit.weap] ? o.kit.weap : 'rifle'; this.h1.ammo = o.kit.ammo || 0; this.h1.gren = Math.max(o.kit.gren || 0, 5); }
    this.via = o.via || null; this.ride = null; this.wreck = null;
    this.flyers = []; this.hudGunK = 0; this.hudBombK = 0;   // pickups flying up to the HUD icons
    const rk = rideInto(this.id, this.via);
    if (rk) { this.mount(rk); this.h1.x = -200; this.h1.y = GY; this.c.x = -330; this.c.y = GY; }
  }
  mount(k) { this.ride = { k, hp: RIDE[k].hp, flash: 0, ram: 0, shell: 0 }; }
  // The lead cat: Whiskers while P1 is in, Charlie if P1 has run dry. Everything
  // that used to mean "the hero" (camera, waves, the fork) follows the lead.
  get h() { const a = this.h1, b = this.h2; return (a.gone && b && !b.gone) ? b : a; }
  heroes() { const r = []; if (!this.h1.gone) r.push(this.h1); if (this.h2 && !this.h2.gone) r.push(this.h2); return r; }
  near(x) { let best = this.h, bd = 1e9; for (const q of this.heroes()) { const d = Math.abs(q.x - x); if (d < bd) { bd = d; best = q; } } return best; }
  leadX() { let x = -1e9; for (const q of this.heroes()) x = Math.max(x, q.x); return x > -1e9 ? x : this.h1.x; }
  // bosses spread their attention: each wind-up picks one cat, turn about
  bossTarget() { const hs = this.heroes(); if (hs.length < 2) return this.h; return hs[Math.floor(this.t / 3800) % 2]; }
  coopJoin(q) {
    if (this.h2) { this.h2.pl = q; return; }
    const lead = this.h, k = this.kit2 || {};
    const h2 = { x: this.c.x, y: this.c.y, vx: 0, vy: 0, face: 1, onG: false, up: false, crouch: false, cd: 0, weap: WEAP[k.weap] ? k.weap : 'rifle', ammo: k.ammo || 0, gren: Math.max(k.gren || 0, 10), inv: 2200, run: 0, safeX: lead.x, fire: 0, who: 'vc', pl: q };
    this.h2 = h2;
    if (this.phase !== 'drop') { h2.safeX = lead.x - 60; this.respawn(h2); h2.y = -120; h2.onG = false; h2.inv = 2600; }
    if (q && q.st === 'out') h2.gone = true;
  }
  coopRevive(q) {
    q.lives = CFG.lives; q.hp = CFG.hpMax; q.st = 'alive';
    const hh = q === this.h1.pl ? this.h1 : this.h2;
    if (!hh) return;
    hh.gone = false; hh.weap = 'rifle'; hh.ammo = 0; hh.gren = Math.max(hh.gren, 10);
    hh.safeX = this.leadX() - 60; this.respawn(hh); hh.y = -120; hh.onG = false; hh.inv = 2600;
  }
  // the ride is done: it burns where it stood and you are thrown clear
  bail() {
    const h = this.h1, r = this.ride; if (!r) return;
    this.wreck = { k: r.k, x: h.x, y: Math.min(h.y, GY), face: h.face, t: 0, vy: -120, rot: 0 };
    this.ride = null; this.shake = Math.max(this.shake, r.k === 'tank' ? 22 : 10);
    if (r.k === 'copter') { this.say({ e: 'sfx', n: 'sfx_shrapnel' }); for (let i = 0; i < 8; i++) this.fx('debris', h.x, h.y - 60, { vx: rnd(-260, 260), vy: rnd(-420, -100), T: 800, r: rnd(3, 7), col: i % 2 ? '#6e7350' : '#3a3d2c' }); }
    else if (r.k === 'crab') { this.say({ e: 'sfx', n: 'sfx_shrapnel' }); this.shake = Math.max(this.shake, 14); for (let i = 0; i < 10; i++) this.fx(i % 2 ? 'smoke' : 'debris', h.x + rnd(-60, 60), GY - rnd(10, 90), { vx: rnd(-200, 200), vy: rnd(-380, -60), T: 800, r: rnd(5, 12), col: i % 2 ? '#5a5a48' : '#7d7a4c' }); }
    else if (r.k === 'tank') { this.boomW(h.x, h.y - 70, 1); for (let i = 0; i < 12; i++) this.fx('debris', h.x, h.y - 60, { vx: rnd(-340, 340), vy: rnd(-560, -140), T: 900, r: rnd(4, 9) }); }
    else { this.say({ e: 'sfx', n: 'sfx_screech' }); for (let i = 0; i < 8; i++) this.fx('smoke', h.x + rnd(-60, 60), GY - rnd(0, 20), { vy: rnd(-60, -10), T: 600, r: rnd(10, 18), col: '#cdb893' }); }
    h.vy = -720; h.vx = -160 * h.face; h.onG = false; h.inv = 2200; h.soot = 4500;
  }
  // ---- terrain
  solid(x) {
    if (this.eater && !this.eater.stop && x < this.eater.x + this.eaterW() - 30) return false;
    for (const [a, b] of this.m.ground) if (x >= a && x <= b) return true;
    return false;
  }
  surfaceAt(x) { for (const [px, py, pw] of this.m.plats) if (x >= px && x <= px + pw) return py; return GY; }
  plats() { return this.phase === 'fork' || this.phase === 'out' ? this.m.plats.concat(this.exitPlats) : this.m.plats; }
  eaterW() { const ht = IMG.m_boss_hovertank; if (ht) return ht.width * HT.k; const im = IMG.m_boss_eater; return im ? 340 * (im.width / im.height) : 600; }
  // land an actor: returns the y it rests on, or null if falling
  land(a, prevY) {
    if (a.vy < 0) return null;
    for (const [px, py, pw] of this.plats()) {
      if (a.x >= px - 6 && a.x <= px + pw + 6 && prevY <= py + 2 && a.y >= py) return py;
    }
    if (a.y >= GY && prevY <= GY + 30 && this.solid(a.x)) return GY;
    return null;
  }
  say(e) { this.events.push(e); }
  fx(k, x, y, o) { this.parts.push(Object.assign({ k, x, y, vx: 0, vy: 0, t: 0, T: 500, r: 10 }, o)); }
  boomW(x, y, big) { this.booms.push({ x, y, t: 0, big, world: 1 }); this.say({ e: 'sfx', n: 'sfx_explosion' }); if (big) this.shake = Math.max(this.shake, 16); }
  pop(x, y, n) { this.pops.push({ x, y, n, t: 0 }); }

  // ---- damage
  hurtHero(p, amt, hh) {
    const h = hh || this.h; p = h.pl || p;
    if (h.gone || h.inv > 0 || this.phase === 'drop' || this.phase === 'out' || this.dead) return;
    if (this.ride && h === this.h1) {
      const r = this.ride; r.hp -= 1; r.flash = 130; h.inv = 900; this.shake = Math.max(this.shake, 8);
      this.say({ e: 'sfx', n: 'sfx_shrapnel' });
      for (let i = 0; i < 6; i++) this.fx('debris', h.x, h.y - 70, { vx: rnd(-220, 220), vy: rnd(-380, -80), T: 600, r: rnd(3, 6) });
      if (r.hp <= 0) this.bail();
      return;
    }
    p.hp -= amt || 1; h.inv = 1300; this.flashT = 130; this.shake = Math.max(this.shake, 10); this.hurtT = 500;
    this.say({ e: 'sfx', n: 'sfx_meow' });
    for (let i = 0; i < 8; i++) this.fx('gib', h.x, h.y - 50, { vx: rnd(-200, 200), vy: rnd(-380, -80), T: 600, r: 5, col: PAL.blood });
    if (p.hp <= 0) {
      p.deaths = (p.deaths || 0) + 1; p.lives--; p.hp = CFG.hpMax;
      h.weap = 'rifle'; h.ammo = 0; h.gren = Math.max(h.gren, 10); h.inv = 2600;
      this.boomW(h.x, h.y - 40, 0);
      if (p.lives <= 0) {
        p.lives = 0; p.st = 'out'; h.gone = true;
        if (!this.heroes().length) { this.dead = true; this.done = true; }
        return;
      }
      this.respawn(h); h.inv = 2600;
    } else if (h.onG) { h.vy = -360; h.vx = -220 * h.face; }   // a hit in mid-air does not take the jump away: no more shot-into-the-pit
  }
  // back on your feet on solid ground, a step short of whatever got you
  respawn(hh) {
    const h = hh || this.h;
    let x = Math.max(this.cam + 140, h.safeX - 110);
    for (let i = 0; i < 40 && !(this.solid(x) && this.solid(x - 40) && this.solid(x + 40)); i++) x -= 30;
    if (!this.solid(x)) { x = Math.max(this.cam + 140, h.safeX); for (let i = 0; i < 40 && !this.solid(x); i++) x += 40; }
    // never back on your feet inside the thing that killed you: if that spot is
    // crowded, slide to the clearest solid ground on screen
    const ok = (q) => this.solid(q) && this.solid(q - 40) && this.solid(q + 40);
    const room = (q) => {
      let d = 1e9; for (const e of this.en) if (e.st === 'live' && !KIND[e.k].fly) d = Math.min(d, Math.abs(e.x - q));
      for (const f of this.eshots) if (f.k === 'patch') d = Math.min(d, Math.abs(f.x - q) + 60);
      const b = this.boss; if (b && b.live && b.hp > 0 && !b.fly) d = Math.min(d, Math.abs(b.x - q) - b.w / 2 - (b.k === 'eater' ? 420 : 90));
      return d;
    };
    if (room(x) < 220) {
      let best = x, bd = room(x);
      const hi = Math.min(this.cam + W - 90, (this.camLock > 0 ? this.camLock : this.m.len) - 60);
      for (let q = this.cam + 90; q <= hi; q += 40) if (ok(q)) { const d = Math.min(room(q), 420) - Math.abs(q - x) * 0.1; if (d > bd) { bd = d; best = q; } }
      x = best;
    }
    h.x = Math.max(x, this.cam + 60); h.y = GY; h.vy = 0; h.vx = 0; h.onG = true; h.inv = 1800;
  }
  dmg(e, amt, cause) {
    if (e.st !== 'live') return;
    e.hp -= amt; e.flash = 130;
    if (e.hp > 0) return;
    const K = KIND[e.k];
    this.kills++; this.score += K.pts; this.pop(e.x, e.y - K.h, K.pts);
    if (K.machine) { e.st = 'gone'; this.boomW(e.x, e.y - K.h * 0.4, 1); for (let i = 0; i < 10; i++) this.fx('debris', e.x, e.y - 40, { vx: rnd(-320, 320), vy: rnd(-520, -120), T: 900, r: rnd(4, 9) }); }
    else if (cause === 'fire') { e.st = 'burn'; e.t = 950; e.vx = (Math.random() < 0.5 ? -1 : 1) * 170; this.say({ e: 'sfx', n: 'sfx_screech' }); }
    else {
      e.st = 'gone'; this.say({ e: 'sfx', n: 'sfx_gore' }); this.say({ e: 'fpsKill' });
      const col = e.k === 'jelly' ? '#7fe8d8' : PAL.acid;
      for (let i = 0; i < (cause === 'blast' ? 22 : 13); i++) this.fx('gib', e.x, e.y - K.h * 0.5, { vx: rnd(-300, 300), vy: rnd(-520, -60), T: rnd(500, 900), r: rnd(4, 8), col });
      if (cause === 'blast') this.boomW(e.x, e.y - 30, 0);
    }
    if (!K.machine && Math.random() < 0.08) this.picks.push({ x: e.x, y: e.y - 30, vy: -300, k: Math.random() < 0.5 ? 'gren' : 'H', t: 12000 });
  }
  blast(x, y, r, amt, p) {
    this.boomW(x, y, r > 100 ? 1 : 0);
    for (const e of this.en) if (e.st === 'live' && Math.hypot(e.x - x, (e.y - KIND[e.k].h / 2) - y) < r + KIND[e.k].bw / 2) this.dmg(e, amt, 'blast');
    if (this.boss && this.boss.hp > 0 && this.bossHit(x, y, r)) this.dmgBoss(amt);
    for (const pw of this.pows) if (pw.st === 'tied' && Math.abs(pw.x - x) < r) this.freePow(pw);
    for (let i = 0; i < 8; i++) this.fx('fire', x + rnd(-r / 2, r / 2), y + rnd(-20, 10), { vy: rnd(-160, -40), T: rnd(350, 700), r: rnd(12, 26) });
  }
  freePow(pw) { pw.st = 'free'; pw.t = 0; this.score += 1000; this.pop(pw.x, GY - 110, 1000); this.say({ e: 'sfx', n: 'sfx_purr' }); this.picks.push({ x: pw.x + 40, y: GY - 60, vy: -380, k: pw.gift, t: 20000 }); }

  spawn(k, x, y, o) {
    const K = KIND[k];
    const e = Object.assign({ k, x, y, vx: 0, vy: 0, hp: K.hp, hpMax: K.hp, face: -1, t: 0, cd: rnd(600, 1500), tell: 0, flash: 0, st: 'live', ph: Math.random() * 6, id: Math.random() }, o);
    this.en.push(e); return e;
  }
  spawnWave(w) {
    const h = this.h;
    for (const [k, n, where] of w.s) for (let i = 0; i < n; i++) {
      let e;
      if (where === 'sky') e = this.spawn(k, this.cam + W + 110 + i * 190, rnd(130, 280));
      else if (where === 'left') e = this.spawn(k, this.cam - 70 - i * 80, GY);
      else if (where === 'ground') {
        let gx = h.x + 330 + i * 130 + rnd(-30, 30);   // far enough ahead that a running cat does not arrive as it surfaces
        for (let tries = 0; tries < 8 && !this.solid(gx); tries++) gx += 60;
        e = this.spawn(k, gx, GY, { rise: 700 });
      } else e = this.spawn(k, this.cam + W + 70 + i * 95, GY);
      w.alive.push(e);
    }
    if (w.lock) this.camLock = this.cam + W;
  }

  // ------------------------------------------------------------------ step
  step(bits, dt, p, bits2, p2) {
    if (this.done) return;
    this.stepCommon(dt, p);
    this.h1.pl = p;
    if (p && p.st === 'out') this.h1.gone = true;
    if (p2 && !this.h2) this.coopJoin(p2);
    if (this.h2 && p2) { this.h2.pl = p2; if (p2.st === 'out') this.h2.gone = true; }
    bits2 = bits2 | 0;
    if (!this.heroes().length) { this.dead = true; this.done = true; return; }
    const dts = dt / 1000, h = this.h, m = this.m, h2 = this.h2;
    this.dur = this.t; this.pt += dt;
    if (!this.started) { this.started = true; this.say({ e: 'music', n: m.music }); }
    const edge = (b) => (bits & b) && !(this.prevBits & b);

    // ---- intro: both cats come down under canopies, Metal Slug style
    if (this.phase === 'drop' && this.ride) {   // rode in off the road you chose
      const k = Math.min(1, this.pt / 2300), e = 1 - (1 - k) * (1 - k);
      const H1 = this.h1; H1.x = -200 + e * 420; H1.y = this.ride.k === 'copter' ? GY - 170 * (1 - e) : GY; H1.run += dt; H1.vx = k < 1 ? 200 : 0; this.c.x = -330 + e * 480; this.c.y = GY; this.c.run += dt; this.c.mov = k < 1;
      if (h2) { h2.x = this.c.x; h2.y = GY; h2.run += dt; h2.vx = k < 1 ? 200 : 0; h2.face = 1; }
      if (this.pt > 2900) { this.phase = 'play'; for (const q of [H1, h2]) if (q) { q.onG = true; q.vy = 0; q.vx = 0; q.safeX = q.x; } }
      this.stepFx(dt, dts); this.prevBits = bits; this.prevBits2 = bits2; return;
    }
    if (this.phase === 'drop') {
      this.h1.y = Math.min(GY, -200 + this.pt * 0.34); this.c.y = Math.min(GY, -320 + this.pt * 0.34);
      if (h2) { h2.x = this.c.x; h2.y = this.c.y; }
      if (this.pt > 2900) { this.phase = 'play'; this.h1.onG = true; this.h1.vy = 0; if (h2) { h2.onG = true; h2.vy = 0; h2.safeX = h2.x; } }
      this.stepFx(dt, dts); this.prevBits = bits; this.prevBits2 = bits2; return;
    }
    if (this.phase === 'out') {
      for (const q of this.heroes()) { q.x += RUN * 1.2 * dts; q.run += dt; q.face = 1; q.vx = 300; }
      this.c.x += RUN * 1.2 * dts; this.c.run += dt; this.c.mov = true;
      if (this.pt > 900) this.done = true;
      this.stepFx(dt, dts); this.prevBits = bits; this.prevBits2 = bits2; return;
    }

    // ---- the cats (P1 Whiskers, and Charlie if a second player is in)
    if (this.ride) { this.ride.flash -= dt; this.ride.ram -= dt; this.ride.shell -= dt; this.ride.snap = (this.ride.snap || 0) - dt; }
    if (this.wreck) {
      const w = this.wreck; w.t += dt;
      if (w.k === 'copter' && !w.down) {   // spirals down on its own smoke and goes up where it lands
        w.vy += 900 * dts; w.y += w.vy * dts; w.x += -w.face * 90 * dts; w.rot += dts * 7;
        if (Math.random() < 0.7) this.fx('smoke', w.x + rnd(-14, 14), w.y - 60, { vy: rnd(-60, -10), T: 700, r: rnd(8, 14), col: '#2e2b28' });
        if (w.y >= GY) { w.y = GY; w.down = 1; w.t = Math.max(w.t, 800); this.boomW(w.x, GY - 50, 1); for (let i = 0; i < 10; i++) this.fx('debris', w.x, GY - 40, { vx: rnd(-340, 340), vy: rnd(-520, -140), T: 900, r: rnd(4, 9), col: '#4d5138' }); }
        if (w.y > H + 200) this.wreck = null;
      }
      if (this.wreck && this.wreck.t > 6000) this.wreck = null;
    }
    const R = this.ride && !this.h1.gone ? RIDE[this.ride.k] : null;
    if (!this.h1.gone) this.stepHero(this.h1, bits, this.prevBits, dt, dts, p);
    if (h2 && !h2.gone) this.stepHero(h2, bits2, this.prevBits2, dt, dts, p2);

    // ---- Charlie: at your shoulder, shooting what you are shooting
    const c = this.c; if (!h2) { c.cd -= dt; c.fire -= dt;
    let cx = h.x - 74 * h.face;
    if (this.eater && !this.eater.stop) cx = Math.max(cx, this.eater.x + this.eaterW() + 40);   // never inside the jaws
    if (Math.abs(cx - c.x) > 500) { c.x = cx; c.y = h.y; }
    c.mov = Math.abs(cx - c.x) > 14;
    if (c.mov) { c.face = cx > c.x ? 1 : -1; c.x += c.face * Math.min((R ? Math.max(R.run, RUN) : RUN) * 1.05 * dts, Math.abs(cx - c.x)); c.run += dt; }
    const cg = this.solid(c.x) ? GY : h.y;
    c.vy += GRAV * dts; c.y += c.vy * dts; if (c.y >= cg) { c.y = cg; c.vy = 0; }
    if (!this.solid(c.x + c.face * 40) && c.y >= GY - 2) c.vy = JUMP * 0.9;
    let foe = null, fd = 620;
    for (const e of this.en) if (e.st === 'live' && !e.rise) { const d = Math.abs(e.x - c.x); if (d < fd && e.x > this.cam - 20 && e.x < this.cam + W + 20) { fd = d; foe = e; } }
    const bt = this.boss && this.boss.hp > 0 && this.boss.live ? this.bossAim() : null;
    if (c.cd <= 0 && (foe || bt)) {
      c.cd = 900; c.fire = 70;   // v14.4: solo Charlie takes ~13% of the kills (was ~28%); a second player is the real help
      const tx = foe ? foe.x : bt.x, ty = foe ? foe.y - KIND[foe.k].h * 0.5 : bt.y;
      if (Math.abs(tx - c.x) > 30) c.face = tx > c.x ? 1 : -1;
      const a = Math.atan2(ty - (c.y - 56), tx - c.x);
      this.shots.push({ k: 'B', x: c.x + Math.cos(a) * 40, y: c.y - 56 + Math.sin(a) * 40, vx: Math.cos(a) * 1100, vy: Math.sin(a) * 1100, t: 0, T: 900, dmg: 1, ai: 1 });
    }
    } else { c.x = h2.x; c.y = h2.y; }   // the AI Charlie stands down while a person has him

    // ---- camera: follows, never goes back, and stops at a fight
    let want = this.leadX() - W * 0.38;
    if (this.camLock > 0) want = Math.min(want, this.camLock - W);
    if (this.phase === 'play' || this.phase === 'boss' || this.phase === 'clear') want = Math.min(want, this.arenaX);
    this.cam = clamp(Math.max(this.cam, want), 0, this.endX - W + 200);

    // ---- the bridge eater: it is behind you and it does not stop
    if (this.eater && !this.eater.stop) {
      const E = this.eater, ew = this.eaterW();
      const lag = (h.x - (E.x + ew));
      E.x += (lag > 430 ? 300 : 112) * dts; E.rev += dt;   // it keeps pace: always in frame, always closing
      if (E.x + ew >= m.len - W + 300) { E.x = m.len - W + 300 - ew; E.stop = true; this.shake = 26; this.boomW(E.x + ew, GY - 40, 1); }
      const idx = Math.floor((E.x + ew - 30) / 64);
      while (E.eaten < idx) {
        // a plank snaps in two: both halves go up off the teeth and down into the river, splinters everywhere
        E.eaten++; const px = E.eaten * 64;
        for (let i = 0; i < 2; i++) this.fx('plank', px + 16 + i * 32, GY + 2, { vx: rnd(-240, 40), vy: rnd(-560, -260), T: 1500, r: 30, rot: rnd(-0.4, 0.4), spin: rnd(-9, 9), col: (E.eaten % 2) ? THEME.planks.a : THEME.planks.b });
        for (let i = 0; i < 6; i++) this.fx('debris', px + rnd(0, 60), GY + rnd(-10, 30), { vx: rnd(-300, 120), vy: rnd(-520, -80), T: 900, r: rnd(3, 9), col: i % 2 ? '#a57f52' : '#5e4228' });
        if (E.eaten % 3 === 0) { this.fx('debris', px, GY + 20, { vx: rnd(-80, 0), vy: rnd(-200, -60), T: 1200, r: 12, col: THEME.planks.c }); this.shake = Math.max(this.shake, 7); this.say({ e: 'sfx', n: 'sfx_shrapnel' }); }
      }
      E.flash = (E.flash || 0) - dt; E.hot = Math.max(0, (E.hot || 0) - dt / 2500); E.mf = (E.mf || 0) - dt; E.recoil = Math.max(0, (E.recoil || 0) - dt / 300);
      // the cannon: a glowing shell with a flame tail, aimed where you are going, bursting into shrapnel
      E.gun = (E.gun === undefined ? 2600 : E.gun) - dt * this.heat;
      if (E.gun <= 0 && this.phase === 'play') { E.gun = rnd(3800, 5000); this.eaterFire(E.x + ew - 190, h.x + clamp(h.vx, -1, 1) * 120 + rnd(-40, 40), 1.25); }
      this.cam = Math.max(this.cam, Math.min(E.x + ew - 400, m.len - W));
      for (const q of this.heroes()) if (q.x < E.x + ew + 26) { this.hurtHero(p, 1, q); q.x = E.x + ew + 90; q.vx = 520; q.vy = -420; }
      for (const e of this.en) if (e.st === 'live' && e.x < E.x + ew) { e.hp = 0; e.st = 'gone'; this.fx('gib', e.x, e.y - 40, { vy: -200, col: PAL.acid }); }
    }

    // ---- waves
    for (const w of this.waves) {
      if (!w.done && this.leadX() > w.x - 520) { w.done = true; this.spawnWave(w); }
      if (w.done && w.alive.length) {
        w.alive = w.alive.filter(e => e.st !== 'gone');
        // then: the second half of the fight comes in once the first is dead, on the same locked screen
        if (!w.alive.length && w.then && !w.then2 && this.phase === 'play' && !this.arenaT) { w.then2 = true; this.spawnWave({ s: w.then, alive: w.alive }); }
        // (play only: a straggler's wave emptying one frame into the boss used to drop the ARENA lock, and you could walk off screen past the boss)
        if (!w.alive.length && w.lock && this.camLock > 0 && this.phase === 'play') this.camLock = -1;
      }
    }
    if (this.phase === 'play' && this.cam >= this.arenaX - 4 && this.waves.every(w => w.done)) {
      // stragglers that never made it to the arena do not get to hold the door
      this.arenaT = (this.arenaT || 0) + dt;
      for (const e of this.en) if (e.st === 'live' && (e.x < this.cam - 40 || e.x > this.cam + W + 40 || this.arenaT > 9000)) e.st = 'gone';
      if (this.en.every(e => e.st !== 'live')) { this.phase = 'boss'; this.pt = 0; this.startBoss(); }
    }
    if (this.phase === 'play' && this.waves.every(w => w.done) && !this.waves.some(w => w.alive.length && w.lock)) {
      // nothing may hold the camera short of the arena
      if (this.camLock > 0 && this.en.every(e => e.st !== 'live')) this.camLock = -1;
    }

    this.stepEnemies(dt, dts, p);
    this.stepShots(dt, dts, p);
    if (this.boss) this.stepBoss(dt, dts, p);
    this.stepWorld(dt, dts, p);
    this.stepFx(dt, dts);

    if (this.phase === 'clear' && this.pt > 3600) { this.phase = 'fork'; this.pt = 0; this.camLock = -1; }
    if (this.phase === 'fork') {
      if (m.exits.length === 0) { if (this.pt > 600) { this.next = null; this.done = true; } }
      else if (this.heroes().some(q => q.x > this.endX - 40)) {
        const fh = this.heroes().find(q => q.x > this.endX - 40), up = m.exits.length > 1 && fh.y < GY - 120;
        this.route = m.exits.length > 1 ? (up ? 'up' : 'low') : (m.exits[0].via || 'low');
        const ex = m.exits.length > 1 ? (up ? m.exits[0] : m.exits[1]) : m.exits[0];
        // you leave on the ride the sign showed (a ride you still have from the last fork stays behind)
        if (ex.ride && !(this.ride && this.ride.k === ex.ride) && !this.h1.gone) { this.mount(ex.ride); const H1 = this.h1; H1.y = up ? GY - 196 : GY; H1.vy = 0; H1.onG = true; }
        this.next = ex.to;
        this.phase = 'out'; this.pt = 0;
      }
    }
    this.prevBits = bits; this.prevBits2 = bits2;
  }

  // one cat's controls, movement, gun and grenades (the ride is Whiskers' alone)
  stepHero(h, bits, prev, dt, dts, p) {
    const edge = (b) => (bits & b) && !(prev & b);
    h.inv -= dt; h.cd -= dt; h.fire -= dt; if (h.soot > 0) { h.soot -= dt; if (Math.random() < 0.25) this.fx('smoke', h.x + rnd(-10, 10), h.y - rnd(60, 100), { vy: rnd(-90, -40), T: 500, r: rnd(6, 12) }); }
    const ride = h === this.h1 ? this.ride : null, R = ride ? RIDE[ride.k] : null;
    h.crouch = !!(bits & C.DOWN) && h.onG && !R;
    h.up = !!(bits & C.UP);
    let mv = 0;
    if (bits & C.L) mv = -1; if (bits & C.R) mv = 1;
    if (mv) h.face = mv;
    const tgt = h.crouch ? 0 : mv * (R ? R.run : RUN);
    h.vx += (tgt - h.vx) * Math.min(1, dts * 18);
    if (mv && h.onG) h.run += dt;
    const prevY = h.y;
    if (R && R.fly) {
      // the copter: hold JUMP to climb, let go and it settles gently
      if (bits & C.JUMP) { h.vy -= 3000 * dts; h.onG = false; }
      h.vy = clamp(h.vy + GRAV * 0.42 * dts, -380, 460);
      h.x += h.vx * dts; h.y += h.vy * dts;
      if (h.y < 190) { h.y = 190; h.vy = Math.max(h.vy, 0); }
    } else {
      if (edge(C.JUMP) && h.onG) { h.vy = R ? R.jump : JUMP; h.onG = false; }
      h.vy += GRAV * dts; h.x += h.vx * dts; h.y += h.vy * dts;
    }
    const ly = this.land(h, prevY);
    if (ly !== null) { h.y = ly; h.vy = 0; h.onG = true; if (ly === GY || true) h.safeX = h.x; } else h.onG = false;
    const right = this.camLock > 0 ? this.camLock - 30 : this.phase === 'play' ? this.m.len - 30 : this.endX + 200;
    h.x = clamp(h.x, this.cam + 30, right);
    if (h.y > H + 120) { h.inv = 0; if (ride) this.ride = null; this.hurtHero(p, 1, h); if (!this.dead && !h.gone) this.respawn(h); }

    // ---- fire
    if (R && ride) {
      // the saddle gun never runs dry; the tank's bomb button is its cannon
      if ((bits & C.FIRE) && h.cd <= 0) {
        h.cd = R.cd; h.fire = 70;
        const up = h.up, ox = up ? h.x + h.face * R.seat[0] : h.x + h.face * R.gun[0], oy = up ? h.y - R.seat[1] - 110 : h.y - R.gun[1];
        const sp = rnd(-0.03, 0.03);
        // v14.6: the gunship's chin gun tips down with DOWN, so hovering never leaves a ground target unreachable
        if (R.fly && (bits & C.DOWN) && !up) this.shots.push({ k: 'H', x: h.x + h.face * 14, y: h.y - 20, vx: h.face * 90 + sp * 1400, vy: 1150, t: 0, T: 900, dmg: 1 });
        else this.shots.push({ k: 'H', x: ox, y: oy, vx: up ? sp * 1250 : h.face * 1250, vy: up ? -1250 : sp * 1250, t: 0, T: 900, dmg: 1 });
        this.say({ e: 'sfx', n: 'sfx_shot' });
      }
      if (ride.k === 'copter' && edge(C.GREN) && ride.shell <= 0) {
        // a pair of rockets off the stub wings
        ride.shell = 700;
        for (const dy of [-10, 12]) this.shots.push({ k: 'R', x: h.x + h.face * R.gun[0], y: h.y - R.gun[1] + dy, vx: h.face * 480, vy: dy * 4, t: 0, T: 2200, dmg: 7, ax: h.face * 1500, ay: 0 });
        this.say({ e: 'sfx', n: 'sfx_shotgun' }); this.shake = Math.max(this.shake, 4);
      }
      // the crab walker: whatever stands in front of the claws gets snapped
      if (ride.k === 'crab' && ride.ram <= 0) {
        for (const e of this.en) if (e.st === 'live' && !e.rise && !KIND[e.k].fly && Math.abs(e.x - (h.x + h.face * 92)) < 66 && Math.abs(e.y - h.y) < 100) {
          this.dmg(e, 5, 'ram'); e.x += h.face * 30; ride.ram = 380; ride.snap = 220; this.shake = Math.max(this.shake, 6); h.inv = Math.max(h.inv, 260);
          this.say({ e: 'sfx', n: 'sfx_gore' }); this.fx('spark', h.x + h.face * 100, h.y - 50, { T: 160, r: 14 });
        }
      }
      if (ride.k === 'tank' && edge(C.GREN) && ride.shell <= 0) {
        ride.shell = 650;
        this.shots.push({ k: 'R', x: h.x + h.face * R.gun[0], y: h.y - R.gun[1], vx: h.face * 520, vy: 0, t: 0, T: 2200, dmg: 9, ax: h.face * 1500, ay: 0 });
        this.say({ e: 'sfx', n: 'sfx_shotgun' }); this.shake = Math.max(this.shake, 6); h.vx -= h.face * 120;
      }
      // the buffalo goes through whatever is standing in front of it
      if (ride.k === 'buffalo' && Math.abs(h.vx) > 220 && ride.ram <= 0) {
        for (const e of this.en) if (e.st === 'live' && !e.rise && !KIND[e.k].fly && Math.abs(e.x - (h.x + h.face * 70)) < 60 && Math.abs(e.y - h.y) < 90) { this.dmg(e, 5, 'ram'); e.x += h.face * 40; ride.ram = 260; this.shake = Math.max(this.shake, 6); h.inv = Math.max(h.inv, 220); }
      }
    }
    if (!(R && ride) && (bits & C.FIRE) && h.cd <= 0) {
      const wp = WEAP[h.weap]; h.cd = wp.cd; h.fire = 70;
      const up = h.up, ox = h.x + (up ? h.face * 8 : h.face * 46), oy = h.y - (up ? 104 : h.crouch ? 34 : 56);
      const dx = up ? 0 : h.face, dy = up ? -1 : 0;
      if (h.weap === 'F') {
        for (let i = 0; i < 2; i++) this.shots.push({ k: 'F', x: ox, y: oy, vx: dx * rnd(480, 600) + rnd(-50, 50) + h.vx * 0.5, vy: dy * rnd(480, 600) + rnd(-50, 50), t: 0, T: 420, dmg: wp.dmg });
        if (this.t % 180 < dt) this.say({ e: 'sfx', n: 'sfx_flame' });
      } else if (h.weap === 'R') {
        this.shots.push({ k: 'R', x: ox, y: oy, vx: dx * 420, vy: dy * 420, t: 0, T: 2200, dmg: wp.dmg, ax: dx * 1500, ay: dy * 1500 });
        this.say({ e: 'sfx', n: 'sfx_shotgun' });
      } else {
        const sp = h.weap === 'H' ? rnd(-0.035, 0.035) : 0;
        this.shots.push({ k: h.weap === 'H' ? 'H' : 'B', x: ox, y: oy, vx: (dx + (up ? sp : 0)) * wp.spd, vy: (dy + (up ? 0 : sp)) * wp.spd, t: 0, T: 900, dmg: wp.dmg });
        this.say({ e: 'sfx', n: 'sfx_shot' });
        this.fx('shell', h.x, h.y - 56, { vx: -h.face * rnd(60, 160), vy: rnd(-340, -200), T: 700, r: 3 });
      }
      if (wp.ammo && --h.ammo <= 0) { h.weap = 'rifle'; }
    }
    if (edge(C.GREN) && h.gren > 0 && !(ride && (ride.k === 'tank' || ride.k === 'copter'))) {
      h.gren--; this.grens.push({ x: h.x + h.face * 20, y: h.y - 70, vx: h.face * 430 + h.vx * 0.6, vy: -560, t: 0 });
    }
  }

  stepEnemies(dt, dts, p) {
    for (const e of this.en) {
      if (e.st === 'gone') continue;
      const K = KIND[e.k];
      const vis = e.x > this.cam + 26 && e.x < this.cam + W - 26;   // nobody starts an attack from off screen
      if (e.flash > 0) e.flash -= dt;
      if (e.st === 'cheesed') {         // a molten cheese statue: it sets, cracks and falls apart
        e.t -= dt;
        if (Math.random() < 0.15) this.fx('gib', e.x + rnd(-14, 14), e.y - rnd(20, 70), { vx: rnd(-20, 20), vy: rnd(0, 40), T: 600, r: 3, col: PAL.cheese });
        if (e.t <= 0) { e.st = 'gone'; for (let i = 0; i < 12; i++) this.fx('debris', e.x, e.y - rnd(10, 70), { vx: rnd(-240, 240), vy: rnd(-420, -120), T: 800, r: rnd(5, 10), col: i % 2 ? PAL.cheese : PAL.cheeseDark }); this.say({ e: 'sfx', n: 'sfx_shrapnel' }); }
        continue;
      }
      if (e.fan && e.st === 'live') {   // its own rats, cheering it in: they hop and wave at the tank
        e.t += dt; e.face = -1; e.y = GY - Math.abs(Math.sin(e.t / 160 + e.ph)) * 26;
        if (Math.random() < dt / 900) this.say({ e: 'squeak', n: 1 });
        continue;
      }
      if (e.st === 'burn') {            // on fire: runs, flails, and is gone
        e.t -= dt; e.x += e.vx * dts; if (Math.random() < 0.04) e.vx = -e.vx;
        if (Math.random() < 0.6) this.fx('fire', e.x + rnd(-20, 20), e.y - rnd(10, K.h), { vy: rnd(-220, -80), T: rnd(280, 520), r: rnd(12, 24) });
        if (e.t <= 0) { e.st = 'gone'; for (let i = 0; i < 8; i++) this.fx('smoke', e.x + rnd(-16, 16), e.y - rnd(0, 60), { vy: rnd(-90, -30), T: 800, r: rnd(8, 16) }); }
        continue;
      }
      if (e.rise > 0) { e.rise -= dt; if (Math.random() < 0.3) this.fx('debris', e.x + rnd(-24, 24), GY, { vx: rnd(-80, 80), vy: rnd(-260, -80), T: 500, r: 4, col: THEME[this.m.theme].b }); continue; }
      e.t += dt; e.cd -= dt * this.heat;
      const px0 = e.x;
      const h = this.near(e.x), dx = h.x - e.x, ad = Math.abs(dx);
      if (!K.fly && !this.solid(e.x) && e.y >= GY) { e.vy += GRAV * dts; e.y += e.vy * dts; if (e.y > H + 100) e.st = 'gone'; continue; }
      if (e.x < this.cam - 500 || e.x > this.cam + W + 900) { if (e.t > 9000) e.st = 'gone'; }
      switch (e.k) {
        case 'rat': {
          e.face = dx > 0 ? 1 : -1;
          if (e.tell > 0) { e.tell -= dt; if (e.tell <= 0) { e.cd = rnd(1300, 2100); this.eshots.push({ k: 'ray', x: e.x + e.face * 36, y: e.y - 52, vx: e.face * 520, vy: clamp((h.y - 50 - (e.y - 52)) * 0.9, -160, 160), r: 9 }); this.say({ e: 'sfx', n: 'sfx_laser' }); } }
          else if (ad > 520 || !vis) e.x += e.face * 150 * dts;
          else if (e.cd <= 0) e.tell = 420;
          break;
        }
        case 'zombie': {
          e.face = dx > 0 ? 1 : -1;
          if (e.tell > 0) { e.tell -= dt; if (e.tell <= 0) { e.cd = rnd(2400, 3600); const T = 0.9; this.eshots.push({ k: 'vomit', x: e.x + e.face * 30, y: e.y - 70, vx: clamp(dx / T, -520, 520), vy: -620, g: 1500, r: 13 }); this.say({ e: 'sfx', n: 'sfx_gore' }); } }
          else { e.x += e.face * 62 * dts; if (vis && ad < 480 && ad > 120 && e.cd <= 0) e.tell = 520; }
          if (ad < 42 && e.t > 350 && Math.abs(h.y - e.y) < 70) this.hurtHero(p, 1, h);   // e.t: a beat of grace after it surfaces
          break;
        }
        case 'fatz': {
          e.face = dx > 0 ? 1 : -1;
          if (e.tell > 0) { e.tell -= dt; if (e.tell <= 0) { e.cd = rnd(2200, 3000); e.spew = 900; } }
          else if (e.spew > 0) { e.spew -= dt; if ((e.sp = (e.sp || 0) - dt) <= 0) { e.sp = 110; this.eshots.push({ k: 'vomit', x: e.x + e.face * 60, y: e.y - 96, vx: e.face * rnd(260, 520), vy: rnd(-380, -160), g: 1400, r: 12 }); } }
          else { if (ad > 260) e.x += e.face * 44 * dts; if (vis && ad < 620 && e.cd <= 0) { e.tell = 600; this.say({ e: 'sfx', n: 'sfx_screech' }); } }
          if (ad < 70 && Math.abs(h.y - e.y) < 110) this.hurtHero(p, 1, h);
          break;
        }
        case 'crab': {
          if (e.hop) { e.vy += GRAV * dts; e.x += e.vx * dts; e.y += e.vy * dts; if (e.y >= GY && this.solid(e.x)) { e.y = GY; e.hop = 0; e.cd = rnd(900, 1500); this.shake = Math.max(this.shake, 5); } }
          else {
            e.face = dx > 0 ? 1 : -1;
            if (e.tell > 0) { e.tell -= dt; if (e.tell <= 0) { e.hop = 1; e.vy = -760; e.vx = clamp(dx * 1.25, -620, 620); } }
            else if (ad > 380 || !vis) e.x += e.face * 210 * dts;
            else if (e.cd <= 0) e.tell = 380;
            else e.x += Math.sin(e.t / 260 + e.ph) * 120 * dts;
          }
          if (ad < 66 && e.t > 350 && Math.abs(h.y - e.y) < 80) this.hurtHero(p, 1, h);
          break;
        }
        case 'jelly': {
          const tx = h.x + Math.sin(e.t / 900 + e.ph) * 160, ty = 250 + Math.sin(e.t / 600 + e.ph) * 70;
          e.x += clamp(tx - e.x, -1, 1) * 130 * dts; e.y += clamp(ty - e.y, -1, 1) * 90 * dts;
          if (e.tell > 0) { e.tell -= dt; if (e.tell <= 0) { e.cd = rnd(2200, 3400); this.eshots.push({ k: 'zap', x: e.x, y: e.y + 20, vx: 0, vy: 430, r: 10 }); this.say({ e: 'sfx', n: 'sfx_laser' }); } }
          else if (Math.abs(dx) < 110 && e.cd <= 0 && vis) e.tell = 460;
          if (ad < 44 && Math.abs((h.y - 50) - e.y) < 60) this.hurtHero(p, 1, h);
          break;
        }
        case 'flamer': {
          e.face = dx > 0 ? 1 : -1;
          if (e.tell > 0) {
            e.tell -= dt;
            if (e.tell <= 0) {
              this.say({ e: 'sfx', n: 'sfx_flame' });
              // out of hose range it lobs a gob of fire that burns where it lands; in range, the hose
              if (e.lob) { e.lob = 0; e.cd = rnd(3000, 4000); this.lob(e.x + e.face * 40, e.y - 80, h.x, 0.95, 'napalm', 13); }
              else { e.spew = 1000; e.cd = rnd(2000, 2800); }
            }
          }
          else if (e.spew > 0) {
            e.spew -= dt;
            if ((e.sp = (e.sp || 0) - dt) <= 0) { e.sp = 60; this.eshots.push({ k: 'flame', x: e.x + e.face * 62, y: e.y - 58, vx: e.face * rnd(380, 470), vy: rnd(-40, 40), r: 14, life: 520 }); }
          }
          else if (ad > 300 || !vis) { e.x += e.face * 165 * dts; if (vis && ad > 380 && e.cd <= 0) { e.tell = 480; e.lob = 1; } }
          else if (e.cd <= 0) e.tell = 480;
          break;
        }
        case 'chopper': {
          // the alien hover-craft: drifts in on a lazy bob and lays a string of plasma
          e.face = -1; e.x -= 150 * dts * (e.x > h.x + 500 ? 1.6 : 1); e.y += Math.sin(e.t / 500 + e.ph) * 46 * dts;
          if (e.x < this.cam - 260) { e.x = this.cam + W + 200; e.y = rnd(120, 240); }
          if (e.cd <= 0 && vis && Math.abs(dx) < 240) { e.cd = 520; e.n = (e.n || 0) + 1; this.eshots.push({ k: 'bomb', x: e.x - 21, y: e.y + 44, vx: -60, vy: 60, g: 900, r: 11, plasma: 1 }); this.say({ e: 'sfx', n: 'sfx_laser' }); if (e.n % 4 === 0) e.cd = 2600; }
          break;
        }
        case 'ufo': {
          const tx = h.x + Math.sin(e.t / 1300 + e.ph) * 280;
          e.x += clamp(tx - e.x, -1, 1) * 170 * dts; e.y = 170 + Math.sin(e.t / 700 + e.ph) * 40;
          if (e.tell > 0) { e.tell -= dt; if (e.tell <= 0) { e.cd = rnd(1700, 2500); const a = Math.atan2(h.y - 50 - e.y, h.x - e.x); this.eshots.push({ k: 'ray', x: e.x, y: e.y + 20, vx: Math.cos(a) * 470, vy: Math.sin(a) * 470, r: 9 }); this.say({ e: 'sfx', n: 'sfx_laser' }); } }
          else if (e.cd <= 0 && vis) e.tell = 400;
          break;
        }
      }
      // how it is moving, for the walk cycle the renderer draws
      e.spd = (e.x - px0) / Math.max(dts, 1e-3); e.wph = (e.wph || 0) + Math.abs(e.x - px0) * 0.045;
    }
    this.en = this.en.filter(e => e.st !== 'gone');
  }

  stepShots(dt, dts, p) {
    const h = this.h;
    for (const s of this.shots) {
      s.t += dt;
      if (s.ax || s.ay) { s.vx += (s.ax || 0) * dts; s.vy += (s.ay || 0) * dts; if (Math.random() < 0.8) this.fx('smoke', s.x - s.vx * 0.02, s.y - s.vy * 0.02, { vy: rnd(-40, 10), T: rnd(380, 620), r: rnd(7, 13), col: '#d9c9cf' }); }
      s.x += s.vx * dts; s.y += s.vy * dts;
      if (s.k === 'F') { s.vy -= 260 * dts; s.vx *= 1 - dts * 1.6; }
      if (s.t > s.T || s.x < this.cam - 60 || s.x > this.cam + W + 60 || s.y < -80) { s.dead = 1; continue; }
      const hitR = s.k === 'F' ? 18 + s.t * 0.05 : 6;
      for (const e of this.en) {
        if (e.st !== 'live' || e.rise > 0) continue;
        const K = KIND[e.k];
        if (Math.abs(s.x - e.x) < K.bw / 2 + hitR && Math.abs(s.y - (e.y - K.bh / 2 - (K.fly ? -K.bh / 2 : 0))) < K.bh / 2 + hitR) {
          if (s.k === 'R') { this.blast(s.x, s.y, 95, s.dmg, p); s.dead = 1; }
          else if (s.k === 'F') { if (!s.hit || !s.hit.has(e.id)) { (s.hit = s.hit || new Set()).add(e.id); this.dmg(e, s.dmg, 'fire'); } }
          else { const was = e.st; this.dmg(e, s.dmg, 'shot'); if (s.ai && was === 'live' && e.st !== 'live') this.aiKills = (this.aiKills || 0) + 1; s.dead = 1; this.fx('spark', s.x, s.y, { T: 120, r: 8 }); }
          if (s.dead) break;
        }
      }
      if (!s.dead && this.eaterHit(s.x, s.y)) { if (s.k === 'R') this.blast(s.x, s.y, 95, s.dmg, p); if (s.k !== 'F' || Math.random() < 0.2) s.dead = 1; }
      if (!s.dead && this.boss && this.boss.hp > 0 && this.boss.live && this.bossHit(s.x, s.y, hitR)) {
        if (s.k === 'R') { this.blast(s.x, s.y, 95, s.dmg, p); s.dead = 1; }
        else if (s.k === 'F') { if (!s.bh) { s.bh = 1; this.dmgBoss(s.dmg * 1.4); } }
        else { this.dmgBoss(s.dmg); s.dead = 1; this.fx('spark', s.x, s.y, { T: 120, r: 9 }); }
      }
      if (!s.dead && s.k !== 'F') for (const pw of this.pows) if (pw.st === 'tied' && Math.abs(s.x - pw.x) < 34 && Math.abs(s.y - (GY - 50)) < 60) { this.freePow(pw); s.dead = 1; break; }
      if (!s.dead && s.k !== 'F') for (const cr of this.crates) if (!cr.open && Math.abs(s.x - cr.x) < 34 && Math.abs(s.y - (cr.y - 30)) < 36) { this.openCrate(cr); s.dead = 1; break; }
    }
    this.shots = this.shots.filter(s => !s.dead);
    for (const g of this.grens) {
      g.t += dt; g.vy += 1700 * dts; g.x += g.vx * dts; g.y += g.vy * dts;
      let hit = g.y >= GY - 6 && this.solid(g.x);
      for (const e of this.en) if (e.st === 'live' && Math.abs(g.x - e.x) < KIND[e.k].bw / 2 + 8 && Math.abs(g.y - (e.y - KIND[e.k].bh / 2)) < KIND[e.k].bh / 2 + 8) hit = true;
      if (this.boss && this.boss.hp > 0 && this.boss.live && this.bossHit(g.x, g.y, 8)) hit = true;
      if (!hit && this.eaterHit(g.x, g.y)) { hit = true; if (this.eater) this.eater.hot = Math.min(1, this.eater.hot + 0.2); }
      if (hit) { this.blast(g.x, Math.min(g.y, GY - 20), 120, 10, p); g.dead = 1; } else if (g.y > H + 60) g.dead = 1;
    }
    this.grens = this.grens.filter(g => !g.dead);
    // enemy fire: every cat on the field can be hit
    const cats = this.heroes();
    for (const s of this.eshots) {
      s.t = (s.t || 0) + dt;
      if (s.g) s.vy += s.g * dts;
      s.x += s.vx * dts; s.y += s.vy * dts;
      if (s.k === 'flame' && s.t > s.life) s.dead = 1;
      if (s.k === 'flame' && Math.random() < 0.5) this.fx('fire', s.x, s.y, { vy: rnd(-90, -20), T: 260, r: rnd(10, 18) });
      for (const h of cats) { const hh = h.crouch ? 44 : 84; if (Math.abs(s.x - h.x) < 20 + s.r && s.y > h.y - hh - s.r && s.y < h.y + s.r) { this.hurtHero(p, 1, h); if (s.k !== 'beam') { s.dead = 1; break; } } }
      if (s.k === 'mcheese') {
        for (const e of this.en) if (e.fan && e.st === 'live' && Math.abs(s.x - e.x) < 34 && s.y > e.y - 90) { e.st = 'cheesed'; e.t = 1700; e.y = GY; s.dead = 1; this.say({ e: 'squeak', n: 2 }); break; }
        if (s.dead) continue;
        if (Math.random() < 0.5) this.fx('fire', s.x, s.y, { vy: rnd(-60, -10), T: 200, r: rnd(6, 10) });
      }
      if (s.k === 'patch') { if (s.t > s.life) s.dead = 1; else { for (const h of cats) if (Math.abs(s.x - h.x) < 44 && h.y > GY - 40) this.hurtHero(p, 1, h); if (Math.random() < 0.3) this.fx('fire', s.x + rnd(-36, 36), GY - rnd(4, 20), { vy: rnd(-120, -40), T: 300, r: rnd(10, 18) }); } continue; }
      if (s.y >= GY && this.solid(s.x) && s.k !== 'wave') {
        s.dead = 1;
        if (s.k === 'napalm') this.eshots.push({ k: 'patch', x: s.x, y: GY, vx: 0, vy: 0, r: 0, life: 1300, t: 0 });
        if (s.k === 'mcheese') this.eshots.push({ k: 'patch', cheese: 1, x: s.x, y: GY, vx: 0, vy: 0, r: 0, life: 1700, t: 0 });
        if (s.hot) for (let i = 0; i < 12; i++) { const a = -Math.PI * (0.1 + 0.8 * i / 11); this.fx('shard', s.x, GY - 16, { vx: Math.cos(a) * rnd(300, 620), vy: Math.sin(a) * rnd(300, 620), T: rnd(380, 620), r: 5 }); }
        if (s.plasma) { this.plasmaPop(s.x, GY - 10); for (const h of cats) if (Math.abs(s.x - h.x) < 60 && h.y > GY - 70) this.hurtHero(p, 1, h); }
        else if (s.k === 'bomb' || s.k === 'shell') { this.boomW(s.x, GY - 20, s.k === 'shell' ? 1 : 0); for (const h of cats) if (Math.abs(s.x - h.x) < (s.k === 'shell' ? 80 : 60) && h.y > GY - 70) this.hurtHero(p, 1, h); }
        else if (s.k === 'vomit' || s.k === 'glob') for (let i = 0; i < 5; i++) this.fx('gib', s.x, GY - 4, { vx: rnd(-140, 140), vy: rnd(-260, -60), T: 420, r: 4, col: s.k === 'glob' ? PAL.cheese : PAL.acid });
      }
      if (s.k === 'wave') { for (const h of cats) if (Math.abs(s.x - h.x) < 34 && h.y > GY - 46) this.hurtHero(p, 1, h); if (Math.random() < 0.7) this.fx('debris', s.x, GY, { vx: rnd(-60, 60), vy: rnd(-300, -120), T: 380, r: 5, col: THEME[this.m.theme].a }); }
      if (s.x < this.cam - 200 || s.x > this.cam + W + 200 || s.y > H + 80 || s.y < -300) s.dead = 1;
    }
    this.eshots = this.eshots.filter(s => !s.dead);
  }

  openCrate(cr) { cr.open = 1; this.picks.push({ x: cr.x, y: cr.y - 40, vy: -420, k: cr.k, t: 20000 }); for (let i = 0; i < 7; i++) this.fx('debris', cr.x, cr.y - 30, { vx: rnd(-240, 240), vy: rnd(-460, -120), T: 700, r: rnd(4, 8), col: '#8a6a3c' }); this.say({ e: 'sfx', n: 'sfx_shrapnel' }); }

  stepWorld(dt, dts, p) {
    const cats = this.heroes();
    for (const h of cats) for (const cr of this.crates) if (!cr.open && Math.abs(h.x - cr.x) < 40 && Math.abs(h.y - cr.y) < 50) this.openCrate(cr);
    for (const pw of this.pows) {
      if (pw.st === 'tied' && cats.some(h => Math.abs(h.x - pw.x) < 44 && h.y > GY - 60)) this.freePow(pw);
      if (pw.st === 'free') { pw.t += dt; if (pw.t > 900) pw.x -= 330 * dts; if (pw.x < this.cam - 120) pw.st = 'gone'; }
    }
    for (const k of this.picks) {
      if (k.k !== 'med') k.t -= dt;
      k.vy += 1500 * dts; k.y += k.vy * dts;
      const gy = this.solid(k.x) ? Math.min(GY, this.surfaceAt(k.x)) : GY;
      if (k.y > gy - 22) { k.y = gy - 22; k.vy = 0; }
      const h = cats.find(q => Math.abs(k.x - q.x) < 46 && Math.abs(k.y - (q.y - 40)) < 70 && !(k.k === 'med' && (q.pl || p).hp >= CFG.hpMax));
      if (k.t > 0 && h) { const p = h.pl || this._p;
        k.t = 0; this.say({ e: 'sfx', n: 'sfx_pickup' });
        // a ring of pixel stars where it was, and the thing itself flies up to its picture on the HUD
        for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; this.fx('star', k.x, k.y, { vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, T: 520, r: 9, col: i % 2 ? PAL.cheese : '#fff6d0' }); }
        const p2 = h === this.h2, gun = !!WEAP[k.k];
        const to = gun ? (p2 ? [345, 110] : HUD_GUN) : k.k === 'gren' ? (p2 ? [450, 110] : HUD_BOMB) : HUD_LIFE;
        this.flyers.push({ k: k.k, x0: k.x - this.cam, y0: k.y, tx: to[0], ty: to[1], t: 0, T: 560, slot: gun ? 'gun' : k.k === 'gren' ? 'bomb' : null, p2 });
        if (WEAP[k.k]) { h.weap = k.k; h.ammo = (h.weap === k.k ? 0 : 0) + WEAP[k.k].ammo; }
        else if (k.k === 'gren') h.gren += 10;
        else if (k.k === 'med') { p.hp = CFG.hpMax; this.say({ e: 'sfx', n: 'sfx_purr' }); }
        else if (k.k === 'life') { p.lives++; this.say({ e: 'sfx', n: 'sfx_purr' }); }
        this.score += 100;
      }
    }
    this.picks = this.picks.filter(k => k.t > 0);
    // the ceiling leaks: a bead forms, hangs, and falls where it formed
    if (this.m.drips && this.phase === 'play') {
      this.dripT -= dt;
      if (this.dripT <= 0) { this.dripT = rnd(1300, 2400); this.drips.push({ x: this.cam + rnd(300, W - 80), t: 0 }); }
    }
    for (const d of this.drips) { d.t += dt; if (d.t > 900 && !d.fell) { d.fell = 1; this.eshots.push({ k: 'glob', x: d.x, y: 0, vx: 0, vy: 300, g: 1400, r: 12 }); } }
    this.drips = this.drips.filter(d => d.t < 1000);
    if (this.fly) { this.fly.t += dt; if (this.fly.t > 5200 && !this.fly.dropped) { this.fly.dropped = 1; } if (this.fly.t > 9000) this.fly = null; }
  }

  stepFx(dt, dts) {
    for (const q of this.parts) {
      q.t += dt; q.x += q.vx * dts; q.y += q.vy * dts;
      if (q.k === 'plank') { q.vy += 1500 * dts; q.rot += q.spin * dts; if (q.y > GY + 70 && !q.sp) { q.sp = 1; for (let i = 0; i < 4; i++) this.fx('debris', q.x, GY + 70, { vx: rnd(-90, 90), vy: rnd(-260, -120), T: 400, r: 4, col: '#cfe8ef' }); } }
      if (q.k === 'shard' || q.k === 'star') { q.vy += (q.k === 'shard' ? 900 : 0) * dts; q.vx *= 1 - dts * (q.k === 'star' ? 4 : 0.5); q.vy *= q.k === 'star' ? 1 - dts * 4 : 1; }
      if (q.k === 'gib' || q.k === 'debris' || q.k === 'shell') { q.vy += 1500 * dts; if (q.y > GY && this.solid(q.x) && q.vy > 0) { q.y = GY; q.vy *= -0.3; q.vx *= 0.5; } }
    }
    this.parts = this.parts.filter(q => q.t < q.T);
    if (this.parts.length > 420) this.parts.splice(0, this.parts.length - 420);
    for (const f of this.flyers) { f.t += dt; if (f.t >= f.T && !f.hit) { f.hit = 1; if (!f.p2 && f.slot === 'gun') this.hudGunK = 1; if (!f.p2 && f.slot === 'bomb') this.hudBombK = 1; } }
    this.flyers = this.flyers.filter(f => f.t < f.T + 60);
    for (const o of this.pops) o.t += dt;
    this.pops = this.pops.filter(o => o.t < 900);
  }

  // ------------------------------------------------------------------ bosses
  startBoss() {
    const k = this.m.boss, ax = this.arenaX;
    const B = { k, t: 0, cd: 1800, live: true, st: 'idle', n: 0, flash: 0 };
    // v14.5: boss hp cut ~25% when solo Charlie's share of the shooting was cut to ~13%
    if (k === 'zero')    Object.assign(B, { hp: 840, x: ax + 1010, y: GY, w: 240, h: 330 });
    if (k === 'eater')   { Object.assign(B, { hp: 270, x: this.eater.x + this.eaterW() - 190, y: GY, w: 380, h: 330, lunge: 0, intro: 0, cd: 99999 }); for (let i = 0; i < 3; i++) this.spawn('rat', B.x + 330 + i * 64, GY, { fan: 1, face: -1, hp: 3 }); }
    if (k === 'jellyq')  Object.assign(B, { hp: 300, x: ax + 800, y: 210, w: 300, h: 220, fly: 1 });
    if (k === 'barge')   Object.assign(B, { hp: 280, x: ax + 980, y: GY + 40, w: 520, h: 300 });
    if (k === 'gunship') Object.assign(B, { hp: 240, x: ax + 800, y: 190, w: 330, h: 230, fly: 1 });
    if (k === 'core')    Object.assign(B, { hp: 260, x: ax + 960, y: GY - 30, w: 380, h: 420 });
    B.hpMax = B.hp; this.boss = B; this.camLock = ax + W;
    this.say({ e: 'sfx', n: 'sfx_ufo' }); this.say({ e: 'shake', m: 10 });
  }
  // a plasma bomb lands: a green flash, a ring, crackling sparks. No fire.
  plasmaPop(x, y) {
    this.say({ e: 'sfx', n: 'sfx_laser' }); this.shake = Math.max(this.shake, 5);
    for (let i = 0; i < 12; i++) { const a = -Math.PI * i / 11; this.fx('star', x, y, { vx: Math.cos(a) * rnd(160, 320), vy: Math.sin(a) * rnd(160, 320), T: 420, r: 7, col: PAL.acid }); }
    for (let i = 0; i < 5; i++) this.fx('goo', x + rnd(-30, 30), y - rnd(0, 30), { vy: rnd(-80, -20), T: 500, r: rnd(8, 14) });
  }
  eaterMouth(x) { return x + 160 - ((this.eater && this.eater.recoil) || 0) * 10; }   // x = E.x + ew - 190; the chew line is E.x + ew - 30
  eaterMuzzle(x) {
    const mx = this.eaterMouth(x);
    if (!IMG.m_boss_hovertank) { const w = this.eaterW(); return { x: x + 190 - w * 0.15 - (this.eater.recoil || 0) * 10, y: GY - 270 }; }
    const dx = (HT.gun[0] - HT.mouth[0]) * HT.k, dy = (HT.gun[1] - HT.mouth[1]) * HT.k, c = Math.cos(HT.tilt), sn = Math.sin(HT.tilt);
    return { x: mx + dx * c - dy * sn, y: GY - 2 + dx * sn + dy * c };
  }
  // molten cheese out of the maw: a hot arcing glob that lands as a burning puddle
  cheeseGlob(x) {
    const mx = this.eaterMouth(x);
    this.eshots.push({ k: 'mcheese', x: mx + 40, y: GY - 24 + rnd(-10, 10), vx: rnd(380, 640), vy: rnd(-330, -90), g: 1100, r: 13, t: 0 });
  }
  eaterFire(x, tx, T) {
    const E = this.eater, mz = this.eaterMuzzle(x);
    this.lob(mz.x, mz.y, tx, T, 'shell', 15); this.eshots[this.eshots.length - 1].hot = 1;
    E.mf = 140; E.recoil = 1; this.shake = Math.max(this.shake, 8); this.say({ e: 'sfx', n: 'sfx_shotgun' });
    for (let i = 0; i < 5; i++) this.fx('smoke', mz.x + rnd(0, 40), mz.y + rnd(-10, 10), { vx: rnd(30, 120), vy: rnd(-60, -10), T: 700, r: rnd(8, 14), col: '#5a544a' });
  }
  // the eater cannot die before its fight, but every hit on it shows
  eaterHit(x, y) {
    const E = this.eater; if (!E || E.stop || (this.boss && this.boss.k === 'eater')) return false;
    const ew = this.eaterW(), fx0 = E.x + ew;
    if (IMG.m_boss_hovertank) { const mx = fx0 - 30; if (x > mx + 100 || x < mx - HT.mouth[0] * HT.k || y < GY - HT.mouth[1] * HT.k - 10 || y > GY + 60) return false; }
    else if (x > fx0 + 4 || x < fx0 - 380 || y < GY - 320 || y > GY + 20) return false;
    E.flash = 110; E.hot = Math.min(1, (E.hot || 0) + 0.06); this.fx('spark', x, y, { T: 140, r: 10 });
    if (Math.random() < 0.3) this.fx('debris', x, y, { vx: rnd(-200, 60), vy: rnd(-300, -80), T: 500, r: 3, col: '#6e6a50' });
    return true;
  }
  bossAim() { const b = this.boss; return { x: b.x, y: b.fly ? b.y : b.y - b.h * 0.5 }; }
  bossHit(x, y, r) { const b = this.boss, cy = b.fly ? b.y : b.y - b.h / 2; return Math.abs(x - b.x) < b.w / 2 + r && Math.abs(y - cy) < b.h / 2 + r; }
  dmgBoss(a) {
    const b = this.boss; if (b.hp <= 0) return;
    b.hp -= a; b.flash = 110;
    if (b.hp <= 0) {
      b.dieT = 0; this.score += 5000; this.pop(b.x, (b.fly ? b.y : b.y - b.h) - 20, 5000); this.eshots.length = 0;
      for (const e of this.en) if (e.st === 'live') this.dmg(e, 999, 'blast');
      this.say({ e: 'shake', m: 16 });
    }
  }
  lob(x, y, tx, T, k, r) { this.eshots.push({ k, x, y, tx, vx: (tx - x) / T, vy: (GY - y) / T - 0.5 * 1500 * T, g: 1500, r: r || 14 }); }
  stepBoss(dt, dts, p) {
    const b = this.boss, h = this.bossTarget(), ax = this.arenaX, cats = this.heroes();
    if (b.flash > 0) b.flash -= dt;
    if (b.hp <= 0) {                      // coming apart, loudly
      b.dieT += dt;
      if (b.dieT < 2600 && Math.random() < dt / 110) this.boomW(b.x + rnd(-b.w / 2, b.w / 2), (b.fly ? b.y : b.y - b.h / 2) + rnd(-b.h / 2, b.h / 2), Math.random() < 0.4);
      if (b.fly) b.y += 90 * dts;
      if (b.dieT > 2700 && b.live) { b.live = false; this.shake = 30; for (let i = 0; i < 5; i++) this.boomW(b.x + rnd(-120, 120), GY - rnd(20, 200), 1); this.phase = 'clear'; this.pt = 0; this.say({ e: 'sfx', n: 'sfx_purr' }); }
      return;
    }
    b.t += dt; b.cd -= dt * this.heat;
    const rage = b.hp < b.hpMax * 0.4 ? 0.7 : 1;
    const mode = () => { b.n++; return b.n % 3; };
    switch (b.k) {
      case 'zero': {
        // the big one lumbers after you, heaving, and lunges when you are close
        const lo = ax + 640, hi = ax + 1100;
        b.walk = b.walk || 0;
        if (b.grab > 0) {
          b.grab -= dt; const k = Math.max(0, 1 - Math.abs(b.grab - 350) / 350); b.x = b.gx - k * 220;
          if (b.grab <= 0) { b.x = b.gx; b.st = 'idle'; b.cd = 1700 * rage; }
        } else if (b.st === 'idle') {
          const want = h.x + 400;
          let mv = 0; if (b.x > want + 20 && b.x > lo) mv = -46; else if (b.x < want - 180 && b.x < hi) mv = 30;
          if (mv) {
            const s0 = Math.floor(b.walk / 620); b.x += mv * dts; b.walk += dt;
            if (Math.floor(b.walk / 620) !== s0) { this.shake = Math.max(this.shake, 7); for (let i = 0; i < 6; i++) this.fx('debris', b.x + rnd(-60, 40), GY, { vx: rnd(-160, 160), vy: rnd(-260, -80), T: 500, r: rnd(3, 6), col: THEME[this.m.theme].a }); }
          }
          if (b.cd <= 0) {
            const M = ['vomit', 'stomp', 'grab', 'raise']; b.n++; b.st = M[b.n % 4];
            if (b.st === 'grab' && Math.abs(h.x - b.x) > 560) b.st = 'vomit';
            if (b.st === 'raise' && this.en.filter(e => e.st === 'live' && e.k === 'zombie').length >= 3) b.st = 'vomit';   // the dead do not pile up without limit
            b.tell = b.st === 'grab' ? 760 : 650; this.say({ e: 'sfx', n: 'sfx_screech' });
          }
        } else {
          b.tell -= dt;
          if (b.tell <= 0) {
            if (b.st === 'vomit') for (let i = 0; i < 5; i++) this.lob(b.x - 136, GY - 200, h.x + (i - 2) * 130, 0.95 + i * 0.07, 'vomit', 15);
            if (b.st === 'stomp') { this.shake = 22; this.eshots.push({ k: 'wave', x: b.x - 120, y: GY, vx: -470, vy: 0, r: 16 }); this.say({ e: 'sfx', n: 'sfx_explosion' }); }
            if (b.st === 'raise') {
              // out of the mud around you, never under you, and slowly enough to see
              const slots = []; for (let q = ax + 110; q <= b.x - 270; q += 90) if (Math.abs(q - h.x) >= 210) slots.push(q);
              slots.sort((p1, p2) => Math.abs(p1 - h.x) - Math.abs(p2 - h.x));
              for (let i = 0; i < (rage < 1 ? 3 : 2) && i < slots.length; i++) this.spawn('zombie', slots[i], GY, { rise: 1000 });
            }
            if (b.st === 'grab') { b.grab = 700; b.gx = b.x; this.shake = Math.max(this.shake, 10); this.say({ e: 'sfx', n: 'sfx_gore' }); }
            else { b.st = 'idle'; b.cd = 1600 * rage; }
          }
        }
        // drool, always
        if (Math.random() < dt / 260) this.fx('gib', b.x - 136 + rnd(-8, 8), GY - 196, { vx: rnd(-20, 20), vy: rnd(-20, 40), T: 900, r: rnd(3, 5), col: PAL.acid });
        const reach = b.grab > 0 ? 140 : 110;
        for (const q of cats) if (Math.abs(q.x - b.x) < reach && q.x < b.x + 110) this.hurtHero(p, 1, q);
        break;
      }
      case 'eater': {
        const home = this.eater.x + this.eaterW() - 190;
        // the intro gag: its own rats come out to cheer it on, and its first blast of cheese takes them
        if (b.intro !== undefined) {
          b.intro += dt;
          if (b.intro > 1500 && b.st === 'idle' && !b.spew && !b.spewed) { b.st = 'cheese'; b.tell = 700; }
          if (b.intro > 1500 && b.st === 'idle' && b.spewed) { delete b.intro; b.cd = 1400; }
        }
        if (b.spew > 0) {
          b.spew -= dt; b.sp = (b.sp || 0) - dt;
          if (b.sp <= 0) { b.sp = 75; this.cheeseGlob(b.x); }
          if (Math.random() < 0.4) this.fx('fire', this.eaterMouth(b.x) + rnd(10, 60), GY - rnd(10, 40), { vx: rnd(60, 200), vy: rnd(-120, -30), T: 300, r: rnd(10, 16) });
          if (b.spew <= 0) { b.spew = 0; b.spewed = 1; b.st = 'idle'; b.cd = 1700 * rage; }
        }
        else if (b.lunge > 0) { b.lunge -= dt; const k = 1 - Math.abs(b.lunge - 450) / 450; b.x = home + k * 330; for (const q of cats) if (q.x < b.x + 200 && q.y > GY - 200) this.hurtHero(p, 1, q); if (b.lunge <= 0) { b.x = home; b.cd = 1500 * rage; } }
        else if (b.intro === undefined && b.st === 'idle' && b.cd <= 0) { b.st = ['shell', 'cheese', 'lunge'][mode()]; if (b.st === 'cheese' && rage < 1 && Math.random() < 0.3 && this.en.filter(e => e.st === 'live').length < 3) b.st = 'rats'; b.tell = b.st === 'cheese' ? 800 : 700; if (b.st === 'lunge') this.say({ e: 'sfx', n: 'sfx_bike' }); }
        else if (b.st !== 'idle') {
          b.tell -= dt;
          if (b.tell <= 0) {
            // three shells with standing room between them (the old spread left none)
            if (b.st === 'shell') for (let i = 0; i < 3; i++) this.eaterFire(b.x, h.x + (i - 1) * 230, 1.15 + i * 0.2);
            if (b.st === 'lunge') { b.lunge = 900; this.shake = 14; }
            if (b.st === 'rats') for (let i = 0; i < 2; i++) this.spawn(rage < 1 && i === 1 ? 'flamer' : 'rat', this.cam + W + 60 + i * 90, GY);
            if (b.st === 'cheese') { b.spew = 1300; b.sp = 0; this.say({ e: 'sfx', n: 'sfx_flame' }); this.shake = Math.max(this.shake, 6); break; }
            b.st = 'idle'; if (!b.lunge) b.cd = 1700 * rage;
          }
        }
        break;
      }
      case 'jellyq': {
        b.x = ax + 640 + Math.sin(b.t / 1500) * 380; b.y = 200 + Math.sin(b.t / 700) * 34;
        if (b.st === 'idle' && b.cd <= 0) { b.st = ['bolts', 'brood', 'bolts'][mode()]; if (b.st === 'brood' && this.en.filter(e => e.st === 'live').length >= 5) b.st = 'bolts'; b.tell = 850; b.cols = [h.x, h.x - 230 + rnd(-40, 40), h.x + 230 + rnd(-40, 40)]; if (rage < 1) b.cols.push(h.x + (h.x > ax + W / 2 ? -460 : 460)); }
        else if (b.st !== 'idle') {
          b.tell -= dt;
          if (b.tell <= 0) {
            if (b.st === 'bolts') { for (const cx of b.cols) this.eshots.push({ k: 'beam', x: cx, y: GY - 300, vx: 0, vy: 0, r: 26, life: 300, bh: 600 }); this.say({ e: 'sfx', n: 'sfx_laser' }); this.shake = 8; }
            if (b.st === 'brood') for (let i = 0; i < 3; i++) this.spawn('jelly', b.x + (i - 1) * 90, b.y + 60);
            b.st = 'idle'; b.cd = 1700 * rage;
          }
        }
        break;
      }
      case 'barge': {
        b.y = GY + 40 + Math.sin(b.t / 600) * 8;
        if (b.st === 'idle' && b.cd <= 0) { b.st = ['shell', 'crab', 'burst'][mode()]; if (b.st === 'crab' && this.en.filter(e => e.st === 'live' && e.k === 'crab').length >= 2) b.st = 'shell'; b.tell = 650; b.k2 = 0; }
        else if (b.st !== 'idle') {
          b.tell -= dt;
          if (b.tell <= 0) {
            if (b.st === 'burst') {
              // deck guns, one at a time: one over a ducked head, the next along the sand.
              // duck, then jump. (the old fan left a 5px gap that depended on where you stood)
              this.eshots.push({ k: 'ray', x: b.x - b.w / 2 + 10, y: b.k2 % 2 ? GY - 14 : GY - 74, vx: -520, vy: 0, r: 9 }); this.say({ e: 'sfx', n: 'sfx_laser' });
              b.k2++; b.tell = b.k2 % 2 ? 380 : 850;   // high then low come as a pair; the long beat after the low one is your landing
              if (b.k2 < (rage < 1 ? 4 : 2)) break;
            }
            if (b.st === 'shell') for (let i = 0; i < 3; i++) this.lob(b.x - 60, b.y - 260, h.x + (i - 1) * 230, 1.15 + i * 0.2, 'shell', 15);
            if (b.st === 'crab') this.spawn('crab', b.x - 300, GY - 300, { hop: 1, vy: -200, vx: -260 });
            b.st = 'idle'; b.cd = 1700 * rage;
          }
        }
        break;
      }
      case 'gunship': {
        if (b.st === 'idle') {
          b.x += clamp(h.x - b.x, -1, 1) * 250 * dts; b.y = 190 + Math.sin(b.t / 500) * 18;
          if (b.cd <= 0) { b.st = ['string', 'rockets', 'drop'][mode()]; if (b.st === 'drop' && this.en.filter(e => e.st === 'live').length >= 2) b.st = 'rockets'; b.tell = 520; b.k2 = 0; }
        } else {
          b.tell -= dt;
          if (rage < 1 && b.st === 'string' && b.k2 > 0) b.x += clamp(h.x - b.x, -1, 1) * 140 * dts;   // angry: it walks the string after you
          if (b.tell <= 0) {
            if (b.st === 'string') { this.eshots.push({ k: 'bomb', x: b.x, y: b.y + 110, vx: 0, vy: 260, g: 500, r: 12 }); b.k2++; b.tell = 130; if (b.k2 >= (rage < 1 ? 7 : 5)) { b.st = 'idle'; b.cd = 1500 * rage; } }
            // the citadel's own: a flamethrower rat comes in from the far wall while you watch the sky
            else if (b.st === 'drop') { this.spawn('flamer', h.x < ax + W / 2 ? this.cam + W + 60 : this.cam - 60, GY); b.st = 'idle'; b.cd = 1300 * rage; }
            else { for (const s of [-1, 1]) for (let i = 0; i < 2; i++) this.eshots.push({ k: 'bomb', x: b.x + s * 130, y: b.y + 40, vx: s * (120 + i * 150), vy: 120, g: 700, r: 11 }); b.st = 'idle'; b.cd = 1600 * rage; }
          }
        }
        break;
      }
      case 'core': {
        b.y = GY - 30 + Math.sin(b.t / 800) * 10;
        if (b.st === 'idle' && b.cd <= 0) { const M = rage < 1 ? ['eyes', 'rain', 'brood', 'stomp'] : ['eyes', 'rain', 'brood']; b.n++; b.st = M[b.n % M.length]; if (b.st === 'brood' && this.en.filter(e => e.st === 'live').length >= 4) b.st = 'eyes'; b.tell = 700; b.k2 = 0; }
        else if (b.st !== 'idle') {
          b.tell -= dt;
          if (b.tell <= 0) {
            if (b.st === 'eyes') {
              // one eye at a time, each at where you are now: keep moving and none of them land.
              // (the old three-ray fan covered 300px of floor and left a 44px gap)
              const ox = b.x - 100, oy = b.y - 250, a = Math.atan2(h.y - 50 - oy, h.x - ox);
              this.eshots.push({ k: 'ray', x: ox, y: oy, vx: Math.cos(a) * 540, vy: Math.sin(a) * 540, r: 11 }); this.say({ e: 'sfx', n: 'sfx_laser' });
              b.k2++; b.tell = 260;
              if (b.k2 < (rage < 1 ? 4 : 3)) break;
            }
            if (b.st === 'rain') for (let i = 0; i < 5; i++) this.lob(b.x - 40, b.y - 400, ax + 120 + i * 150 + rnd(-40, 40), 1.0 + i * 0.1, 'glob', 15);
            if (b.st === 'brood') { this.spawn(rage < 1 ? 'flamer' : 'rat', ax - 60, GY); this.spawn('jelly', b.x - 200, b.y - 380); }
            // the floor wave used to ride along on other attacks with no warning of its own; now it is its own move
            if (b.st === 'stomp') { this.eshots.push({ k: 'wave', x: b.x - 200, y: GY, vx: -520, vy: 0, r: 16 }); this.shake = 18; this.say({ e: 'sfx', n: 'sfx_explosion' }); }
            b.st = 'idle'; b.cd = 1800 * rage;
          }
        }
        for (const q of cats) if (q.x > b.x - 190) this.hurtHero(p, 1, q);
        break;
      }
    }
    // a standing beam hurts for as long as it stands
    for (const s of this.eshots) if (s.k === 'beam') { if (s.t > s.life) s.dead = 1; else for (const q of cats) if (Math.abs(s.x - q.x) < 34) this.hurtHero(p, 1, q); }
  }

  // ------------------------------------------------------------------ render
  render(ctx, now) {
    const m = this.m, cam = this.cam, th = THEME[m.theme], h = this.h;
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0, sy = this.shake ? (Math.random() - 0.5) * this.shake * 0.5 : 0;
    ctx.save(); ctx.translate(Math.round(sx), Math.round(sy));
    // backdrop, mirror-tiled so the wrap never shows a seam
    const bg = IMG[m.bg];
    if (bg && m.bgOnce) this.drawOnceBack(ctx, bg, now);
    else if (bg) {
      const par = cam * 0.35, idx = Math.floor(par / W), off = -(par % W);
      for (let i = 0; i <= 1; i++) {
        const x = off + i * W;
        if ((idx + i) % 2 === 1) { ctx.save(); ctx.translate(x + W, 0); ctx.scale(-1, 1); ctx.drawImage(bg, 0, 0, W + 1, H); ctx.restore(); }
        else ctx.drawImage(bg, x, 0, W + 1, H);
      }
    } else { ctx.fillStyle = '#1b2430'; ctx.fillRect(0, 0, W, H); }
    if (this.fly) this.drawFlyover(ctx, now);
    if (m.weather === 'rain') this.drawRain(ctx, now, 0.35);

    ctx.save(); ctx.translate(-Math.round(cam), 0);
    this.drawGround(ctx, th, now);
    for (const [px, py, pw] of this.plats()) this.drawPlat(ctx, px, py, pw, th);
    if (this.phase === 'fork' || this.phase === 'out') this.drawExits(ctx, now);
    // crates, prisoners, pickups
    for (const cr of this.crates) if (!cr.open) this.drawCrate(ctx, cr.x, cr.y);
    for (const pw of this.pows) {
      if (pw.st === 'gone') continue;
      const im = IMG.m_pow, ph = 84, pwid = im ? ph * (im.width / im.height) : 70;
      if (im) { ctx.save(); ctx.translate(pw.x, GY); if (pw.st === 'free' && pw.t > 900) ctx.scale(-1, 1); if (pw.st === 'free' && pw.t <= 900) ctx.translate(0, -Math.abs(Math.sin(pw.t / 110)) * 18); ctx.drawImage(im, -pwid / 2, -ph, pwid, ph); ctx.restore(); }
    }
    for (const k of this.picks) { if (k.t < 2500 && Math.floor(now / 90) % 2) continue; this.drawPick(ctx, k.k, k.x, k.y + Math.sin(now / 200 + k.x) * 3, 46); }
    for (const d of this.drips) { ctx.fillStyle = PAL.cheese; ctx.beginPath(); ctx.ellipse(d.x, 4 + d.t * 0.012, 7, 7 + d.t * 0.014, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,201,60,0.25)'; ctx.fillRect(d.x - 20, GY - 4, 40, 4); }
    // the bridge eater chews through the frame from the left
    if (this.eater && !(this.boss && this.boss.k === 'eater')) this.drawEater(ctx, this.eater.x + this.eaterW() - 190, now, Math.max(0, this.eater.flash || 0) / 110, 1);
    if (this.boss && this.boss.live) this.drawBoss(ctx, now);
    for (const e of this.en) this.drawEnemy(ctx, e, now);
    // the cats
    const H1 = this.h1, h2 = this.h2;
    if (this.phase === 'drop') { if (!h2 || !h2.gone) this.drawChute(ctx, this.c.x, this.c.y, now); if (!H1.gone) this.drawChute(ctx, H1.x, H1.y, now + 300); }
    if (!h2) this.drawCat(ctx, 'vc', this.c.x, this.c.y, this.c.face, this.c.run, false, false, this.c.fire, now, 1, this.c.y < GY - 4 && this.phase !== 'drop', this.c.mov);
    else if (!h2.gone && !(h2.inv > 0 && Math.floor(now / 70) % 2 && this.phase !== 'drop')) {
      this.drawCat(ctx, 'vc', h2.x, h2.y, h2.face, h2.run, h2.up, h2.crouch, h2.fire, now, 1, !h2.onG && this.phase !== 'drop', Math.abs(h2.vx) > 40);
    }
    if (this.wreck && this.wreck.k === 'buffalo') { const w = this.wreck; this.drawRide(ctx, 'buffalo', w.x + w.face * w.t * 0.62, w.y - Math.abs(Math.sin(w.t / 80)) * 14, w.face, 0, 1, now, false); }
    else if (this.wreck) { const w = this.wreck, k = w.t / 6000; ctx.save(); ctx.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1; this.drawRide(ctx, w.k, w.x, w.y, w.face, 0, 1, now, true, { rot: w.rot, t: w.t }); ctx.restore(); if (k < 0.8 && (w.k !== 'copter' || w.down)) for (let i = 0; i < 3; i++) { const ph = ((now / 320) + i * 0.33) % 1; pxFlame(ctx, w.x + (i - 1) * 34, w.y - 60 - ph * 70, 22 * (1 - ph * 0.5), ph, now + i * 77); } }
    if (!H1.gone) {
    const h = H1;
    const blink = h.inv > 0 && Math.floor(now / 70) % 2 && this.phase !== 'drop';
    if (this.ride) {
      const R = RIDE[this.ride.k], bob = R.fly ? (h.onG ? 0 : Math.sin(now / 210) * 4) : h.onG && Math.abs(h.vx) > 40 ? Math.abs(Math.sin(h.run / 90)) * 5 : 0;
      const mo = { tilt: R.fly && !h.onG ? Math.min(1, Math.abs(h.vx) / R.run) * 0.12 + Math.sin(now / 300) * 0.02 : 0, walk: R.claw && Math.abs(h.vx) > 40 ? h.run / 70 : 0, snap: this.ride.snap };
      this.drawCat(ctx, 'us', h.x + h.face * R.seat[0], h.y - R.seat[1] - bob, h.face, 0, h.up, false, 0, now, 1, false, false);
      if (!blink) this.drawRide(ctx, this.ride.k, h.x, h.y - bob, h.face, Math.max(0, this.ride.flash) / 130, this.ride.hp / R.hp, now, false, mo);
      if (h.fire > 0) { if (h.up) drawMuzzleBurst(ctx, h.x + h.face * R.seat[0], h.y - R.seat[1] - 116, -Math.PI / 2, h.fire / 70); else drawMuzzleBurst(ctx, h.x + h.face * (R.gun[0] + 12), h.y - R.gun[1] - bob, h.face > 0 ? 0 : Math.PI, h.fire / 70); }
    } else if (!blink) {
      const soot = h.soot > 0 && 'filter' in ctx;
      if (soot) ctx.filter = 'brightness(0.4) saturate(0.5)';
      this.drawCat(ctx, 'us', h.x, h.y, h.face, h.run, h.up, h.crouch, h.fire, now, 1, !h.onG, Math.abs(h.vx) > 40);
      if (soot) ctx.filter = 'none';
    }
    }
    // fire going out and coming in
    for (const s of this.shots) {
      if (s.k === 'F') { const k = s.t / s.T; pxFlame(ctx, s.x, s.y, 14 + k * 30, k, now + s.x); }
      else if (s.k === 'R') { const a = Math.atan2(s.vy, s.vx); ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(a); ctx.fillStyle = '#6e7350'; ctx.fillRect(-14, -5, 26, 10); ctx.fillStyle = '#c9c39a'; ctx.fillRect(8, -4, 8, 8); ctx.fillStyle = '#ffd98a'; ctx.fillRect(-24, -4, 10, 8); ctx.fillStyle = '#fff'; ctx.fillRect(-20, -2, 6, 4); ctx.restore(); }
      else { const a = Math.atan2(s.vy, s.vx); ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(a); ctx.fillStyle = s.k === 'H' ? '#ffb347' : '#ffe08a'; ctx.fillRect(-16, -3, 26, s.k === 'H' ? 7 : 5); ctx.fillStyle = '#fff'; ctx.fillRect(2, -2, 8, 3); ctx.restore(); }
    }
    for (const g of this.grens) { ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.t / 80); ctx.fillStyle = '#3d4a2a'; ctx.fillRect(-7, -9, 14, 18); ctx.fillStyle = '#1e2414'; ctx.fillRect(-4, -13, 8, 5); ctx.restore(); }
    for (const s of this.eshots) this.drawEShot(ctx, s, now);
    if (this.boss && this.boss.live && this.boss.st !== 'idle' && this.boss.hp > 0) this.drawTells(ctx, now);
    // particles
    for (const q of this.parts) {
      const k = q.t / q.T;
      if (q.k === 'fire') pxFlame(ctx, q.x, q.y, q.r * (1 + k * 0.8), k, now + q.x * 7);
      else if (q.k === 'smoke') { ctx.globalAlpha = 0.55 * (1 - k); ctx.fillStyle = q.col || '#4a443c'; const r = q.r * (1 + k); pxBlob(ctx, q.x, q.y, r); ctx.globalAlpha = 1; }
      else if (q.k === 'spark') { ctx.fillStyle = k < 0.5 ? '#fff' : '#ffd23c'; ctx.fillRect(q.x - q.r * (1 - k), q.y - 2, q.r * 2 * (1 - k), 4); ctx.fillRect(q.x - 2, q.y - q.r * (1 - k), 4, q.r * 2 * (1 - k)); }
      else if (q.k === 'shell') { ctx.fillStyle = '#e0b84a'; ctx.fillRect(q.x - 2, q.y - 3, 4, 7); }
      else if (q.k === 'plank') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = THEME.planks.c; ctx.fillRect(-q.r - 2, -9, q.r * 2 + 4, 18); ctx.fillStyle = q.col; ctx.fillRect(-q.r, -7, q.r * 2, 14); ctx.fillStyle = THEME.planks.d; ctx.fillRect(-q.r, -7, q.r * 2, 3); ctx.fillStyle = THEME.planks.c; ctx.fillRect(q.r - 4, -7, 4, 6); ctx.fillRect(-q.r, 2, 6, 5); ctx.restore(); }
      else if (q.k === 'shard') { const c = k < 0.3 ? '#fff6d0' : k < 0.6 ? '#ffd23c' : '#ff8a1e'; ctx.fillStyle = c; ctx.fillRect(Math.round(q.x - 3), Math.round(q.y - 3), 6, 6); ctx.globalAlpha = 0.6; ctx.fillRect(Math.round(q.x - q.vx * 0.02 - 2), Math.round(q.y - q.vy * 0.02 - 2), 4, 4); ctx.globalAlpha = 1; }
      else if (q.k === 'star') { const r = Math.max(2, q.r * (1 - k * 0.6)); ctx.fillStyle = k < 0.4 ? '#fff' : (q.col || '#ffd23c'); ctx.fillRect(Math.round(q.x - r), Math.round(q.y - 2), Math.round(r * 2), 4); ctx.fillRect(Math.round(q.x - 2), Math.round(q.y - r), 4, Math.round(r * 2)); }
      else if (q.k === 'goo') { ctx.globalAlpha = 0.8 * (1 - k); ctx.fillStyle = k < 0.3 ? '#eaffd0' : PAL.acid; pxBlob(ctx, q.x, q.y, q.r * (1 + k)); ctx.globalAlpha = 1; }
      else { ctx.fillStyle = q.col || '#6b5233'; const r = Math.max(2, Math.round(q.r * (1 - k * 0.4))); ctx.fillRect(Math.round(q.x - r / 2), Math.round(q.y - r / 2), r, r); }
    }
    for (const b of this.booms) if (b.world) { /* drawn below in world space */ }
    this.drawBooms(ctx);
    for (const o of this.pops) { const k = o.t / 900; ctx.globalAlpha = 1 - k * k; msText(ctx, String(o.n), o.x, o.y - k * 46, 22, 'center'); ctx.globalAlpha = 1; }
    ctx.restore();

    if (m.dark) { const g = ctx.createRadialGradient(h.x - cam, h.y - 60, 120, h.x - cam, h.y - 60, 760); g.addColorStop(0, 'rgba(0,10,8,0)'); g.addColorStop(1, 'rgba(0,10,8,0.62)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    if (m.weather === 'rain') this.drawRain(ctx, now, 0.6);
    if (m.weather === 'ash' || m.weather === 'motes') this.drawMotes(ctx, now, m.weather === 'ash' ? '#ffb070' : '#9dffd0');
    if (this.hurtT > 0) { ctx.fillStyle = `rgba(160,20,10,${Math.min(0.35, this.hurtT / 1400)})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    this.drawHud(ctx, now);
    // pickups on their way to the HUD: an arc up, shrinking, with a spark tail
    for (const f of this.flyers) {
      const k = Math.min(1, f.t / f.T), e = k * k * (3 - 2 * k), x = f.x0 + (f.tx - f.x0) * e, y = f.y0 + (f.ty - f.y0) * e - Math.sin(k * Math.PI) * 120;
      ctx.fillStyle = PAL.cheese; for (let i = 1; i < 4; i++) { const kk = Math.max(0, k - i * 0.05), ee = kk * kk * (3 - 2 * kk); ctx.fillRect(f.x0 + (f.tx - f.x0) * ee - 3, f.y0 + (f.ty - f.y0) * ee - Math.sin(kk * Math.PI) * 120 - 3, 6, 6); }
      this.drawPick(ctx, f.k, x, y, 46 * (1 - k * 0.45));
    }
    // the cards
    if (this.phase === 'drop' && this.pt > 300) {
      const k = Math.min(1, (this.pt - 300) / 260);
      ctx.save(); ctx.globalAlpha = this.pt > 2500 ? Math.max(0, 1 - (this.pt - 2500) / 400) : 1;
      msText(ctx, 'MISSION ' + m.n, W / 2, 250 - (1 - k) * 60, 104, 'center');
      if (this.pt > 900) msText(ctx, 'START!', W / 2, 372, 104, 'center');
      ctx.restore();
    }
    if (this.phase === 'clear' && this.pt > 500) { msText(ctx, 'MISSION', W / 2, 250, 104, 'center'); if (this.pt > 1100) msText(ctx, 'COMPLETE!', W / 2, 372, 104, 'center'); }
    if (this.phase === 'out') { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.pt / 800)})`; ctx.fillRect(0, 0, W, H); }
  }

  // One crashed bomber, once. The art scrolls away on its own parallax and the
  // rest of the level is built from layers: its own night sky, far mountains,
  // jungle hills, other wrecks (a fighter, a tank under a watchtower) and a near
  // treeline. Nothing repeats side by side and nothing is mirrored into a twin.
  drawOnceBack(ctx, bg, now) {
    const cam = this.cam, bw = bg.width, bh = bg.height;
    // sky: the clouds and stars strip of the art, stretched and slid slowly
    const sp = cam * 0.06, sw = W * 1.5, so = -(sp % sw);
    for (let i = 0; i < 3; i++) { const x = so + i * sw; if ((Math.floor(sp / sw) + i) % 2) { ctx.save(); ctx.translate(x + sw, 0); ctx.scale(-1, 1); ctx.drawImage(bg, 0, 0, bw, bh * 0.3, 0, 0, sw + 1, H * 0.62); ctx.restore(); } else ctx.drawImage(bg, 0, 0, bw, bh * 0.3, x, 0, sw + 1, H * 0.62); }
    const ridge = (par, base, amp, step, col, seed) => {
      const off = cam * par; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, GY);
      const hv = (i) => ((((i + seed) * 2654435761) >>> 0) % 1000) / 1000;
      for (let x = 0; x <= W + 16; x += 16) { const u = (x + off) / step, wx = Math.floor(u), f = u - wx, hh = hv(wx) + (hv(wx + 1) - hv(wx)) * (1 - Math.cos(f * Math.PI)) / 2; ctx.lineTo(x, Math.round((base - hh * amp) / 4) * 4); }
      ctx.lineTo(W + 16, GY); ctx.closePath(); ctx.fill();
    };
    ridge(0.12, 430, 150, 260, '#262c48', 7);
    ridge(0.22, 500, 90, 170, '#1c2a2a', 31);
    // the bomber: once, its right edge feathered into the layers behind it
    const bx = -cam * 0.35;
    if (bx > -W) {
      if (!this._bgFade && typeof document !== 'undefined') {
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        g.drawImage(bg, 0, 0, W, H); g.globalCompositeOperation = 'destination-out';
        const gr = g.createLinearGradient(W - 260, 0, W, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(W - 260, 0, 260, H);
        const gt = g.createLinearGradient(0, 0, 0, 200); gt.addColorStop(0, 'rgba(0,0,0,1)'); gt.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gt; g.fillRect(0, 0, W, 200);
        this._bgFade = c;
      }
      ctx.drawImage(this._bgFade || bg, bx, 0, W, H);
    }
    // the other wrecks, each its own, on the jungle floor
    const PROPS = [[1300, 'm_wreck_jet', 250, 1], [2350, 'm_wreck_tank', 260, -1], [3500, 'm_wreck_jet', 210, -1], [4550, 'm_wreck_tank', 230, 1], [5600, 'm_wreck_jet', 270, 1]];
    for (const [wx, id, hh, fl] of PROPS) {
      const im = IMG[id]; if (!im) continue; const w = hh * (im.width / im.height), x = wx - cam * 0.42;
      if (x < -w || x > W + w) continue;
      ctx.save(); ctx.translate(x, GY - 34); if (fl < 0) ctx.scale(-1, 1); if ('filter' in ctx) ctx.filter = 'brightness(0.62) saturate(0.8)'; ctx.drawImage(im, -w / 2, -hh, w, hh); ctx.restore();
    }
    // near treeline in silhouette, swaying in the storm
    const off = cam * 0.55; ctx.fillStyle = '#0f1a14';
    for (let i = Math.floor(off / 230) - 1; i < Math.floor(off / 230) + W / 230 + 2; i++) {
      const hs = ((i * 2654435761) >>> 0) % 9, x = i * 230 - off + hs * 11, top = GY - 150 - hs * 14, sw = Math.sin(now / 700 + i) * 5;
      ctx.fillRect(x - 5, top, 10, GY - top);
      for (let j = 0; j < 5; j++) { const a = -2.7 + j * 0.6; ctx.save(); ctx.translate(x + sw, top); ctx.rotate(a + Math.PI / 2); ctx.fillRect(-5, 0, 10, 60 + (j % 2) * 18); ctx.restore(); }
    }
  }
  drawGround(ctx, th0, now) {
    let th = th0; const cam = this.cam, x0 = cam - 40, x1 = cam + W + 40;
    for (const [a, b] of this.m.ground) {
      let l = Math.max(a, x0), r = Math.min(b, x1);
      if (this.eater && !this.eater.stop) l = Math.max(l, this.eater.x + this.eaterW() - 30);
      if (r <= l) continue;
      const pier = this.m.len - W + 300;
      if (this.m.theme === 'planks' && l < pier) {
        const r0 = r; r = Math.min(r, pier);
        // a plank deck on a timber trestle, over open water
        const chew = this.eater && !this.eater.stop ? this.eater.x + this.eaterW() - 30 : -1e9;
        if (chew > x0 - 400) {
          // what the eater left: snapped trestle posts standing in the river, splintered at the top
          for (let px = Math.floor((x0 - 64) / 192) * 192; px < chew; px += 192) {
            const hs = ((px * 2654435761) >>> 0) % 5, top = GY + 34 + hs * 9;
            ctx.fillStyle = th.c; ctx.fillRect(px + 26, top, 12, H - top);
            ctx.fillStyle = th.b; for (let j = 0; j < 3; j++) ctx.fillRect(px + 26 + j * 4, top - 6 - ((hs + j) % 3) * 5, 4, 8);
            if (hs > 2) { ctx.save(); ctx.translate(px + 40, top + 10); ctx.rotate(0.9); ctx.fillStyle = th.c; ctx.fillRect(0, -3, 50, 7); ctx.restore(); }   // a brace hanging off it
          }
        }
        for (let px = Math.floor(l / 64) * 64; px < r; px += 64) {
          if (px + 64 <= l) continue;
          if (px < chew && chew < px + 64) {
            // the plank in the teeth: prised up at its near end, cracking, about to go
            const k = (chew - px) / 64, a = -0.15 - k * 0.55 + Math.sin(now / 40) * 0.04;
            ctx.save(); ctx.translate(px + 63, GY + 3); ctx.rotate(-a);
            ctx.fillStyle = th.c; ctx.fillRect(-64, -9, 64, 18); ctx.fillStyle = (px / 64) % 2 ? th.a : th.b; ctx.fillRect(-62, -7, 62, 14); ctx.fillStyle = th.d; ctx.fillRect(-62, -7, 62, 3);
            ctx.fillStyle = th.c; for (let j = 0; j < 4; j++) ctx.fillRect(-64 - (j % 2) * 6, -7 + j * 4, 8, 3);   // splinters
            ctx.restore();
            ctx.fillStyle = th.c; ctx.fillRect(px + 52, GY + 10, 12, 8);   // the snapped joist under it
            continue;
          }
          ctx.fillStyle = (px / 64) % 2 ? th.a : th.b; ctx.fillRect(px + 1, GY - 4, 62, 14);
          ctx.fillStyle = th.d; ctx.fillRect(px + 1, GY - 4, 62, 3);
          ctx.fillStyle = th.c; ctx.fillRect(px + 1, GY + 10, 62, 4);
          if ((px / 64) % 3 === 0) {
            ctx.fillStyle = th.c; ctx.fillRect(px + 26, GY + 14, 12, H - GY);
            ctx.strokeStyle = th.b; ctx.lineWidth = 7;
            ctx.beginPath(); ctx.moveTo(px + 32, GY + 20); ctx.lineTo(px + 32 + 192, GY + 100); ctx.moveTo(px + 32 + 192, GY + 20); ctx.lineTo(px + 32, GY + 100); ctx.stroke();
          }
        }
        if (r0 <= pier) continue;
        l = pier; r = r0; th = THEME.stone;
      }
      ctx.fillStyle = th.b; ctx.fillRect(l, GY, r - l, H - GY);
      ctx.fillStyle = th.c; ctx.fillRect(l, GY + 44, r - l, H - GY - 44);
      ctx.fillStyle = th.a; ctx.fillRect(l, GY - 4, r - l, 12);
      ctx.fillStyle = th.d;
      for (let px = Math.floor(l / 36) * 36; px < r; px += 36) {
        const hsh = ((px * 2654435761) >>> 0) % 7;
        if (px < l) continue;
        ctx.fillRect(px + hsh * 3, GY - 6 - (hsh % 3) * 2, 10 + hsh, 4);
        if (hsh > 4) { ctx.fillStyle = th.c; ctx.fillRect(px + 8, GY + 16 + hsh * 2, 14, 5); ctx.fillStyle = th.d; }
      }
      // pit lips
      ctx.fillStyle = th.c; if (a > x0) ctx.fillRect(a, GY - 4, 6, H); if (b < x1) ctx.fillRect(b - 6, GY - 4, 6, H);
    }
  }
  drawPlat(ctx, x, y, w, th) {
    ctx.fillStyle = th.c; ctx.fillRect(x, y + 10, w, 14);
    ctx.fillStyle = th.b; ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = th.d; ctx.fillRect(x, y - 3, w, 5);
    ctx.fillStyle = th.c; ctx.fillRect(x + 8, y + 24, 8, 26); ctx.fillRect(x + w - 16, y + 24, 8, 26);
  }
  drawCrate(ctx, x, y) {
    const im = IMG.pk_crate;
    if (im) { const hh = 60, w = hh * (im.width / im.height); ctx.drawImage(im, Math.round(x - w / 2), Math.round(y - hh), w, hh); return; }
    ctx.fillStyle = '#5e4228'; ctx.fillRect(x - 30, y - 54, 60, 54);
    ctx.fillStyle = '#a57f52'; ctx.fillRect(x - 26, y - 50, 52, 46);
    ctx.fillStyle = '#8a6a3c'; ctx.fillRect(x - 26, y - 30, 52, 6); ctx.fillRect(x - 4, y - 50, 8, 46);
    ctx.fillStyle = '#d9b98a'; ctx.fillRect(x - 26, y - 50, 52, 4);
    ctx.strokeStyle = PAL.outline; ctx.lineWidth = 3; ctx.strokeRect(x - 30, y - 54, 60, 54);
  }
  // weapons keep their crate art; 1UP, bomb and medkit have their own
  drawPick(ctx, k, x, y, s) {
    const im = IMG[{ life: 'pk_1up', gren: 'pk_bomb', med: 'pk_med' }[k]] || IMG['m_pk_' + k];
    if (im) { const r = im.height / im.width, w = r > 1 ? s / r : s, hh = w * r; ctx.drawImage(im, x - w / 2, y - hh / 2, w, hh); return; }
    if (k === 'gren') { hudIcon(ctx, 'bomb', x, y, s); return; }
    if (k === 'life') {   // a red heart
      const u = s / 12; ctx.fillStyle = PAL.outline; ctx.fillRect(x - 6 * u, y - 4 * u, 12 * u, 6 * u); ctx.fillRect(x - 4 * u, y + 2 * u, 8 * u, 3 * u); ctx.fillRect(x - 2 * u, y + 5 * u, 4 * u, 2 * u);
      ctx.fillStyle = '#e0443a'; ctx.fillRect(x - 5 * u, y - 3 * u, 4 * u, 5 * u); ctx.fillRect(x + u, y - 3 * u, 4 * u, 5 * u); ctx.fillRect(x - 3 * u, y + u, 6 * u, 3 * u); ctx.fillStyle = '#fff'; ctx.fillRect(x - 4 * u, y - 2 * u, u, u); return;
    }
    ctx.fillStyle = '#3d4a2a'; ctx.fillRect(x - s / 2, y - s / 2, s, s);
    ctx.strokeStyle = PAL.outline; ctx.lineWidth = 3; ctx.strokeRect(x - s / 2, y - s / 2, s, s);
  }
  drawExits(ctx, now) {
    const ex = this.m.exits, L = this.m.len;
    // each sign shows the ride that road gives you (a road with no ride shows where it goes)
    const sign = (x, y, e) => {
      ctx.fillStyle = '#5e4228'; ctx.fillRect(x - 5, y - 120, 10, 120);
      ctx.fillStyle = '#a57f52'; ctx.fillRect(x - 62, y - 190, 124, 84);
      ctx.strokeStyle = PAL.outline; ctx.lineWidth = 4; ctx.strokeRect(x - 62, y - 190, 124, 84);
      const R = e.ride ? RIDE[e.ride] : null, im = IMG[R ? R.img : e.icon];
      if (im) { const s = Math.min(104 / im.width, 68 / im.height), fl = R && (R.nf || 1) < 0; ctx.save(); ctx.translate(x, y - 148); if (fl) ctx.scale(-1, 1); ctx.drawImage(im, -im.width * s / 2, -im.height * s / 2, im.width * s, im.height * s); ctx.restore(); }
      else if (R) { ctx.save(); ctx.translate(x, y - 116); rideStandIn(ctx, e.ride, 90, 64, 0); ctx.restore(); }
      const bob = Math.sin(now / 160) * 8; ctx.fillStyle = PAL.cheese;
      ctx.beginPath(); ctx.moveTo(x + 84 + bob, y - 148); ctx.lineTo(x + 64 + bob, y - 166); ctx.lineTo(x + 64 + bob, y - 130); ctx.fill();
    };
    const park = (k, y) => { if (k && this.phase === 'fork' && !(this.ride && this.ride.k === k)) this.drawRide(ctx, k, L + 470, y - (RIDE[k].fly ? 6 + Math.sin(now / 260) * 3 : 0), 1, 0, 1, now, false, { tilt: 0 }); };
    if (ex.length > 1) { sign(L + 330, GY - 196, ex[0]); sign(L + 330, GY, ex[1]); park(ex[0].ride, GY - 196); park(ex[1].ride, GY); }
    else if (ex.length === 1) { sign(L + 330, GY, ex[0]); park(ex[0].ride, GY); }
  }
  // o: { tilt, walk, snap, rotor } -- the live ride's motion; a wreck passes nothing
  drawRide(ctx, k, x, y, face, flash, hpK, now, dead, o) {
    const R = RIDE[k], im = IMG[R.img]; o = o || {};
    const hgt = R.hgt, w = im ? hgt * (im.width / im.height) : hgt * 1.35;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); if (face < 0) ctx.scale(-1, 1);
    // from here on +x is the way the ride faces
    if (o.tilt) ctx.rotate(o.tilt);
    if (k === 'crab' && o.walk) { const st = Math.sin(o.walk); ctx.translate(0, -Math.abs(st) * 4); ctx.rotate(st * 0.025); }
    if (dead) {
      if (k === 'crab') { const c = Math.min(1, (o.t || 0) / 500); ctx.translate(0, c * 18); ctx.scale(1 + c * 0.12, 1 - c * 0.28); }   // legs give, belly down
      else ctx.rotate(k === 'copter' ? (o.rot || 0) : 0.12);
      if ('filter' in ctx) ctx.filter = 'brightness(0.3)';
    }
    if ((R.nf || 1) < 0) ctx.scale(-1, 1);
    if (im) {
      if (dead) ctx.drawImage(im, -w / 2, -hgt + 14, w, hgt);
      else drawImgHit(ctx, im, -w / 2, -hgt + 4, w, hgt, flash, hpK);
    } else rideStandIn(ctx, k, w, hgt, flash);
    if ('filter' in ctx) ctx.filter = 'none';
    if ((R.nf || 1) < 0) ctx.scale(-1, 1);
    // spinning blades over the art's own rotor, a blur that strobes
    if (k === 'copter' && !dead) {
      const ph = Math.floor(now / 40) % 3;
      ctx.fillStyle = `rgba(230,236,220,${0.18 + ph * 0.08})`; ctx.fillRect(-w * 0.45, -hgt + 2 + ph, w * 0.8, 5);
      ctx.fillStyle = 'rgba(40,44,32,0.5)'; ctx.fillRect(-w * 0.45 + ((now / 6) % (w * 0.7)), -hgt + 2, 26, 5);
    }
    // the claws snap shut on a bite
    if (k === 'crab' && o.snap > 0 && !dead) {
      const c = o.snap / 220;
      ctx.fillStyle = '#fff6d0'; for (let i = 0; i < 4; i++) ctx.fillRect(w * 0.42 + i * 8, -hgt * 0.42 + (i % 2 ? -1 : 1) * c * 22, 8, 4);
    }
    ctx.restore();
  }
  drawChute(ctx, x, y, now) {
    if (y >= GY - 2) return;
    const sway = Math.sin(now / 420) * 10;
    ctx.strokeStyle = '#d8d2c4'; ctx.lineWidth = 2;
    for (const o of [-52, -18, 18, 52]) { ctx.beginPath(); ctx.moveTo(x + sway + o, y - 170); ctx.lineTo(x, y - 84); ctx.stroke(); }
    ctx.fillStyle = '#e8e2cf'; ctx.beginPath(); ctx.arc(x + sway, y - 170, 62, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#b9b29a'; for (const o of [-40, 0, 40]) { ctx.beginPath(); ctx.arc(x + sway + o, y - 170, 21, Math.PI, 0); ctx.fill(); }
    ctx.strokeStyle = PAL.outline; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + sway, y - 170, 62, Math.PI, 0); ctx.closePath(); ctx.stroke();
  }
  drawCat(ctx, who, x, y, face, run, up, crouch, fire, now, a, air, moving) {
    const hgt = 100, flip = face < 0;
    const idle = up ? IMG['hero_' + who + '_up'] : IMG['hero_' + who];
    ctx.save(); ctx.translate(Math.round(x), Math.round(y));
    const ci = crouch ? IMG['hero_' + who + '_crouch'] : null;
    if (ci) {   // the real crouch pose (art faces right)
      const ch = 74, w = ch * (ci.width / ci.height); if (flip) ctx.scale(-1, 1);
      ctx.drawImage(ci, -w / 2, -ch, w, ch); ctx.restore();
      if (fire > 0) drawMuzzleBurst(ctx, x + face * 46, y - 30, face > 0 ? 0 : Math.PI, fire / 70);
      return;
    }
    if (crouch) ctx.scale(1, 0.62);
    const sheet = 'sheet_hero_' + who + '_run', s = SHEET[sheet];
    if (moving && !up && s && !air) {
      const w = hgt * (s.cw / s.ch); drawSheet(ctx, sheet, Math.floor(run / 70), -w / 2, -hgt, w, hgt, flip);
    } else if (idle) {
      const w = hgt * (idle.width / idle.height);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(idle, -w / 2, -hgt + (air ? -4 : 0), w, hgt);
    }
    ctx.restore();
    if (fire > 0) { if (up) drawMuzzleBurst(ctx, x + face * 8, y - 112, -Math.PI / 2, fire / 70); else drawMuzzleBurst(ctx, x + face * 56, y - (crouch ? 34 : 56), face > 0 ? 0 : Math.PI, fire / 70); }
  }
  drawEnemy(ctx, e, now) {
    const K = KIND[e.k], im = IMG[K.img]; if (!im) return;
    const L = LIFE[e.k] || LIFE.rat, nf = K.nf;
    const hgt = K.h, w = hgt * (im.width / im.height);
    const flip = (K.fly && e.k !== 'chopper') ? false : e.face !== nf;
    let y = e.y, clipY = null;
    if (K.fly) y = e.y + hgt / 2;
    if (e.rise > 0) clipY = GY;
    const live = e.st === 'live' && !(e.rise > 0), tt = now + e.ph * 997;
    const fl = Math.max(0, e.flash) / 130, moving = live && Math.abs(e.spd || 0) > 20;
    ctx.save();
    if (clipY !== null) { ctx.beginPath(); ctx.rect(e.x - w, 0, w * 2, clipY); ctx.clip(); y = e.y + hgt * (e.rise / 700); }
    // flinch: knocked back off its feet a little, away from where it faces
    ctx.translate(Math.round(e.x - e.face * fl * 7), Math.round(y));
    if (flip) ctx.scale(-1, 1);
    // from here the art faces nf
    const ph = e.wph || 0, stride = moving ? Math.sin(ph) : 0;
    let rot = stride * L.sway + (live ? Math.sin(tt / 1300) * 0.015 : 0);
    rot += -nf * fl * 0.16;                                              // the hit rocks it back
    if (e.tell > 0) rot += nf * 0.08;                                    // leans into the wind-up
    if (e.st === 'burn') rot += Math.sin(now / 40) * 0.2;
    let bob = moving ? -Math.abs(stride) * L.step : 0, sx = 1, sy = 1;
    if (live && L.br) { const b = Math.sin(tt / L.bp); sy = 1 + b * L.br; sx = 1 - b * L.br * 0.5; }
    if (e.k === 'chopper' || e.k === 'ufo') { rot = Math.sin(tt / 640) * 0.05 + clamp((e.spd || 0) / 900, -0.12, 0.12) * -nf - nf * fl * 0.12; bob = Math.sin(tt / 230) * 5; }
    if (e.k === 'jelly') { bob = Math.sin(tt / 380) * 6; }
    if (e.k === 'crab') { rot += moving ? Math.sin(ph * 2) * 0.03 : 0; bob = moving ? -Math.abs(Math.sin(ph * 2)) * 4 : 0; if (e.tell > 0) { sy *= 0.9; sx *= 1.06; } }
    if (e.k === 'zombie' && live) rot += Math.sin(tt / 700) * 0.04;     // the shamble never quite stops
    if (e.k === 'fatz' && live) { sx *= 1 + Math.sin(tt / 380) * 0.02; }
    if (e.tell > 0) { const q = 1 + Math.sin(now / 30) * 0.03; sy *= q; }
    ctx.translate(0, bob); ctx.rotate(rot); ctx.scale(sx, sy);
    const hk = e.st === 'burn' ? 0 : e.hp / e.hpMax, fa = e.st === 'burn' ? 0.75 : fl;
    const gl = e.st === 'cheesed' ? 0.92 : e.tell > 0 && e.st === 'live' ? 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(now / 45)) : 0;   // cheesed: a molten cheese statue
    if (L.head && live) {
      // the head has a mind of its own: it lolls, tips back in a wind-up, snaps on a hit
      const hr = Math.sin(tt / 760) * L.loll + (e.tell > 0 ? -nf * 0.12 : 0) + -nf * fl * 0.22 + (moving ? Math.sin(ph + 1.2) * L.loll * 0.5 : 0);
      drawSplit(ctx, im, -w / 2, -hgt, w, hgt, fa, hk, gl, L.head, hr);
    } else {
      drawImgHit(ctx, im, -w / 2, -hgt, w, hgt, fa, hk);
      if (gl > 0) drawImgGlow(ctx, im, -w / 2, -hgt, w, hgt, gl);
    }
    // the alien hover-craft: thrusters flicker green under it, and its bombs hang ready
    if (e.k === 'chopper' && live) {
      const f = 0.5 + 0.5 * Math.sin(now / 35);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(120,255,90,${0.25 + 0.3 * f})`; ctx.fillRect(-w * 0.2, -10, w * 0.24, 10 + f * 8);
      ctx.fillStyle = `rgba(230,255,200,${0.35 + 0.3 * f})`; ctx.fillRect(-w * 0.14, -6, w * 0.1, 4 + f * 6);
      ctx.restore();
    }
    ctx.restore();
    // green eyes on the risen
    if ((e.k === 'zombie' || e.k === 'fatz') && live) {
      const ex = e.x + e.face * (e.k === 'zombie' ? 15 : 52), ey = e.y - hgt * 0.8 + bob, f = 0.6 + 0.4 * Math.sin(now / 90 + e.ph);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(140,255,59,${0.35 * f})`; ctx.fillRect(ex - 8, ey - 6, 16, 12); ctx.fillStyle = '#eaffd0'; ctx.fillRect(ex - 3, ey - 2, 6, 4); ctx.restore();
    }
  }
  drawEShot(ctx, s, now) {
    if (s.k === 'ray') { ctx.fillStyle = PAL.acid; ctx.fillRect(s.x - 12, s.y - 4, 24, 8); ctx.fillStyle = '#eaffd0'; ctx.fillRect(s.x - 6, s.y - 2, 12, 4); }
    else if (s.k === 'vomit' || s.k === 'glob') { ctx.fillStyle = s.k === 'glob' ? PAL.cheeseDark : '#3f8a2a'; pxBlob(ctx, s.x, s.y, s.r + 3); ctx.fillStyle = s.k === 'glob' ? PAL.cheese : PAL.acid; pxBlob(ctx, s.x - 2, s.y - 2, s.r - 2); }
    else if (s.plasma) {
      // a hard-edged green orb with a white core and a crackling tail
      const f = Math.floor(now / 50) % 2;
      for (let i = 1; i <= 4; i++) { const tx = s.x - s.vx * 0.018 * i, ty = s.y - s.vy * 0.018 * i; ctx.fillStyle = i % 2 === f ? '#eaffd0' : PAL.acid; const z = 9 - i; ctx.fillRect(Math.round(tx + (((i * 37 + now / 30) | 0) % 3 - 1) * 4 - z / 2), Math.round(ty - z / 2), z, z); }
      ctx.fillStyle = 'rgba(140,255,59,0.35)'; pxBlob(ctx, s.x, s.y, s.r + 8);
      ctx.fillStyle = '#2f8a1c'; pxBlob(ctx, s.x, s.y, s.r + 2); ctx.fillStyle = PAL.acid; pxBlob(ctx, s.x, s.y, s.r - 1); ctx.fillStyle = '#f2ffe6'; pxBlob(ctx, s.x - 2, s.y - 2, s.r * 0.45);
      ctx.strokeStyle = '#eaffd0'; ctx.lineWidth = 2; ctx.beginPath(); const a0 = now / 60; for (let i = 0; i < 3; i++) { const a = a0 + i * 2.1; ctx.moveTo(s.x + Math.cos(a) * 8, s.y + Math.sin(a) * 8); ctx.lineTo(s.x + Math.cos(a + 0.4) * 20, s.y + Math.sin(a + 0.4) * 20); } ctx.stroke();
    }
    else if (s.hot) {
      // the eater's shell: a glowing slug with a pixel flame tail
      for (let i = 0; i < 5; i++) pxFlame(ctx, s.x - s.vx * 0.022 * (i + 1), s.y - s.vy * 0.022 * (i + 1), 16 - i * 2.4, 0.15 + i * 0.15, now + i * 53);
      ctx.fillStyle = '#ff8a1e'; pxBlob(ctx, s.x, s.y, 15); ctx.fillStyle = '#ffd23c'; pxBlob(ctx, s.x, s.y, 10); ctx.fillStyle = '#fff6d0'; pxBlob(ctx, s.x, s.y, 5);
      if (s.tx !== undefined) landMark(ctx, s.tx, 160, s, now);
    }
    else if (s.k === 'bomb' || s.k === 'shell') { const a = Math.atan2(s.vy, s.vx); ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(a); ctx.fillStyle = '#2b2a30'; ctx.fillRect(-12, -7, 24, 14); ctx.fillStyle = '#c8372d'; ctx.fillRect(4, -7, 6, 14); ctx.fillStyle = '#55524a'; ctx.fillRect(-18, -9, 7, 18); ctx.restore(); if (s.k === 'bomb') pxFlame(ctx, s.x - s.vx * 0.03, s.y - s.vy * 0.03, 10, 0.3, now); if (s.k === 'shell' && s.tx !== undefined) landMark(ctx, s.tx, 160, s, now); }
    else if (s.k === 'zap') { ctx.strokeStyle = '#b6ffe9'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(s.x, s.y - 26); for (let i = 1; i <= 4; i++) ctx.lineTo(s.x + (i % 2 ? 9 : -9), s.y - 26 + i * 13); ctx.stroke(); }
    else if (s.k === 'flame') pxFlame(ctx, s.x, s.y, 16 + s.t * 0.05, s.t / s.life, now + s.x);
    else if (s.k === 'napalm') { if (s.tx !== undefined) landMark(ctx, s.tx, 100, s, now); pxFlame(ctx, s.x, s.y, 26, 0.2, now + s.x); }
    else if (s.k === 'patch' && s.cheese) {   // a spreading pool of molten cheese, bubbling and smoking
      const k = s.t / s.life, a = k > 0.8 ? (1 - k) / 0.2 : 1, r = 30 + Math.min(1, s.t / 300) * 26;
      ctx.globalAlpha = a; ctx.fillStyle = PAL.cheeseDark; ctx.fillRect(s.x - r - 6, GY - 8, (r + 6) * 2, 10);
      ctx.fillStyle = '#ffb21f'; ctx.fillRect(s.x - r, GY - 12, r * 2, 8); ctx.fillStyle = PAL.cheese; ctx.fillRect(s.x - r + 8, GY - 14, r * 2 - 16, 5);
      for (let i = 0; i < 3; i++) { const ph = ((now / 400) + i / 3 + s.x * 0.01) % 1; ctx.fillStyle = '#fff2a8'; pxBlob(ctx, s.x - r + 12 + i * (r * 0.8), GY - 14 - ph * 10, 4 * (1 - ph) + 2); }
      if (Math.random() < 0.1) this.fx('smoke', s.x + rnd(-r, r), GY - 16, { vy: rnd(-70, -30), T: 600, r: rnd(6, 10), col: '#c9b48a' });
      ctx.globalAlpha = 1;
    }
    else if (s.k === 'mcheese') { const a = Math.atan2(s.vy, s.vx); ctx.fillStyle = PAL.cheeseDark; pxBlob(ctx, s.x - Math.cos(a) * 10, s.y - Math.sin(a) * 10, s.r * 0.8); ctx.fillStyle = '#ffb21f'; pxBlob(ctx, s.x, s.y, s.r); ctx.fillStyle = '#fff2a8'; pxBlob(ctx, s.x + 2, s.y - 2, s.r * 0.45); }
    else if (s.k === 'patch') { const k = s.t / s.life; for (let i = -1; i <= 1; i++) pxFlame(ctx, s.x + i * 26, GY - 10, 26 * (1 - k * 0.5), 0.15 + k * 0.5, now + i * 97 + s.x); }
    else if (s.k === 'wave') { for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#fff3d0' : PAL.boom1; ctx.fillRect(s.x - 20 + i * 10, GY - 46 + i * 9 + Math.sin(now / 40 + i) * 6, 12, 46 - i * 9); } }
    else if (s.k === 'beam') { const k = s.t / s.life; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(120,255,210,${0.5 * (1 - k)})`; ctx.fillRect(s.x - 34, 0, 68, GY); ctx.fillStyle = `rgba(240,255,250,${0.9 * (1 - k)})`; ctx.fillRect(s.x - 10, 0, 20, GY); ctx.restore(); }
  }
  // what the boss is about to do, drawn where it is about to do it
  drawTells(ctx, now) {
    const b = this.boss, on = Math.floor(now / 80) % 2;
    if ((b.st === 'bolts') && b.cols) for (const cx of b.cols) { ctx.fillStyle = on ? 'rgba(120,255,210,0.28)' : 'rgba(120,255,210,0.12)'; ctx.fillRect(cx - 34, 0, 68, GY); ctx.fillStyle = '#b6ffe9'; ctx.fillRect(cx - 34, GY - 6, 68, 6); }
  }
  // how hot the boss glows right now: a fresh wind-up (a tell that jumps up) heats
  // it from nothing to full just as it fires; the quick beats inside a volley stay dark
  bossGlow(now) {
    const b = this.boss; if (!b || b.st === 'idle' || b.hp <= 0) { if (b) b._lt = 0; return 0; }
    const t = Math.max(0, b.tell || 0);
    if (t > (b._lt || 0) + 1) b._t0 = t;
    b._lt = t;
    if (!(b._t0 >= 300) || t <= 0) return 0;
    const k = 1 - t / b._t0;
    return (0.25 + 0.6 * k) * (0.75 + 0.25 * Math.sin(now / 40));
  }
  drawEater(ctx, x, now, flash, hpK, glow) {
    if (IMG.m_boss_hovertank) return this.drawHoverTank(ctx, x, now, flash, hpK, glow);
    const im = IMG.m_boss_eater; if (!im) return;
    const E = this.eater, hh = 340, w = hh * (im.width / im.height), grinding = E && !E.stop;
    // it rocks on its treads and shudders as the teeth bite; it kicks back when the cannon goes
    const jit = Math.sin(now / 45) * 2 + (grinding ? Math.sin(now / 23) * 1.5 : 0), rock = Math.sin(now / 260) * 0.012 + (grinding ? Math.sin(now / 70) * 0.006 : 0) - (E.recoil || 0) * 0.025;
    const fx0 = x + 190 - (E.recoil || 0) * 10;
    // the grinder under the jaw, behind the sprite's teeth: steel teeth rolling down into the deck
    if (grinding) {
      for (let i = 0; i < 7; i++) { const ty = GY - 110 + ((now / 3 + i * 26) % 182); ctx.fillStyle = i % 2 ? '#8a8576' : '#cfc8b0'; ctx.fillRect(fx0 - 46, ty, 22, 10); ctx.fillStyle = '#2b2a24'; ctx.fillRect(fx0 - 46, ty + 10, 22, 3); }
    }
    ctx.save(); ctx.translate(fx0 - w * 0.5, GY + 30); ctx.rotate(rock); ctx.translate(-w * 0.5, -hh + jit);
    drawImgHit(ctx, im, 0, 0, w, hh, flash, hpK);
    drawImgGlow(ctx, im, 0, 0, w, hh, glow || 0);
    if (E.hot > 0) drawImgGlow(ctx, im, 0, 0, w, hh, E.hot * (0.35 + 0.15 * Math.sin(now / 60)), '#ff4a1c');   // shot at, it runs hot
    ctx.restore();
    // stack smoke, thicker while it chews
    for (let i = 0; i < (grinding ? 5 : 3); i++) { const ph = ((now / 600) + i * 0.21) % 1; ctx.globalAlpha = 0.55 * (1 - ph); ctx.fillStyle = '#3a3630'; pxBlob(ctx, x + 190 - w * 0.9 + (i % 3) * 14 - ph * 70, GY - hh + 10 - ph * 140, 12 + ph * 26); }
    ctx.globalAlpha = 1;
    // where the teeth meet the deck: sparks and chips spraying forward
    if (grinding) {
      for (let i = 0; i < 9; i++) { const ph = ((now / 160) + i * 0.111) % 1; ctx.fillStyle = i % 3 === 0 ? '#ffd23c' : i % 2 ? '#d9b98a' : '#8a6a3c'; const sz = i % 3 === 0 ? 5 : 8; ctx.fillRect(fx0 - 30 + ph * (60 + i * 8), GY - 16 - Math.sin(ph * 3.14) * (50 + i * 7), sz, sz); }
    }
    // muzzle flash at the barrel tip
    if (E.mf > 0) { const mz = this.eaterMuzzle(x); ctx.save(); ctx.translate(mz.x + 4, mz.y + jit); ctx.scale(2.2, 2.2); drawMuzzleBurst(ctx, 0, 0, 0, Math.min(1, E.mf / 140)); ctx.restore(); }
  }
  // the alien hover tank: mouth centre ON the deck at the chew line, hull floating over the river on
  // four green jets, saws spinning, cannon kicking, molten cheese welling in the maw before it spews
  drawHoverTank(ctx, x, now, flash, hpK, glow) {
    const im = IMG.m_boss_hovertank, E = this.eater, k = HT.k, w = im.width * k, h = im.height * k;
    const grinding = E && !E.stop, b = this.boss && this.boss.k === 'eater' ? this.boss : null;
    const hover = Math.sin(now / 320) * 4 + (grinding ? Math.sin(now / 41) * 1.2 : 0);
    const mx = this.eaterMouth(x), my = GY - 2 + hover, left = mx - HT.mouth[0] * k, top = my - HT.mouth[1] * k;
    const rock = HT.tilt + Math.sin(now / 520) * 0.012 - ((E && E.recoil) || 0) * 0.02;   // nose down into the bite, stern up on its jets
    const rp = (px, py) => { const dx = (px - HT.mouth[0]) * k, dy = (py - HT.mouth[1]) * k, c = Math.cos(rock), sn = Math.sin(rock); return [mx + dx * c - dy * sn, my + dx * sn + dy * c]; };
    // jet wash: green thrust roaring down into the river, spray kicked up where it lands
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const jx of HT.jets) {
      const [x0, y0] = rp(jx, HT.jetY), f = 0.6 + 0.4 * Math.sin(now / 30 + jx);
      ctx.fillStyle = `rgba(120,255,90,${0.35 * f})`; ctx.fillRect(x0 - 24, y0, 48, H - y0);
      ctx.fillStyle = `rgba(230,255,200,${0.5 * f})`; ctx.fillRect(x0 - 9, y0, 18, (H - y0) * (0.6 + 0.3 * f));
    }
    ctx.restore();
    for (const jx of HT.jets) { const x0 = rp(jx, HT.jetY)[0]; for (let i = 0; i < 2; i++) { const ph = ((now / 260) + i * 0.5 + jx * 0.01) % 1; ctx.globalAlpha = 0.6 * (1 - ph); ctx.fillStyle = '#d8f4ee'; pxBlob(ctx, x0 + (i ? 1 : -1) * ph * 40, H - 6 - ph * 30, 8 + ph * 10); } }
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(mx, my); ctx.rotate(rock); ctx.translate(-mx, -my);
    drawImgHit(ctx, im, left, top, w, h, flash, hpK);
    drawImgGlow(ctx, im, left, top, w, h, glow || 0);
    if (E && E.hot > 0) drawImgGlow(ctx, im, left, top, w, h, E.hot * (0.35 + 0.15 * Math.sin(now / 60)), '#ff4a1c');
    // the saws turn: bright teeth chasing round each blade
    for (const [sx, sy, sr] of HT.saws) {
      const cx = left + sx * k, cy = top + sy * k, r = sr * k, sp = now / (grinding ? 40 : 90);
      for (let i = 0; i < 6; i++) { const a = sp + i * Math.PI / 3; ctx.fillStyle = i % 2 ? '#fff6dc' : '#c9c2ad'; ctx.fillRect(Math.round(cx + Math.cos(a) * r) - 3, Math.round(cy + Math.sin(a) * r) - 3, 6, 6); }
    }
    // molten cheese welling up in the maw while it winds up, pouring out while it spews
    if (b && (b.st === 'cheese' || b.spew > 0)) {
      const f = b.spew > 0 ? 1 : Math.min(1, 1 - (b.tell || 0) / 800);
      ctx.fillStyle = '#ffb21f'; pxBlob(ctx, mx + 8, my + 6, 14 + f * 10); ctx.fillStyle = '#fff2a8'; pxBlob(ctx, mx + 12, my + 2, 6 + f * 6);
      for (let i = 0; i < 3; i++) { const ph = ((now / 300) + i / 3) % 1; ctx.fillStyle = PAL.cheese; ctx.fillRect(mx - 10 + i * 12, my + 12 + ph * 30, 5, 8); }
    }
    ctx.restore();
    // where the saws meet the deck: sparks and splinters spraying forward
    if (grinding) for (let i = 0; i < 9; i++) { const ph = ((now / 160) + i * 0.111) % 1; ctx.fillStyle = i % 3 === 0 ? '#ffd23c' : i % 2 ? '#d9b98a' : '#8a6a3c'; const sz = i % 3 === 0 ? 5 : 8; ctx.fillRect(mx + 20 + ph * (60 + i * 8), GY - 12 - Math.sin(ph * 3.14) * (50 + i * 7), sz, sz); }
    // exhaust off the stern
    for (let i = 0; i < 3; i++) { const ph = ((now / 700) + i / 3) % 1; ctx.globalAlpha = 0.5 * (1 - ph); ctx.fillStyle = '#3a3630'; pxBlob(ctx, left + 90 * k - ph * 80, top + 260 * k - ph * 90, 10 + ph * 22); }
    ctx.globalAlpha = 1;
    if (E && E.mf > 0) { const mz = this.eaterMuzzle(x); ctx.save(); ctx.translate(mz.x + 6, mz.y + hover); ctx.scale(2.2, 2.2); drawMuzzleBurst(ctx, 0, 0, 0, Math.min(1, E.mf / 140)); ctx.restore(); }
  }
  drawBoss(ctx, now) {
    const b = this.boss, fl = Math.max(0, b.flash) / 110, hk = Math.max(0, b.hp / b.hpMax), gl = this.bossGlow(now);
    const draw = (id, hgt, ox, oy, flip) => { const im = IMG[id]; if (!im) return; const w = hgt * (im.width / im.height); ctx.save(); ctx.translate(b.x + ox, (b.fly ? b.y + hgt / 2 : b.y) + oy); if (flip) ctx.scale(-1, 1); drawImgHit(ctx, im, -w / 2, -hgt, w, hgt, fl, hk); drawImgGlow(ctx, im, -w / 2, -hgt, w, hgt, gl); ctx.restore(); };
    const lean = b.st !== 'idle' ? Math.sin(now / 35) * 3 : 0;
    if (b.k === 'zero') this.drawZero(ctx, now, fl, hk, gl);
    if (b.k === 'eater') this.drawEater(ctx, b.x, now, fl, hk, gl);
    if (b.k === 'jellyq') draw('m_boss_jelly', 340, 0, Math.sin(now / 300) * 6, false);
    if (b.k === 'barge') {
      draw('m_boss_barge', 380, 0, 30, true);
      // she is aground in the surf: the sea runs in under her from the right
      const x0 = b.x - 380, sw = Math.sin(now / 420) * 10;
      ctx.fillStyle = '#2f8fa3'; for (let i = 0; i < 6; i++) ctx.fillRect(x0 + sw - i * 14, GY + 2 + i * 10, 1400, 10);
      ctx.fillStyle = '#226f86'; ctx.fillRect(x0 + sw - 30, GY + 44, 1400, H - GY);
      ctx.fillStyle = '#e6f6f0'; for (let i = 0; i < 6; i++) ctx.fillRect(x0 + sw - i * 14 - 6, GY + 2 + i * 10, 16, 6);
      for (let i = 0; i < 12; i++) { const fx = x0 + 40 + i * 84 + Math.sin(now / 260 + i * 1.7) * 16; ctx.fillRect(fx, GY + 2 + (i % 3) * 14, 30 + (i % 2) * 14, 4); }
      for (let i = 0; i < 6; i++) { const ph = ((now / 500) + i * 0.17) % 1; ctx.fillRect(b.x - 250 + i * 8 - ph * 40, GY - 4 - Math.sin(ph * 3.14) * 34, 6, 6); }
    }
    if (b.k === 'gunship') { draw('m_boss_gunship', 300, lean, 0, false); }
    if (b.k === 'core') draw('m_boss_core', 460, lean, 10, false);
  }
  // the giant risen rat: heaves when it breathes, stomps when it walks, its head
  // lolls, it rears back to scream, it lunges to grab, it rocks back when hit
  drawZero(ctx, now, fl, hk, gl) {
    const b = this.boss, im = IMG.m_zombie_fat; if (!im) return;
    const hgt = 350, w = hgt * (im.width / im.height);
    const wp = (b.walk || 0) / 620 * Math.PI, br = Math.sin(now / 700);
    const tk = b.st !== 'idle' && b.tell > 0 && b._t0 ? clamp(1 - b.tell / b._t0, 0, 1) : 0;
    let rot = Math.sin(wp) * 0.035 + fl * 0.07, head = Math.sin(now / 900) * 0.09 + Math.sin(now / 370) * 0.02 + fl * 0.2, x = b.x + fl * 12, y = b.y + 6 - Math.abs(Math.sin(wp)) * 10;
    if (b.st === 'grab') { if (b.grab > 0) { rot -= 0.16; head -= 0.12; } else { rot += tk * 0.05; y += tk * 14; head -= tk * 0.1; } }   // crouch, then throw itself forward
    else if (b.st !== 'idle') { rot += tk * 0.1; head += tk * 0.32; }                                                                  // rears back to scream
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot); ctx.scale(1 - br * 0.015, 1 + br * 0.03);
    drawSplit(ctx, im, -w / 2, -hgt, w, hgt, fl, hk, gl, [0, 0, 0.58, 0.5, 0.42, 0.48], head);
    ctx.restore();
    // the scream: rings off the open jaw as the wind-up peaks
    if (b.st !== 'idle' && b.st !== 'grab' && tk > 0.35) {
      const mx = b.x - 150, my = GY - 230;
      ctx.save(); ctx.lineWidth = 6;
      for (let i = 0; i < 3; i++) { const r = 30 + (((now / 4) + i * 40) % 120); ctx.strokeStyle = `rgba(214,255,190,${0.6 * (1 - r / 150)})`; ctx.beginPath(); ctx.arc(mx, my, r, Math.PI * 0.7, Math.PI * 1.3); ctx.stroke(); }
      ctx.restore();
    }
  }
  drawFlyover(ctx, now) {
    const im = IMG.m_chopper; if (!im) return; const t = this.fly.t;
    for (let i = 0; i < 5; i++) { const x = W + 200 + i * 250 - t * 0.42, y = 40 + (i % 2) * 34 + Math.sin(now / 400 + i) * 6, hh = 150, w = hh * (im.width / im.height); if (x < -w || x > W + w) continue; ctx.drawImage(im, x - w / 2, y, w, hh); }
  }
  drawRain(ctx, now, a) {
    ctx.strokeStyle = `rgba(170,200,230,${a})`; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 60; i++) { const x = ((i * 137 + now * 0.9 + i * i * 31) % (W + 200)) - 100, y = ((i * 89 + now * 1.5) % (H + 100)) - 50; ctx.moveTo(x, y); ctx.lineTo(x - 10, y + 26); }
    ctx.stroke();
  }
  drawMotes(ctx, now, col) {
    ctx.fillStyle = col;
    for (let i = 0; i < 34; i++) { const x = ((i * 211 + now * 0.03 * (1 + i % 3)) % (W + 60)) - 30, y = H - ((i * 97 + now * 0.05 * (1 + i % 4)) % (H + 40)); ctx.globalAlpha = 0.25 + (i % 5) * 0.1; ctx.fillRect(x, y, 4, 4); }
    ctx.globalAlpha = 1;
  }
  drawHud(ctx, now) {
    const p = this._p || {}, h = this.h1;
    // hull and lives are the game's own HUD (top left); this adds the arcade strip
    msText(ctx, String((this.baseScore || 0) + this.score), W - 40, 56, 36, 'right');
    // a gun and a bomb: the pictures never change, only the numbers do
    this.hudGunK = Math.max(0, (this.hudGunK || 0) - 0.06); this.hudBombK = Math.max(0, (this.hudBombK || 0) - 0.06);
    ctx.fillStyle = 'rgba(10,14,24,0.55)'; ctx.fillRect(280, 22, 250, 62); ctx.strokeStyle = '#8fa0c0'; ctx.lineWidth = 2; ctx.strokeRect(280, 22, 250, 62);
    hudIcon(ctx, 'gun', HUD_GUN[0], HUD_GUN[1], 40 * (1 + this.hudGunK * 0.35));
    hudIcon(ctx, 'bomb', HUD_BOMB[0], HUD_BOMB[1], 46 * (1 + this.hudBombK * 0.35));
    msText(ctx, this.ride || h.weap === 'rifle' ? '∞' : String(h.ammo), 410, 68, 30, 'center');
    msText(ctx, String(h.gren), 500, 68, 30, 'center');
    if (this.ride) { const R = RIDE[this.ride.k], im = IMG[R.img]; if (im) { const hh = 44, w = hh * (im.width / im.height); ctx.drawImage(im, 600, 26, w, hh); } for (let i = 0; i < R.hp; i++) { ctx.fillStyle = i < this.ride.hp ? '#7fd45a' : 'rgba(10,14,24,0.6)'; ctx.fillRect(604 + i * 15, 74, 11, 9); ctx.strokeStyle = '#dfe7f5'; ctx.lineWidth = 1; ctx.strokeRect(604 + i * 15, 74, 11, 9); } }
    const q = this.h2;
    if (q) {                               // P2: Charlie's own arms and bombs, in his warm colours
      ctx.fillStyle = 'rgba(24,14,8,0.55)'; ctx.fillRect(280, 90, 250, 40); ctx.strokeStyle = '#d99a4a'; ctx.lineWidth = 2; ctx.strokeRect(280, 90, 250, 40);
      ctx.font = 'bold 14px monospace'; ctx.fillStyle = '#ffd08a'; ctx.textAlign = 'left'; ctx.fillText('P2', 290, 115);
      hudIcon(ctx, 'gun', 345, 110, 26); hudIcon(ctx, 'bomb', 450, 110, 30);
      ctx.textAlign = 'center'; msText(ctx, q.gone ? '-' : q.weap === 'rifle' ? '∞' : String(q.ammo), 410, 121, 22, 'center');
      msText(ctx, q.gone ? '-' : String(q.gren), 500, 121, 22, 'center');
    }
    // the boss bar lives at the top, under the HUD row, with the boss's face beside it.
    // A hit flashes it white; what you just took off drains away in red behind it.
    if (this.boss && this.boss.live && this.boss.hp > 0) {
      const b = this.boss, k = Math.max(0, b.hp / b.hpMax);
      b.lagK = Math.max(k, Math.min(b.lagK === undefined ? 1 : b.lagK, 1) - 0.004);
      const bx = W / 2 - 230, by = 142, bw = 520, bh = 22, slide = Math.min(1, b.t / 500);
      ctx.save(); ctx.globalAlpha = slide;
      ctx.fillStyle = 'rgba(10,14,24,0.7)'; ctx.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
      ctx.fillStyle = '#c8372d'; ctx.fillRect(bx, by, bw * b.lagK, bh);
      ctx.fillStyle = b.flash > 0 ? '#fff' : k > 0.4 ? PAL.cheese : PAL.redAccent; ctx.fillRect(bx, by, bw * k, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx, by, bw * k, 5);
      for (let i = 1; i < 10; i++) { ctx.fillStyle = 'rgba(10,14,24,0.45)'; ctx.fillRect(bx + i * bw / 10 - 1, by, 2, bh); }
      ctx.strokeStyle = '#dfe7f5'; ctx.lineWidth = 3; ctx.strokeRect(bx - 4, by - 4, bw + 8, bh + 8);
      // portrait
      const px = bx - 76, py = by - 22, ps = 64, pim = IMG[BOSS_FACE[b.k]];
      ctx.fillStyle = 'rgba(10,14,24,0.8)'; ctx.fillRect(px, py, ps, ps);
      if (pim) { ctx.save(); ctx.beginPath(); ctx.rect(px, py, ps, ps); ctx.clip(); const sc = Math.max(ps / pim.width, ps / pim.height) * 1.15, sh = b.flash > 0 ? 3 : 0; drawImgHit(ctx, pim, px + ps / 2 - pim.width * sc / 2 + (Math.random() - 0.5) * sh, py + ps / 2 - pim.height * sc / 2, pim.width * sc, pim.height * sc, Math.max(0, b.flash) / 110, k); ctx.restore(); }
      ctx.strokeStyle = k > 0.4 ? PAL.cheese : PAL.redAccent; ctx.lineWidth = 3; ctx.strokeRect(px, py, ps, ps);
      ctx.restore();
    }
  }
  drawBooms(ctx) { super.drawBooms(ctx); }
}

// --------------------------------------------------------- pixel primitives
// HUD pictures: the art if it is in, a chunky drawn stand-in if not. (x, y) = centre, h = height.
function hudIcon(ctx, k, x, y, h) {
  const im = IMG[k === 'gun' ? 'hud_gun' : 'hud_bomb'];
  if (im) { const w = h * (im.width / im.height); ctx.drawImage(im, Math.round(x - w / 2), Math.round(y - h / 2), w, h); return; }
  const u = h / 40; ctx.save(); ctx.translate(x, y); ctx.scale(u, u);
  if (k === 'gun') {
    ctx.fillStyle = '#1c1a12'; ctx.fillRect(-38, -12, 74, 16); ctx.fillRect(-30, 2, 14, 18); ctx.fillRect(4, 2, 10, 10);
    ctx.fillStyle = '#6e7350'; ctx.fillRect(-36, -10, 50, 12); ctx.fillStyle = '#9aa07a'; ctx.fillRect(-36, -10, 50, 3);
    ctx.fillStyle = '#4a4d3a'; ctx.fillRect(14, -8, 20, 8); ctx.fillStyle = '#8a6a3c'; ctx.fillRect(-28, 2, 10, 16);
  } else {
    ctx.fillStyle = '#1c1a12'; pxBlob(ctx, 0, 6, 16); ctx.fillRect(-5, -18, 10, 10);
    ctx.fillStyle = '#3d4a2a'; pxBlob(ctx, 0, 6, 13); ctx.fillStyle = '#5f7340'; ctx.fillRect(-8, -4, 6, 6);
    ctx.fillStyle = '#ffd23c'; ctx.fillRect(4, -22, 4, 4);
  }
  ctx.restore();
}
// One sprite, two pieces: the art is drawn as a body and a head (the rect
// hx0..hx1, hy0..hy1, in fractions of the art) and the head turns on its own
// neck pivot (px, py). The head piece runs a few px past its cut so the seam
// stays covered while it turns. Hit flash and wind-up glow apply to both.
function drawSplit(ctx, im, x, y, w, h, fl, hk, gl, hr, rot) {
  const [hx0, hy0, hx1, hy1, px, py] = hr, cut = y + h * hy1;
  const piece = (fn) => { drawImgHit(ctx, im, x, y, w, h, fl, hk); if (gl > 0) drawImgGlow(ctx, im, x, y, w, h, gl); };
  ctx.save(); ctx.beginPath();
  ctx.rect(x - 4, cut, w + 8, h * (1 - hy1) + 8);                    // everything below the neck line
  if (hx0 > 0) ctx.rect(x - 4, y - 8, w * hx0 + 4, h * hy1 + 8);      // and beside the head
  if (hx1 < 1) ctx.rect(x + w * hx1, y - 8, w * (1 - hx1) + 4, h * hy1 + 8);
  ctx.clip(); piece(); ctx.restore();
  ctx.save();
  const ox = x + w * px, oy = y + h * py;
  ctx.translate(ox, oy); ctx.rotate(rot); ctx.translate(-ox, -oy);
  ctx.beginPath(); ctx.rect(x + w * hx0, y - 8, w * (hx1 - hx0), h * hy1 + 8 + 4); ctx.clip(); piece();
  ctx.restore();
}
// A ride whose art has not loaded still has to be something you can see sitting
// under the cat: a chunky stand-in in the ride's colours (art faces right).
function rideStandIn(ctx, k, w, h, flash) {
  const ol = '#1c1a12', body = flash > 0 ? '#fff' : k === 'copter' ? '#6e7350' : k === 'crab' ? '#7d7a4c' : k === 'tank' ? '#5e6440' : '#6b6560';
  ctx.fillStyle = ol; ctx.fillRect(-w * 0.42 - 3, -h * 0.62 - 3, w * 0.84 + 6, h * 0.42 + 6);
  ctx.fillStyle = body; ctx.fillRect(-w * 0.42, -h * 0.62, w * 0.84, h * 0.42);
  if (k === 'copter') { ctx.fillStyle = ol; ctx.fillRect(-w * 0.5, -h * 0.5, w * 0.2, 8); ctx.fillRect(-w * 0.35, -h * 0.12, w * 0.7, 6); ctx.fillRect(-4, -h * 0.95, 8, h * 0.33); ctx.fillStyle = '#9fd8e0'; ctx.fillRect(w * 0.12, -h * 0.58, w * 0.22, h * 0.16); }
  else if (k === 'crab') { ctx.fillStyle = ol; for (let i = 0; i < 4; i++) ctx.fillRect(-w * 0.36 + i * w * 0.18, -h * 0.22, 8, h * 0.22); ctx.fillStyle = body; ctx.fillRect(w * 0.36, -h * 0.5, w * 0.16, h * 0.16); ctx.fillRect(w * 0.36, -h * 0.3, w * 0.16, h * 0.1); }
  else { ctx.fillStyle = ol; ctx.fillRect(-w * 0.38, -h * 0.22, w * 0.76, h * 0.2); }
}
function pxBlob(ctx, x, y, r) {
  const q = 4, R = Math.max(q, Math.round(r / q) * q);
  x = Math.round(x / q) * q; y = Math.round(y / q) * q;
  ctx.fillRect(x - R, y - R / 2, R * 2, R); ctx.fillRect(x - R / 2, y - R, R, R * 2); ctx.fillRect(x - R * 0.75, y - R * 0.75, R * 1.5, R * 1.5);
}
// Metal Slug fire: hard-edged nested shapes on a white > yellow > orange > red
// ramp, snapped to a grid, with licks that climb. No soft gradients anywhere.
function pxFlame(ctx, x, y, r, k, seed) {
  const a = k > 0.75 ? (1 - k) / 0.25 : 1;
  ctx.globalAlpha = a;
  const j = Math.sin(seed * 0.013) * r * 0.25;
  ctx.fillStyle = k < 0.55 ? '#d8401c' : '#7a2412'; pxBlob(ctx, x, y, r);
  for (let i = 0; i < 3; i++) { const lx = x + (i - 1) * r * 0.6 + Math.sin(seed * 0.02 + i * 2) * r * 0.2; ctx.fillRect(Math.round(lx / 4) * 4 - 4, Math.round((y - r - r * 0.5 * Math.abs(Math.sin(seed * 0.03 + i))) / 4) * 4, 8, r); }
  if (k < 0.8) { ctx.fillStyle = '#ff8a1e'; pxBlob(ctx, x + j * 0.4, y + r * 0.1, r * 0.72); }
  if (k < 0.55) { ctx.fillStyle = '#ffd23c'; pxBlob(ctx, x + j * 0.2, y + r * 0.2, r * 0.46); }
  if (k < 0.3) { ctx.fillStyle = '#fff6d0'; pxBlob(ctx, x, y + r * 0.25, r * 0.24); }
  ctx.globalAlpha = 1;
}
// The arcade title face: fat capitals, a hot yellow-to-red fill, a dark edge.
export function msText(ctx, s, x, y, size, align) {
  ctx.save();
  ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`; ctx.textAlign = align || 'left'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size * 0.14); ctx.strokeStyle = '#3a0d08'; ctx.strokeText(s, x, y);
  ctx.lineWidth = Math.max(2, size * 0.05); ctx.strokeStyle = '#fff'; ctx.strokeText(s, x, y);
  const g = ctx.createLinearGradient(0, y - size * 0.8, 0, y);
  g.addColorStop(0, '#fff07a'); g.addColorStop(0.5, '#ff9a1e'); g.addColorStop(1, '#d8281c');
  ctx.fillStyle = g; ctx.fillText(s, x, y);
  ctx.restore();
}

// ================================================================ cutscenes
// In-engine, drawn with the game's own sprites, so the two cats are always the
// two cats and nothing can drift off-model between shots. Any key skips.
const MAP_AT = { start: [735, 430], graveyard: [700, 292], bridge: [640, 610], caves: [628, 222], coast: [812, 500], citadel: [752, 352], hive: [520, 128] };
export class Cine extends RailBase {
  constructor(name, o) {
    super(999999);
    this.name = name; this.o = o || {}; this.parts = [];
    this.len = { aftermath: 9800, map: 4600, ramp: 7600, finale: 8600, rising: 9800 }[name] || 3000;
    this.kills = 0; this.score = 0; this.isCine = true;
  }
  step(bits, dt) {
    if (this.done) return;
    this.t += dt; this.shake = Math.max(0, this.shake - dt * 0.05);
    for (const b of this.booms) b.t += dt; this.booms = this.booms.filter(b => b.t < 700);
    if (!this.started) { this.started = true; this.events.push({ e: 'music', n: this.name === 'finale' ? 'music_valkyries' : this.name === 'rising' ? 'music_tunnel' : 'music_ratpatrol' }); }
    const at = (ms, fn) => { if (this.t >= ms && this.t - dt < ms) fn(); };
    const boom = (x, y, big) => { this.booms.push({ x, y, t: 0, big }); this.events.push({ e: 'sfx', n: 'sfx_explosion' }); this.shake = big ? 20 : 8; };
    if (this.name === 'aftermath') { at(1500, () => this.events.push({ e: 'sfx', n: 'sfx_ufo' })); for (let i = 0; i < 6; i++) at(4900 + i * 420, () => { this.events.push({ e: 'sfx', n: 'sfx_shot' }); this.shake = 6; }); }
    if (this.name === 'ramp') { at(3300, () => { boom(900, 520, 1); boom(980, 560, 1); boom(840, 580, 0); }); at(3600, () => boom(940, 500, 1)); at(5000, () => { this.shake = 10; this.events.push({ e: 'sfx', n: 'sfx_shrapnel' }); }); at(5150, () => { this.shake = 10; this.events.push({ e: 'sfx', n: 'sfx_shrapnel' }); }); }
    if (this.name === 'finale') { for (let i = 0; i < 12; i++) at(300 + i * 260, () => boom(520 + Math.random() * 400, 200 + Math.random() * 360, i % 2)); at(3600, () => { this.shake = 30; this.events.push({ e: 'sfx', n: 'sfx_napalm' }); }); }
    if (this.name === 'rising') {
      for (let i = 0; i < 8; i++) at(500 + i * 260, () => this.events.push({ e: 'sfx', n: 'sfx_shot' }));
      at(2700, () => { boom(830, 520, 1); boom(900, 560, 1); this.events.push({ e: 'sfx', n: 'sfx_napalm' }); });
      at(2950, () => boom(760, 540, 0));
      for (let i = 0; i < 6; i++) at(5600 + i * 330, () => { this.events.push({ e: 'sfx', n: i % 2 ? 'sfx_screech' : 'sfx_gore' }); this.shake = 4; });
    }
    if (this.name === 'map') at(1200, () => this.events.push({ e: 'sfx', n: 'sfx_plane' }));
    if (this.t > 700 && (bits & (C.FIRE | C.JUMP)) && !(this.prevBits & (C.FIRE | C.JUMP))) this.done = true;
    if (this.t >= this.len) this.done = true;
    this.prevBits = bits;
  }
  cat(ctx, who, x, y, face, pose, sq) {
    const im = pose === 'up' ? IMG['hero_' + who + '_up'] : IMG['hero_' + who]; if (!im) return;
    const hh = 100, w = hh * (im.width / im.height);
    ctx.save(); ctx.translate(x, y); if (face < 0) ctx.scale(-1, 1); ctx.scale(1 + (1 - (sq || 1)) * 0.5, sq || 1); ctx.drawImage(im, -w / 2, -hh, w, hh); ctx.restore();
  }
  render(ctx, now) {
    const t = this.t, sh = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save(); ctx.translate(sh, sh * 0.5);
    const bgd = (id) => { const im = IMG[id]; if (im) ctx.drawImage(im, 0, 0, W, H); else { ctx.fillStyle = '#18202a'; ctx.fillRect(0, 0, W, H); } };
    const fire = (x, y, n, s) => { for (let i = 0; i < n; i++) { const ph = ((now / (300 + i * 37)) + i * 0.37) % 1; pxFlame(ctx, x + (i - n / 2) * s * 0.8, y - ph * s * 2.2, s * (1 - ph * 0.5), ph, now + i * 99); } };
    if (this.name === 'rising') this.drawRising(ctx, now, t, fire);
    else if (this.name === 'aftermath') {
      if (t < 4600) {
        // the flagship is down. It is not finished.
        bgd('bg_invasion');
        // Grimtail's flagship, down in the mud: smoke going up in columns, small fires, dust still settling
        for (let c = 0; c < 3; c++) for (let i = 0; i < 7; i++) { const ph = ((now / (1700 + c * 300)) + i / 7) % 1, sx = [640, 790, 930][c]; ctx.globalAlpha = 0.6 * (1 - ph); ctx.fillStyle = i % 2 ? '#2a2622' : '#3a342e'; pxBlob(ctx, sx + Math.sin(ph * 4 + c) * 18 - ph * 90, GY - 170 - ph * 420, 18 + ph * 46); }
        ctx.globalAlpha = 1;
        const gw = IMG.m_grimtail_wreck, wr = gw || IMG.alien_scanship_wreck || IMG.boss_closed;
        if (wr) { const hh = gw ? 320 : 300, w = hh * (wr.width / wr.height), sk = Math.max(0, 1 - t / 900); ctx.drawImage(wr, 760 - w / 2, GY - hh + (gw ? 24 : 60) - sk * 10 + Math.sin(t / 30) * sk * 4, w, hh); }
        fire(600, GY - 120, 3, 16); fire(800, GY - 70, 4, 18); fire(930, GY - 150, 3, 14); fire(690, GY - 10, 2, 12);
        ctx.fillStyle = '#2c2417'; ctx.fillRect(0, GY, W, H - GY);
        // the dust it threw up, rolling out and settling
        const dk = Math.min(1, t / 3800);
        for (let i = 0; i < 16; i++) { const side = i % 2 ? 1 : -1, d = (160 + i * 34) * (0.4 + dk * 0.8); ctx.globalAlpha = 0.5 * (1 - dk) + 0.05; ctx.fillStyle = i % 3 ? '#8a7a5c' : '#a8987a'; pxBlob(ctx, 760 + side * d, GY - 10 - (1 - dk) * (30 + (i % 4) * 14), 22 + (i % 3) * 8 + dk * 14); }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#c8b894'; for (let i = 0; i < 26; i++) { const ph = ((now / 5000) + i * 0.0385) % 1; ctx.globalAlpha = 0.5 * (1 - dk * 0.6); ctx.fillRect((i * 97 + now * 0.012) % W, GY - 260 + ph * 260, 3, 3); }
        ctx.globalAlpha = 1;
        this.cat(ctx, 'us', 330, GY, 1); this.cat(ctx, 'vc', 250, GY, 1);
        if (t > 1500) { // a beam goes up out of the wreck...
          const k = Math.min(1, (t - 1500) / 500), w = 26 + Math.sin(now / 40) * 6;
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(140,255,59,0.55)'; ctx.fillRect(815 - w, GY - 250 - k * 560, w * 2, k * 560); ctx.fillStyle = 'rgba(235,255,210,0.9)'; ctx.fillRect(815 - w / 3, GY - 250 - k * 560, w / 1.5, k * 560); ctx.restore();
        }
        if (t > 2900) { // ...and far off, six more answer it
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 6; i++) { const k = clamp((t - 2900 - i * 180) / 400, 0, 1); ctx.fillStyle = 'rgba(140,255,59,0.5)'; ctx.fillRect(90 + i * 210 + (i > 2 ? 60 : 0), 380 - k * 380, 8, k * 380); }
          ctx.restore();
        }
        ctx.fillStyle = `rgba(140,255,59,${t > 1500 ? 0.06 + 0.04 * Math.sin(now / 90) : 0})`; ctx.fillRect(0, 0, W, H);
      } else {
        this.drawMap(ctx, now, t - 4600, [], null, null, true);
      }
    } else if (this.name === 'map') {
      this.drawMap(ctx, now, t, this.o.done || [], this.o.from, this.o.to, false);
    } else if (this.name === 'ramp') {
      // over the wreck, into the trees, and out of what is left of the boat
      bgd('bg_jungle');
      ctx.fillStyle = '#2c2417'; ctx.fillRect(0, GY, W, H - GY);
      const boat = IMG.ptboat_vehicle;
      if (t < 3300 && boat) {
        const k = t / 3300, x = -200 + k * 1140, y = 330 - Math.sin(k * Math.PI) * 150 + k * k * 230;
        const hh = 170, w = hh * (boat.width / boat.height);
        ctx.save(); ctx.translate(x, y); ctx.rotate(-0.28 + k * 0.75); ctx.drawImage(boat, -w / 2, -hh / 2, w, hh); ctx.restore();
        for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(220,240,235,0.8)'; ctx.fillRect(x - 90 - i * 26, y + 20 + i * i * 3 + Math.sin(now / 60 + i) * 4, 8, 8); }
      }
      if (t >= 3300) {
        if (boat) { const hh = 150, w = hh * (boat.width / boat.height); ctx.save(); ctx.translate(930, GY - 74); ctx.rotate(0.42); ctx.drawImage(boat, -w / 2, -hh / 2, w, hh); ctx.globalCompositeOperation = 'source-atop'; ctx.restore(); }
        fire(900, GY - 70, 7, 28); fire(1000, GY - 40, 5, 22);
        for (let i = 0; i < 5; i++) { const ph = ((now / 1500) + i * 0.2) % 1; ctx.globalAlpha = 0.5 * (1 - ph); ctx.fillStyle = '#2a2622'; pxBlob(ctx, 930 + i * 16, GY - 150 - ph * 260, 20 + ph * 40); } ctx.globalAlpha = 1;
        // thrown clear, and they land like cats
        const arc = (t0, x0, x1) => { const k = clamp((t - t0) / 1500, 0, 1); return { k, x: x0 + (x1 - x0) * k, y: GY - 60 - Math.sin(k * Math.PI) * 330 + k * 60 }; };
        const a = arc(3500, 900, 470), b = arc(3650, 900, 330);
        const land = (q, tl) => { const d = t - tl; return q.k < 1 ? 1 : d < 500 ? 0.6 : d < 1100 ? 0.6 + (d - 500) / 600 * 0.4 : 1; };
        ctx.save(); if (a.k < 1) { ctx.translate(a.x, a.y - 50); ctx.rotate(a.k * 9); ctx.translate(-a.x, -(a.y - 50)); } this.cat(ctx, 'us', a.x, a.k < 1 ? a.y : GY, t > 6300 ? -1 : 1, null, land(a, 5000)); ctx.restore();
        ctx.save(); if (b.k < 1) { ctx.translate(b.x, b.y - 50); ctx.rotate(-b.k * 9); ctx.translate(-b.x, -(b.y - 50)); } this.cat(ctx, 'vc', b.x, b.k < 1 ? b.y : GY, t > 6300 ? 1 : -1, null, land(b, 5150)); ctx.restore();
        for (const [tl, x] of [[5000, 470], [5150, 330]]) { const d = t - tl; if (d > 0 && d < 500) { ctx.fillStyle = `rgba(200,180,140,${0.7 * (1 - d / 500)})`; for (let i = 0; i < 6; i++) pxBlob(ctx, x + (i - 2.5) * (18 + d * 0.12), GY - 6 - d * 0.03, 10 + d * 0.02); } }
      }
    } else if (this.name === 'finale') {
      if (t < 3600) { bgd('m_bg_hive'); const im = IMG.m_boss_core; if (im) { const hh = 460, w = hh * (im.width / im.height); ctx.save(); ctx.translate(700 + Math.sin(now / 30) * 6, GY + 10 + t * 0.02); ctx.rotate(t * 0.00006); drawImgHit(ctx, im, -w / 2, -hh, w, hh, Math.floor(now / 90) % 3 ? 0 : 0.45, 0.1); ctx.restore(); } fire(640, GY - 200, 8, 30); }
      else {
        // the mountain goes, and it goes yellow
        bgd('m_bg_sunset');
        // a karst peak in stepped bands, lit on the sunset side, split at the crown
        for (let i = 0; i < 31; i++) {
          const y = 250 + i * 10, k2 = i / 30, half = 46 + k2 * k2 * 250 + k2 * 70 + ((i * 7) % 5) * 5;
          ctx.fillStyle = '#17110f'; ctx.fillRect(600 - half, y, half * 2, 10);
          ctx.fillStyle = '#3b1d18'; ctx.fillRect(600 - half, y, 14 + (i % 4) * 6, 10);
          ctx.fillStyle = '#6a2a1c'; ctx.fillRect(600 - half, y, 6, 10);
          if (i % 5 === 2) { ctx.fillStyle = '#241713'; ctx.fillRect(600 - half * 0.4, y, half * 0.9, 10); }
        }
        ctx.fillStyle = PAL.cheese; ctx.fillRect(572, 244, 56, 10); ctx.fillStyle = PAL.cheeseDark;
        for (let i = 0; i < 5; i++) { const l = 30 + ((t - 3600) * (0.05 + i * 0.012)) % 250; ctx.fillRect(566 + i * 15, 252, 8, Math.min(l, 40 + i * 50)); }
        const k = (t - 3600) / 5000;
        for (let i = 0; i < 60; i++) { const ph = ((now / 900) + i * 0.137) % 1, a = -Math.PI / 2 + (i / 60 - 0.5) * 1.5, r = ph * (320 + (i % 7) * 30); ctx.fillStyle = i % 3 ? PAL.cheese : PAL.cheeseDark; const s = 6 + (i % 4) * 4; ctx.fillRect(600 + Math.cos(a) * r - s / 2, 250 + Math.sin(a) * r + ph * ph * 380 - s / 2, s, s); }
        fire(600, 250, 6, 34);
        const hl = IMG.heli_us; if (hl) { const hh = 150 + k * 150, w = hh * (hl.width / hl.height), x = 500 + k * 560, y = 300 - k * 150 + Math.sin(now / 300) * 6; ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(hl, -w / 2, 0, w, hh); ctx.restore(); }
        if (t - 3600 < 400) { ctx.fillStyle = `rgba(255,255,255,${1 - (t - 3600) / 400})`; ctx.fillRect(0, 0, W, H); }
      }
    }
    for (const b of this.booms) b.world = 0;
    this.drawBooms(ctx);
    ctx.restore();
    const f = t < 400 ? 1 - t / 400 : t > this.len - 500 ? (t - (this.len - 500)) / 500 : 0;
    if (f > 0) { ctx.fillStyle = `rgba(0,0,0,${clamp(f, 0, 1)})`; ctx.fillRect(0, 0, W, H); }
  }
  // RISING (between slot two and slot three). Shown, never said:
  //   0-2.7s  a rat tanker full of glowing green runs from the cats; they shoot it to pieces
  //   2.7-5s  the tank goes up, the green cloud drifts over the field of rats they killed and rains on it
  //   5-8s    the dead twitch, then stand, one by one, green-eyed
  //   8-9.8s  the two cats look at each other
  drawRising(ctx, now, t, fire) {
    const bg = IMG.m_bg_sunset || IMG.bg_jungle; if (bg) ctx.drawImage(bg, 0, 0, W, H); else { ctx.fillStyle = '#2a1c22'; ctx.fillRect(0, 0, W, H); }
    const ooze = clamp((t - 2700) / 2500, 0, 1);
    if (ooze > 0) { ctx.fillStyle = `rgba(80,255,60,${0.16 * ooze})`; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = '#2c2417'; ctx.fillRect(0, GY, W, H - GY); ctx.fillStyle = '#3d3222'; ctx.fillRect(0, GY - 4, W, 8);
    const zoom = t > 8000 ? Math.min(1, (t - 8000) / 700) : 0;
    ctx.save();
    if (zoom) { const z = 1 + zoom * 0.9, cx = 250, cy = GY - 60; ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx + zoom * 60, -cy + zoom * 10); }
    // the dead: rats they killed, where they fell
    const DEAD = [[420, 0], [540, 1], [650, 0], [760, 1], [880, 0], [990, 1], [1100, 0]];
    const rat = IMG.alien_trooper, zom = IMG.m_zombie;
    DEAD.forEach(([x, f], i) => {
      const t0 = 5200 + i * 380, k = clamp((t - t0) / 700, 0, 1);              // 0 lying, 1 standing
      const tw = t > 4300 && k === 0 ? Math.sin(now / 30 + i * 2) * 0.06 * ((now / 140 + i) % 3 < 1 ? 1 : 0) : 0;   // twitches before it moves
      const im = k > 0.55 && zom ? zom : rat; if (!im) return;
      const hh = 96, w = hh * (im.width / im.height), up = k > 0.55;
      ctx.save(); ctx.translate(x, GY + 2);
      ctx.translate(0, -(1 - k) * w * 0.38);
      const face = -1;                                                         // they all turn to the cats
      const nf = up ? 1 : -1; if (face !== nf) ctx.scale(-1, 1);
      ctx.rotate((1 - k) * (f ? 1.45 : -1.45) * (face !== nf ? -1 : 1) + tw + (up ? Math.sin(now / 300 + i) * 0.06 : 0));
      if ('filter' in ctx && !up) ctx.filter = `brightness(${0.45 + ooze * 0.25})`;
      ctx.drawImage(im, -w / 2, -hh, w, hh); if ('filter' in ctx) ctx.filter = 'none';
      ctx.restore();
      if (k > 0 && k < 1) { ctx.fillStyle = 'rgba(140,255,59,0.5)'; pxBlob(ctx, x, GY - 40, 30 * (1 - k) + 8); }
      if (up) { const f2 = 0.6 + 0.4 * Math.sin(now / 80 + i); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(140,255,59,${0.5 * f2})`; ctx.fillRect(x - 28, GY - 88, 16, 10); ctx.fillStyle = '#eaffd0'; ctx.fillRect(x - 23, GY - 85, 6, 4); ctx.restore(); }
      if (ooze > 0.2 && k === 0) { ctx.fillStyle = PAL.acid; ctx.globalAlpha = 0.6; ctx.fillRect(x - 30, GY - 8, 60, 6); ctx.globalAlpha = 1; }   // a slick of it on every body
    });
    // the tanker: a rat truck hauling a tank of glowing green, running for it
    if (t < 2700) {
      const k = t / 2700, x = 520 + k * 520, hit = Math.floor(t / 130) % 3 === 0 && t > 600;
      ctx.save(); ctx.translate(x, GY); ctx.rotate(Math.sin(now / 50) * 0.01 + (t > 2300 ? Math.sin(now / 20) * 0.04 : 0));
      ctx.fillStyle = '#1c1a12'; ctx.fillRect(-150, -128, 260, 104); ctx.fillRect(100, -100, 74, 76);
      ctx.fillStyle = hit ? '#fff' : '#5a4a6a'; ctx.fillRect(104, -96, 66, 68); ctx.fillStyle = '#9fd8e0'; ctx.fillRect(134, -88, 28, 24);
      ctx.fillStyle = hit ? '#fff' : '#6d6a5a'; ctx.fillRect(-146, -124, 252, 96); ctx.fillStyle = '#8a8676'; ctx.fillRect(-146, -124, 252, 10);
      const gl = 0.6 + 0.4 * Math.sin(now / 90);
      ctx.fillStyle = `rgba(140,255,59,${gl})`; ctx.fillRect(-110, -96, 170, 34); ctx.fillStyle = '#eaffd0'; ctx.fillRect(-100, -90, 60, 8);
      ctx.fillStyle = '#ffd23c'; for (let i = 0; i < 6; i++) ctx.fillRect(-146 + i * 44, -40, 22, 10);
      ctx.fillStyle = '#1c1a12'; for (const wx of [-110, -40, 130]) { pxBlob(ctx, wx, -14, 24); } ctx.fillStyle = '#55524a'; for (const wx of [-110, -40, 130]) { ctx.save(); ctx.translate(wx, -14); ctx.rotate(now / 60); ctx.fillRect(-10, -3, 20, 6); ctx.restore(); }
      if (t > 1600) { ctx.fillStyle = PAL.acid; for (let i = 0; i < 4; i++) { const ph = ((now / 300) + i * 0.25) % 1; ctx.fillRect(-60 + i * 30 - ph * 40, -60 + ph * 70, 6, 6); } }   // leaking
      ctx.restore();
      // the cats' fire going into it
      if (t > 500) for (let i = 0; i < 3; i++) { const ph = ((now / 140) + i / 3) % 1, x0 = 330, y0 = GY - 56; ctx.fillStyle = '#ffe08a'; ctx.fillRect(x0 + (x - 120 - x0) * ph, y0 + (-30) * ph - 3, 24, 5); }
    } else {
      // it went up: the green geyser, then the cloud
      const gk = clamp((t - 2700) / 800, 0, 1), cx = 1040 - ooze * 560;
      if (t < 4200) { for (let i = 0; i < 10; i++) { const ph = ((now / 400) + i / 10) % 1; ctx.fillStyle = i % 2 ? PAL.acid : '#b6ff8a'; pxBlob(ctx, 1040 + Math.sin(i * 3) * 40 * ph, GY - 60 - ph * 380 * gk, 18 + ph * 20); } fire(1040, GY - 40, 5, 26); }
      ctx.save(); ctx.globalAlpha = 0.55 * Math.min(1, gk * 1.5) * (t > 7600 ? Math.max(0, 1 - (t - 7600) / 1200) : 1);
      for (let i = 0; i < 18; i++) { const ox = Math.sin(i * 1.7 + now / 900) * 300 * (0.4 + ooze * 0.6), oy = Math.cos(i * 2.3 + now / 1100) * 40; ctx.fillStyle = i % 3 ? '#5fdc3a' : '#9dff6a'; pxBlob(ctx, cx + ox, 200 + oy + (i % 4) * 16, 46 + (i % 5) * 10); }
      ctx.restore();
      // the green rain, on the dead
      if (ooze > 0.15 && t < 7800) { ctx.fillStyle = 'rgba(140,255,59,0.75)'; for (let i = 0; i < 70; i++) { const x = cx - 380 + ((i * 53) % 760), y = 240 + ((i * 91 + now * 0.7) % (GY - 240)); ctx.fillRect(x, y, 3, 12); } }
      // truck wreck burning
      ctx.save(); ctx.translate(1060, GY); ctx.rotate(0.3); ctx.fillStyle = '#1a1712'; ctx.fillRect(-120, -70, 200, 60); ctx.restore(); fire(1060, GY - 50, 3, 18);
    }
    // the cats: firing, then watching it come up, then looking at each other
    const look = t > 8200, uf = look ? -1 : 1, vf = look ? 1 : 1;
    const crouch = t > 5200 && t < 8200 ? 0.9 : 1;
    this.cat(ctx, 'vc', 220, GY, vf, null, crouch); this.cat(ctx, 'us', 310, GY, uf, null, crouch);
    if (t > 500 && t < 2600 && Math.floor(now / 70) % 2) { drawMuzzleBurst(ctx, 366, GY - 56, -0.06, 0.8); drawMuzzleBurst(ctx, 276, GY - 56, -0.06, 0.8); }
    if (look) { const k = Math.min(1, (t - 8400) / 500); if (k > 0) for (const [x, f] of [[310, -1], [220, 1]]) { const dy = GY - 112 + k * 14; ctx.fillStyle = '#1c2a3a'; pxBlob(ctx, x - f * 26, dy, 8); ctx.fillStyle = '#9fd8f0'; pxBlob(ctx, x - f * 26, dy, 5); ctx.fillRect(x - f * 26 - 2, dy - 12, 4, 6); } }   // a bead of sweat each
    ctx.restore();
  }
  // The war map. Six marks light up; the ones you have cleared are struck
  // through; a line walks from where you are to where you chose to go.
  drawMap(ctx, now, t, done, from, to, reveal) {
    const im = IMG.m_bg_map; if (im) ctx.drawImage(im, 0, 0, W, H); else { ctx.fillStyle = '#b9a06a'; ctx.fillRect(0, 0, W, H); }
    const ids = ['bridge', 'citadel', 'caves', 'graveyard', 'coast', 'hive'];
    const links = []; for (const a of ids) for (const e of MISSIONS[a].exits) links.push([a, e.to]);
    ctx.strokeStyle = 'rgba(60,30,20,0.45)'; ctx.lineWidth = 4; ctx.setLineDash([10, 10]);
    for (const [a, b] of links) { ctx.beginPath(); ctx.moveTo(...MAP_AT[a]); ctx.lineTo(...MAP_AT[b]); ctx.stroke(); }
    ctx.setLineDash([]);
    ids.forEach((id, i) => {
      const [x, y] = MAP_AT[id]; const shown = reveal ? t > 300 + i * 420 : true; if (!shown) return;
      const k = reveal ? Math.min(1, (t - 300 - i * 420) / 200) : 1, r = 22 + (1 - k) * 30;
      const missed = this.o && this.o.epilogue && !done.includes(id) && t > 1200;
      ctx.fillStyle = id === to || missed ? (Math.floor(now / 160) % 2 ? '#ff5a3c' : '#c8372d') : '#c8372d';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.strokeStyle = '#3a0d08'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#f3e9c8'; ctx.fillRect(x - 9, y - 9, 6, 6); ctx.fillRect(x + 3, y - 9, 6, 6); ctx.fillRect(x - 5, y + 3, 10, 5);   // a rat skull, in three marks
      ctx.beginPath(); ctx.arc(x - 16, y - 18, 7, 0, 7); ctx.arc(x + 16, y - 18, 7, 0, 7); ctx.fillStyle = '#c8372d'; ctx.fill(); ctx.stroke();
      if (done.includes(id)) { ctx.strokeStyle = '#1c1410'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x - 24, y - 24); ctx.lineTo(x + 24, y + 24); ctx.moveTo(x + 24, y - 24); ctx.lineTo(x - 24, y + 24); ctx.stroke(); }
    });
    const A = MAP_AT[from || 'start'], B = to ? MAP_AT[to] : (reveal ? MAP_AT[ROUTE_START] : null);
    const t0 = reveal ? 2800 : 900;
    if (B && t > t0) {
      const k = clamp((t - t0) / 2200, 0, 1), x = A[0] + (B[0] - A[0]) * k, y = A[1] + (B[1] - A[1]) * k;
      ctx.strokeStyle = PAL.cheese; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(x, y); ctx.stroke();
      const rk = this.o && to ? rideInto(to, this.o.via) : null, rd = rk ? IMG[RIDE[rk].img] : null, hl = rd || IMG.heli_us; if (hl) { const hh = rd ? 56 : 70, w = hh * (hl.width / hl.height), fl = rd ? (B[0] < A[0]) !== ((RIDE[rk].nf || 1) < 0) : B[0] > A[0]; ctx.save(); ctx.translate(x, y - 20 + (rd ? -Math.abs(Math.sin(now / 110)) * 5 : Math.sin(now / 200) * 4)); if (fl) ctx.scale(-1, 1); ctx.drawImage(hl, -w / 2, -hh / 2, w, hh); ctx.restore(); }
    }
  }
}

// ---------------------------------------------------------------- autopilot
// Headless harness only. route: 'up' | 'low' picks the road at a fork.
export function missionBot(m, frame) {
  if (m.isCine) return frame % 20 === 0 ? C.FIRE : 0;
  const h = m.h; let b = C.FIRE;
  if (m.phase === 'drop' || m.phase === 'out') return 0;
  const tap = frame % 14 < 4;
  const ahead = h.x + 78;
  if (m.phase === 'fork') {
    const L = m.m.len, wantUp = m.botRoute === 'up' && m.m.exits.length > 1;
    if (wantUp && h.onG && h.y > GY - 190) {
      // missed a step: walk back and take the stairs again
      const lvl = h.y > GY - 30 ? 0 : h.y > GY - 100 ? 1 : 2, foot = [L - 130, L - 30, L + 70][lvl];
      if (h.x > foot + 70) return C.L;
      b |= C.R; if (h.x > foot && frame % 2 === 0) b |= C.JUMP;
      return b;
    }
    b |= C.R;
    if (!m.solid(h.x + 46) && h.onG && frame % 2 === 0) b |= C.JUMP;
    return b;
  }
  const boss = m.boss && m.boss.live && m.boss.hp > 0 ? m.boss : null;
  if (boss) {
    const dx = boss.x - h.x;
    if (boss.fly) { if (Math.abs(dx) > 50) b |= dx > 0 ? C.R : C.L; b |= C.UP; if (boss.st !== 'idle' && tap) b |= (frame % 60 < 30 ? C.L : C.R); }
    else { const want = boss.k === 'eater' ? boss.x + 620 : boss.x - 520; if (h.x < want - 40) b |= C.R; else if (h.x > want + 40) b |= C.L; else if (boss.k === 'eater' && h.face > 0) b |= C.L; else if (boss.k !== 'eater' && h.face < 0) b |= C.R; }
    if (frame % 90 === 0) b |= C.GREN;
    for (const s of m.eshots) if (s.k === 'wave' && Math.abs(s.x - h.x) < 150 && tap) b |= C.JUMP;
    return b;
  }
  b |= C.R;
  const up = m.en.find(e => e.st === 'live' && KIND[e.k].fly && Math.abs(e.x - h.x) < 70);
  if (up) { b |= C.UP; b &= ~C.R; }
  // only hold ground for a foe the gun can reach: one parked under the ledge you stand on is not blocking anything
  const blk = m.en.find(e => e.st === 'live' && !KIND[e.k].fly && e.x > h.x && e.x - h.x < 150 && Math.abs(e.y - h.y) < 80);
  if (blk && !m.eater) b &= ~C.R;
  if (!m.solid(h.x + 46) && h.onG && frame % 2 === 0) b |= C.JUMP;
  // on the copter: keep the rotor up over anything that is not solid ground
  if (m.ride && RIDE[m.ride.k].fly && h === m.h1 && (!m.solid(h.x + 140) || !m.solid(h.x) || h.y > GY - 30 && !m.solid(h.x + 60))) b |= C.JUMP;
  // on the copter: anything on the ground below and ahead gets the chin gun tipped down at it
  if (m.ride && RIDE[m.ride.k].fly && m.en.some(e => e.st === 'live' && !KIND[e.k].fly && Math.abs(e.x - h.x) < 320 && e.y > h.y + 60)) b |= C.DOWN;
  if (frame % 200 === 0) b |= C.GREN;
  return b;
}
