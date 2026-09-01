# Sprite prompt pack 2 — for ChatGPT

The last batch landed clean. Two came back with the transparency checkerboard
baked in as real pixels (the eye nodes and Mittens). I wrote `tools/decheck.py`
to strip it, so it is no longer a problem, but if you want to save a step, add
this line to every prompt:

> Export as a PNG with a genuinely transparent background (alpha channel), not
> a drawn checkerboard pattern.

**House style line to paste into all of them:**

> Pixel art game sprite, thick black outline, high contrast, saturated 90s
> arcade palette, side view, single subject centred, no ground shadow,
> transparent background. Vietnam war setting, cats as soldiers, alien rats as
> the enemy.

---

## TIER 1 — these unblock fixes already on the list

Do these first. Each one closes an open bug in HANDOFF.md.

### 1. Alien scanner ship, scanning
Fixes: "the alien ship must fly in, scan, then green-laser the boat IN GAME so
the film is the payoff." Right now the film happens out of nowhere.

> A menacing alien warship built from wet organic tissue fused to corroded
> brass and iron plating, seen from the side, long and low like a manta ray,
> with a wide glowing green scanner lens on its underbelly projecting a cone of
> pale green light straight down. Ribbed cabling and pulsing veins along the
> hull. Rat-skull motif on the prow.

Also make me **a second version of the exact same ship firing a solid green
laser beam downward instead of the scan cone**, so I can cut between them.

### 2. Molten cheese vat
Fixes: "molten cheese is never established before the payoff."

> A huge riveted industrial vat of glowing molten orange cheese, cracked iron
> sides, thick cheese overflowing and dripping down the outside in long strands,
> steam rising off the surface, alien brass piping feeding into it.

And a small one: **a single cooling wheel of cheese, half melted, slumped on
one side.** That is the last thing on screen in the alt Grimtail ending.

### 3. Charlie on his own surfboard
Standing rule 1: both cats in every scene after the truce. Whiskers is on the
surfboard now and Charlie is nowhere.

> A lean black cat soldier in a pointed straw conical hat and checkered scarf,
> crouched low and riding a surfboard, holding an AK-47 one-handed at his hip,
> tail out for balance, olive fatigues, ammo bandolier across his chest, green
> eyes, snarling. Side view, facing right.

### 4. Both cats landing from a helicopter
Fixes: "helicopter to foot transition is broken; both cats should land."

> Two cat soldiers dropping from a rope in mid air and landing in a crouch side
> by side, one orange tabby in a red headband, one black cat in a straw conical
> hat, both in olive fatigues with rifles, dust kicking up under their boots,
> impact pose. Side view.

### 5. Charlie at the parley
Fixes: Charlie missing from the Grimtail finale.

> A black cat soldier in a straw conical hat standing at parade rest with an
> AK-47 held across his chest, chin up, defiant, wary. Full body, side-on three
> quarter view.

---

## TIER 2 — gun power-ups

We already ship pistol, shotgun, gatling, flamethrower and raygun. These are
the ones that add something the current five do not.

### The Laser Pointer (my favourite)
The single most cat thing you could possibly put in this game. Fires a red dot.
Every rat and alien in range is compelled to stop fighting and chase it. Crowd
control as pure comedy, and it makes the player feel clever rather than strong.

> A battered military-issue laser pointer the size of a pistol, olive drab metal
> body, red lens, stencilled serial number, a small hand-painted mouse silhouette
> on the grip. Held horizontally.

Plus a floor pickup version: **the same device sitting on the ground with a
thin red beam and a bright red dot cast in front of it.**

### The Trap Gun
Pays off the truce film. Charlie says "I know how to set traps." Right now he
never sets one. This gun fires spring-loaded mousetraps that pin a rat in place.

> A stubby wide-barrelled break-action launcher loaded with wooden spring
> mousetraps, brass and dark wood, a rack of traps clipped along the side of
> the barrel.

Pickup version: **a single armed wooden mousetrap with a cube of cheese on the
trigger plate.**

### Tuna Can Launcher
Lobs a can that pops open, pulls every rat in a radius toward it, then goes off.

> A short fat grenade launcher fed from a drum magazine of dented tuna cans,
> olive drab, fish silhouette stencilled on the drum.

