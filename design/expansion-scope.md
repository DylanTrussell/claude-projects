# APOCALYPSE MEOW — Content Expansion Scope (draft for Dylan)

Status: **proposal, nothing built.** Edit this, then we build against it.

Covers Dylan's v11.2 note: *"there needs to be way more gun powerups, health powerups,
collecting grenades and new bombs and weapons, there needs to be more enemies and more
variety of them and they need variety of weapons and vehicles and ships... need to have
flamethrower on our side and animate the fire better... Metal Slug-style helicopter
upgrade path (starting Huey → unrecognizable gun ship)."*

---

## 0. What the code says today (measured, not remembered)

Worth knowing before we add anything, because two of these numbers block features
Dylan has already asked for.

**Enemies that exist:** `grunt_us`, `grunt_vc`, `alien_trooper`, `ufo_small`,
`rat_blade` (tunnel, 5 poses), `vc_knife` (tunnel, 6 poses), `boss_mothership`,
`chancellor_boss`. Rail sections reuse `alien_trooper` and `ufo_small` for
*every* foe — the door gun's rat/hover/nest and the Skyraider's rat/ufo are the
same two sprites in different positions.

**Enemy HP (`config.js` + `rails.js`):**

| enemy | hp | consequence |
|---|---|---|
| rail `rat` | 1 | dies on first bullet |
| rail `hover` / `ufo` | 2 | one flash, then dead |
| rail `nest` | 3 | drawn as a flat teal rectangle, no sprite |
| `gruntHp` | 2 | |
| `alienHp` | 3 | |
| `ufoHp` | 5 | |
| `heliHp` | 24 | |
| `bossHp` | 320 | |

> **This is why the new hit-flash barely reads.** Dylan asked twice for Metal Slug
> damage feedback; it shipped in v12 and is verified working, but an `hp: 1` enemy
> never survives a hit long enough to show it. **Raising rail enemy HP is a
> prerequisite for a feature he has already paid for, not a separate nice-to-have.**

