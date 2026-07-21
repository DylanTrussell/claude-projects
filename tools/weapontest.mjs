import { makeGame, step } from '../public/sim.js';
import { C, CFG } from '../public/config.js';

// Ray gun pierce: 3 aliens in a line, one bolt should tag multiple
let g = makeGame(7, [{ pid: 'p1', hero: 'us' }]);
g.phase = 'play'; g.enemies = []; g.lift = null; g.invasion = true;
const p = g.players[0];
p.st = 'alive'; p.x = 1000; p.y = 620; p.weap = 'raygun'; p.ammo = 10; p.invulnT = 99999;
for (let i = 0; i < 3; i++) g.enemies.push({ id: 900 + i, k: 'alien', side: 'alien', x: 1150 + i * 60, y: 620, vx: 0, vy: 0, hp: 3, face: -1, st: 'walk', t: 99999, fireCd: 99999, tell: 0 });
for (let f = 0; f < 40; f++) step(g, 1000 / 60, { p1: f < 3 ? C.FIRE : 0 });
const hps = g.enemies.map(e => e.k + ':' + e.hp + (e.st === 'gone' ? '(dead)' : ''));
console.log('after 1 raygun burst:', hps, 'ammo', p.ammo);

// Grenade + shrapnel: enemies at 120px and 260px from blast — both should be hit now
g = makeGame(8, [{ pid: 'p1', hero: 'us' }]);
g.phase = 'play'; g.enemies = []; g.lift = null; g.invasion = true;
const q = g.players[0];
q.st = 'alive'; q.x = 1000; q.y = 620; q.gren = 3; q.invulnT = 99999;
g.enemies.push({ id: 950, k: 'alien', side: 'alien', x: 1290, y: 620, vx: 0, vy: 0, hp: 3, face: -1, st: 'walk', t: 99999, fireCd: 99999, tell: 0 });
g.enemies.push({ id: 951, k: 'alien', side: 'alien', x: 1520, y: 620, vx: 0, vy: 0, hp: 3, face: -1, st: 'walk', t: 99999, fireCd: 99999, tell: 0 });
for (let f = 0; f < 130; f++) step(g, 1000 / 60, { p1: f < 2 ? C.GREN : 0 });
console.log('after grenade (blast ~1290, shrapnel beyond):', g.enemies.map(e => e.k + ':' + e.hp + (e.st === 'gone' ? '(dead)' : '')));

// Flame: close-range stream kills a grunt fast
g = makeGame(9, [{ pid: 'p1', hero: 'us' }]);
g.phase = 'play'; g.enemies = []; g.lift = null;
const r = g.players[0];
r.st = 'alive'; r.x = 1000; r.y = 620; r.weap = 'flame'; r.ammo = 140; r.invulnT = 99999;
g.enemies.push({ id: 960, k: 'gruntVC', side: 'vc', x: 1140, y: 620, vx: 0, vy: 0, hp: 2, face: -1, st: 'walk', t: 99999, fireCd: 99999, tell: 0 });
for (let f = 0; f < 60; f++) step(g, 1000 / 60, { p1: C.FIRE });
console.log('after 1s flame:', g.enemies.map(e => e.k + ':' + e.hp + (e.st === 'gone' ? '(dead)' : '')), 'ammo', r.ammo);