---

## TIER 3 — collectable power-ups

Your rule is a reward ladder at three lengths. Here is one item per rung.

**Short rung, seconds:** Milk carton (health).
> A dented cardboard milk carton with a cartoon cow on the side, splashing
> white milk out of the open top.

**Medium rung, a fight:** Catnip Rage. Screen goes green, claws out, double
damage, brief invulnerability.
> A burlap pouch stamped with a green leaf, split open, glowing green catnip
> dust pouring out and swirling upward.

**Long rung, a whole section:** Nine Lives token. A literal extra life.
> An ornate golden coin embossed with a cat's head in profile and nine notches
> around the rim, glowing with a warm halo.

Two more worth having:

**Yarn shield.** A ball of yarn that unspools into an orbiting ring that eats
incoming bullets.
> A tight ball of red yarn with one loose strand curling outward, a faint
> circular motion trail around it.

**Squeaky mouse decoy.** Throw it, enemies shoot at it instead of you.
> A pink rubber squeaky toy mouse with a coiled wire tail and a wide dumb grin.

---

## TIER 4 — alien enemies and ships

The eye node triptych you already sent is perfect and is going in as the
Grimtail shield nodes, dormant, waking, live. More in that vocabulary:

**Rat dropship.** Explains where troopers come from instead of them appearing.
> A squat armoured alien landing craft resting on four insectile legs, rear
> ramp lowered, dim red light spilling out of the interior, brass and diseased
> pink tissue construction, rat skull emblem.

**Alien rat brute.** Slow, heavily shielded, forces the player to flank.
> A hulking mutated rat in riveted brass armour holding a huge curved riot
> shield taller than itself, one glowing yellow eye visible over the rim,
> matted grey fur, scarred snout.

**Drone rat.** Small, fast, dives at you.
> A small rat fused into a spherical brass drone chassis with two whirring
> rotor blades and a single glowing green eye lens, cabling trailing beneath.

**Rat sniper.** Telegraphs with a green laser sight, which ties visually into
the ship that lasers your boat.
> A gaunt rat in a ghillie cloak of hanging vines lying prone behind a long
> alien rifle, a thin green laser line coming off the scope.

**Grimtail himself, out of his ship.** For the alt ending: the rat crawling
through the debris of his own wrecked flagship.
> A large scarred rat in a torn admiral's coat dragging himself forward on his
> elbows through twisted burning wreckage, one leg limp, leaving a smeared
> trail of glowing green blood behind him, reaching ahead of himself.

---

## What I would make first if you only do five

1. Alien scanner ship, both versions
2. Molten cheese vat
3. Charlie on his own surfboard
4. The Laser Pointer, gun plus floor pickup
5. Grimtail crawling through the wreckage

---

## References — what to attach

Two sheets are in `design/refs/`. Drag them into the chat.

**`REF_cats.png`** — attach to anything with Charlie, Whiskers or Mittens in it.
That is Tier 1 items 3, 4 and 5. Say:

> Match the character designs in the attached sheet exactly: same fur colour,
> same hat, same scarf, same eye colour, same outfit. Same art style and outline
> weight.

**`REF_aliens.png`** — attach to all of Tier 4, and to the scanner ship in
Tier 1. Say:

> Match the alien palette in the attached sheet: teal and cyan bio-mechanical
> armour, warm brass and copper hull plating, and sickly green glow for anything
> powered or alive. Same art style and outline weight.

**No reference needed** for Tier 2 and Tier 3 (the guns and the pickups) or the
cheese vat. Those are standalone objects with no established design to break.
The house style line at the top of this file is enough.

### Palette note — I was wrong about this
I said the pink flesh was drift and told you to force it teal. Batch 2 proves
otherwise. The scan ship, the shield nodes and Grimtail himself share one
vocabulary: mottled pink and mauve flesh over corroded brass, with green as the
power colour. The teal troopers are the foot soldiers. That reads as two tiers
of one enemy, which is better than one flat palette, and it is why going in
without references was the right call. Ignore the reference advice above for
anything in Grimtail's fleet. Keep `REF_cats.png` for the cats, since character
consistency is the one thing a prompt genuinely cannot hold on its own, and
even there ChatGPT matched Charlie perfectly from thread context alone.