**Weapons that exist** (`config.js`): rifle (default), gatling, raygun, flame,
grenade, cheese lure, melee. **The flamethrower is already fully implemented** —
`flameCd: 55`, `flameSpd: 430`, `flameAmmo: 140`, `flameLife: 500`, with a
`pickup_flame` sprite. Dylan asked for "flamethrower on our side"; it's in there.
What's missing is that the *fire rendering* is procedural particles, which is the
real complaint ("animate the fire better when we burn alien rats and when the
napalm drops").

**Pickups that exist:** health, grenades, life, cheese, gatling, raygun, flame,
shotgun (tunnel only).

---

## 1. Enemy roster — proposed additions

Design rule: every new enemy answers *"what does this force the player to do
differently?"* Variety that doesn't change behaviour is just reskinning.

| # | Enemy | Where | HP | Behaviour | Forces the player to… |
|---|---|---|---|---|---|
| E1 | **Rat Sapper** | ground | 2 | charges, detonates on contact | back up / kill at range |
| E2 | **Shield Rat** | ground | 6 | frontal shield, immune from front | flank, jump over, or grenade |
| E3 | **Mortar Rat** | ground, rear | 3 | lobs arcing shells at your position | keep moving, close distance |
| E4 | **Rat Sniper** | elevated | 2 | long aim-tell, hitscan | break line of sight |
| E5 | **Swarm Roaches** | ground | 1 ×6 | fast low cluster | crowd control — flamethrower's moment |
| E6 | **Armoured Walker** | mini-boss | 30 | two-legged rat mech, weak knee joints | aim low, sustained fire |
| E7 | **Rat Jetpack Trooper** | air | 3 | strafes at hero altitude | aim up (W) under pressure |
| E8 | **Gun Barge** | rail | 12 | slow flying platform, 3 gunners | prioritise targets |
| E9 | **Interceptor Saucer** | rail | 4 | fast, dodges, fires in bursts | lead your shots |
| E10 | **Cheese Zealot** | ground | 4 | ignores cheese lure, charges instead | breaks the cheese crutch |

**Also: raise `rail rat` 1 → 2 and `hover`/`ufo` 2 → 4**, and give `nest` a real
sprite. Without this the hit-flash stays invisible.

---

## 2. Weapons and power-ups

### New weapons

| Weapon | Feel | Ammo | Notes |
|---|---|---|---|
| **W1 Shotgun (topside)** | wide short-range cone, 3 pellets | 24 | art already exists from the tunnel |
| **W2 Rocket Launcher** | slow, big splash | 12 | the "new bombs" ask |
| **W3 Lightning Claw** | short-range chain arc, hits 3 | 60 | alien-tech counterpart to the raygun |
| **W4 Twin Gatling** | gatling at 2× fire rate, burns ammo | 300 | Metal Slug "Heavy Machine Gun" beat |

### New throwables

- **T1 Napalm Grenade** — leaves a burning patch (reuses the Skyraider fire-wall code)
- **T2 Sticky Cheese Bomb** — lure + timed detonation, combines two existing systems
- **T3 EMP Charge** — disables saucers/mechs for ~3s

### Power-ups

| Pickup | Effect |
|---|---|
| P1 Armour Vest | absorbs 3 hits, visible on the sprite |
| P2 Rapid Fire | −40% cooldown, 20s |
| P3 Double Damage | 20s |
| P4 Full Heal | hp → max |
| P5 Ammo Crate | refills current weapon |
| P6 Extra Life | already exists, make it rarer and louder |

Suggested rule: weapons drop from Armoured Walkers and crates; power-ups drop on
a timer so a struggling player gets help without farming.

---

## 3. Helicopter upgrade path (Huey → gunship)

Dylan's headline ask. Five tiers, each **visually unmistakable** — the point is
that by tier 5 it doesn't read as a Huey any more.

| Tier | Name | Visual | Gun | Extra |
|---|---|---|---|---|
| 1 | **Huey** | current `huey_doorgun` | single M60 | — |
| 2 | **Huey Hog** | rocket pods on stub wings | M60 + 2-rocket salvo | rockets on K |
| 3 | **Gun Hog** | armour plating, nose turret, twin pods | minigun + rockets | +50% hull |
| 4 | **Cobra Cat** | narrow gunship fuselage, chin turret | minigun + guided rockets | dodge-roll |
| 5 | **Meowhawk** | unrecognisable — quad rotors, side cannons | twin cannons + missile rack | short hover-invuln |

**Progression:** upgrade parts drop from rail mini-bosses. Tier persists across
rail sections within a run and resets on game over. Each tier needs its own
sprite plus a matching pintle/gun anchor — the `gx=277 / hy+107` anchor is
per-sprite and must be re-measured for each, exactly like the v12 door-gunner fix.

---

## 4. Fire and napalm rendering

Current fire is procedural particles. Proposal:

- One **8-frame looping flame sheet** for the flamethrower cone
- One **12-frame ground-fire sheet** for napalm walls and burning patches
- Burning enemies get a **tinted overlay + flame sheet on top** — the v12
  `drawImgHit` tint helper in `assets.js` already does exactly this and can be
  reused with an orange colour and a longer timer
- Napalm drop: add a bright flash frame + shockwave ring before the fire wall

---

## 5. Art job list (Higgsfield)

Every prompt embeds the existing STYLE FORMULA. Ordered by dependency.

1. 10 enemy sprites × 4 poses (idle/walk/attack/hurt) = **40 images**
2. 5 helicopter tiers = **5 images**
3. 4 weapon HUD icons + 4 topside viewmodels = **8 images**
4. 6 power-up pickup icons = **6 images**
5. 2 flame sheets (8f + 12f) = **2 sheets**
6. 1 nest/emplacement sprite = **1 image**

**≈ 62 assets.** At v12's observed hit rate — 3 of 5 audio generations and 2 of 2
image generations needed a retry, and every image faked its transparency — budget
**~1.6 attempts per asset**, alpha-verify every one via PIL extrema, and pixel-diff
every edit against its input to catch silent no-ops.

---

## 6. Suggested build order

1. **HP rebalance + nest sprite** — unblocks the hit-flash already shipped
2. **Fire rendering** — flamethrower already works, this is pure polish on existing code
3. **Enemies E1–E5** — ground variety where the player spends most time
4. **Weapons W1–W2 + throwables** — W1's art already exists
5. **Helicopter tiers 1–3**
6. **Enemies E6–E10, weapons W3–W4, helicopter tiers 4–5**

Steps 1–2 are worth doing on their own: they make things Dylan has *already asked
for and been given* actually visible, before any new content lands.

---

## 7. Open questions for Dylan

1. Should weapon pickups **replace** the current weapon (Metal Slug) or stack in an inventory?
2. Does the helicopter upgrade persist **across runs** or reset each game?
3. Lives is 20 for testing — what's the release number?
4. Do you want the tunnel to get new enemies too, or is that section done?
5. Is the cheese lure staying a core mechanic, or is it a joke that's run its course?
