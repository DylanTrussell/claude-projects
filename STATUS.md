# IS IT LIVE? **NO**

Everything below is on this machine only. https://soft-cabin-573.higgsfield.gg/
is still serving v13 — none of v13.3 or v13.4 is deployed. That URL only
updates through the Higgsfield MCP `deploy_game` tool, game_id
`78f224f4-218e-4c86-afbd-136b3c0abdf4`.

## Where to play the local build

```bash
python3 tools/serve.py 8934 public
```

Then http://127.0.0.1:8934/ — full audio. `?tunnel=1` boots the tunnel.
`public_deaf/` on port 8951 is the silent twin for agent playtesting.

## v13.6 — the screenshot notes (2026-08-31)

**THE MEOWS — actually fixed this time.** Every previous pass replaced
19.9-24.3s, the subtitle window of the big speech. Spectral analysis says the
roar is at **17.5-19.7s** — the line *before* it ("Well I know how to set
traps") — rms 14,619 with 45% of its energy below 120 Hz, the loudest event in
the film. The window everyone kept editing had already been ducked to rms 2,875,
i.e. inaudible. So the roar was never touched and the replacement was never
heard. Now the roar window is ducked to 7% (sub-120 energy 0.38 -> 0.02) and
every dialogue line carries a meow performance RMS-matched to the film's own
vocal level (~7-8k). Video stream copied, not re-encoded — MD5 identical.
CUT_MEOWS.truce cleared so the game layer no longer doubles it.

**The A-1.** Propeller was drawn at the sprite's bounding-box edge, and that box
still holds the empty margin where the painted blades were erased — so it hung
in clear air ahead of the nose. Measured the art (spinner cone at u 0.003-0.097,
cowl centre v 0.627); blades now root at the cowl face and are drawn as real
tapered blades in the sprite's style, grey with dark outlines and yellow tips,
foreshortening as they turn. **Twin wing guns** are real: gun pods on the wing,
each with its own muzzle flash, and the rounds leave those barrels (one shared
GUN_PORTS table drives step() and render()). **Napalm** was tossed upward and
sailed 485px; released nose-down with a heavier pull it now averages ~53° and
lands ~230px ahead of the nose. **Fire** no longer ends in a vertical line at
each side — the puffs taper and the white-hot bed is a tapered ellipse, not a
fillRect. Rats catch fire from the wall's edge too, and burn with 8 tongues.

**Helicopters.** The "weird rectangles" were the distance haze: a solid
fillRect over each ship's bounding box. Haze is now folded into the silhouette's
own colour, so nothing is painted outside the aircraft. Silhouette rewritten to
an actual UH-1 — long thin boom, swept fin with tail rotor, horizontal
stabiliser, skids, two-blade teetering rotor. They fly a real V (apex leading,
arms stepping back and outward, sizes tapering) plus a second flight crossing
the other way.

**Text, cut roughly in half.** Green hints sat at H-96 — ground level, right
across the cat. They now sit below the action. One hint at a time instead of
three, each shown once per run, shorter dwell. Banners dedupe by key (that was
the doubled "NAPALM DRY"), cap at two, and the 8 floor-pickup banners are muted
— the HUD and the pickup chime already say it.

**Air support moved.** It hung off the x=2650 wave, 350px before the tunnel
mouth, and nothing cancelled the offer — so the re-prompt was still firing when
you climbed back out: the same prompt on both sides of the tunnel, exactly as
reported. It now hangs off the Act II overrun at x=5600 (aliens both sides,
rocket packs overhead), ~1700px clear of the tunnel, and L is the radio while a
strike is pending and cheese otherwise.

**Tunnel guns.** 12% of the shotgun's visible pixels were semi-transparent —
the white-key had eaten interior highlights, so the tunnel showed through the
gun. Filled the enclosed holes on all six viewmodels (1,805 px on the shotgun).

**Supply drops** break open — lid and side panels tumbling off, contents
flaring — and pay out when the break finishes, instead of vanishing.

**Verified.** simtest 12/12 GREEN, ladder: casual/good/expert all complete end
to end (casual now finishes too, up from a finale death last round).

## v13.5 — the second feedback list (2026-08-31)

**Pacing (+50%, except tunnel→truce which Dylan called perfect).** Door gun
44→66s, Skyraider 52→72s, PT boat 54→78s, surf 46→65s, bike chase 2750→4150px,
Grimtail finale ~19→28s (pylons 4hp, boss 105hp). Kill quotas re-measured
against the real ceilings so good shooting still exits ~10s early; rail armour
scaled with the length (lives stay at Dylan's 9). Ladder: good + expert win end
to end, casual dies AT the finale with the CONTINUE checkpoint right there.

**Boat→surf cutscene (was missing).** New Seedance film `surfout`: torpedo
takes the PT boat, Whiskers hauls onto a floating board, Charlie paddles after
him on a fuel drum. Wired between PT-boat completion and the surf ride, with
meows.

**Flagship flyby (water level).** The "shows up on some frames" ghost is now a
deliberate 11s pass: sweeps in from the right, dwells mid-sky, banks off the
left edge, shadow crossing the swells, UFO hum on entry.

**Scuba rats.** PT-boat divers fire real torpedoes (body + bubble wake, and the
vy the old code never integrated, so aimed shots actually track). Surf divers
snap aimed shots when surfaced — duck-dive under them.

**Double-gun finally dead.** The run SHEET has the rifle baked at a different
spot every frame, so the overlay could never cover it while running. With an
upgrade held the hero now uses the static sprite + step bob — one gun line.

**Bike riders restyled.** New sprite: Whiskers drives, Charlie (BLACK fur, per
Dylan — recolored from the generation's blue) mans the rear-facing sidecar gun.

**Tunnel spider-holes.** Ambush rats rise out of woven-slat mounds that open —
no more appearing from nowhere.

**Finale dynamics.** Grimtail's ship hovers, exits off-screen, and makes
strafing passes from both sides; the parley "thing at the bottom" is now the
hero's own aim-up sprite with recoil + muzzle flash.

**Crates.** Shared olive-canopy supply-crate art on both rails, shootable to
pop the power-up; door-gun drops re-timed (8/21/36s of 66) so tier 3 gets
flown; strip banner now says what you actually lost (pods vs turret).

**Engine fixes.** Dev warp no longer resurrects the boss behind you (the
death-loop pin the vehicle tester hit); a cutscene event now freezes the sim
mid-frame-batch instead of leaking up to 250ms of world under the film; a
rejected video play() retries muted instead of hanging the film at frame 0.

**Verified.** simtest 12/12 GREEN ×2, full ladder run, browser probe: world
frozen at x=8400 under the mecha film while it plays.

## v13.4 — Dylan's full playthrough list, all of it

**Cutscenes.** Six new films, all generated with ONE model (Seedance 2.0) using
frames from the original intro/truce footage as identity references so the set
matches: the jungle escape into the A-1 pickup ("Get in!"), the mothership
high-five → mecha rat reveal → village bike, the road-runs-out dock beat, the
flagship descending with Grimtail in his dome, his death as the ship falls, and
a fully redone victory film (the old cartoon one is gone) — dawn, the wreck
oozing molten cheese, the tired high-five, END OF PART ONE / TO BE CONTINUED.
Note: the exact model that made the originals isn't recorded in the repo; the
reference-frame match is the strongest guarantee available, and it holds.

**The A-1 dives.** Guns strafe the ground below mid-height, PULL UP flashes at
the deck, the ground costs a hull pip, and on the deck the PROPELLER kills rats
in a spray of gore. Napalm doubled and lobbed 700px downrange where the rat
stream actually is; napalmed rats catch fire, burn, and CRUMPLE (no more
explosion). The pointed-triangle fire and triangle treeline are gone — real
layered fire, real palm silhouettes. Static baked propeller removed from the
sprite; one drawn prop that actually spins.

**Earned upgrades.** Both aircraft get parachute supply crates you fly into —
Huey: pods → chin turret → armour patches (missed crates re-drop); A-1: napalm
restock / twin wing guns / hull repair. Nothing on a wall clock.

**The ride is a chase.** Mechs debut HERE by cutscene (pulled out of the earlier
waves); rats/jets/mechs pursue from the left; Charlie's sidecar turret tracks
the nearest threat — rear by default. Ride banter meows.

**The ships.** Mid-game mothership = the brass barrel (hatch-open state pours
molten cheese; hitbox on the belly). Finale = the Jodorowsky-Dune checkered
flagship with GRIMTAIL VISIBLE INSIDE — no more floating rat. Parley's 20.8s
banner script cut to a 6s betrayal; the film carries the talk.

**Show, don't tell.** "GET UNDER IT — SHOOT UP (W)", "CORE EXPOSED", "HIT THE
PYLONS" all deleted. The boss flashes on every hit (new standing rule:
everything that takes damage reacts), glows amber while open, drips cheese.

**Water level rebuilt from scratch.** Perspective swell bands, crest foam,
sun-glint shimmer, parallax far bank — no more gradient with dashed lines. Surf
pistol fires from its measured muzzle with body recoil; surf raiders take aimed
shots and the duck-dive is the dodge.

**Tunnel.** Doom-style death: camera drops where you fell, PRESS J to get up in
place (auto 5s) — no teleport, which also kills the green line the teleport
drew across the automap. Ambush cats now climb OUT of the floor over 650ms with
dirt flying. Section checkpoints: dying in a rail/tunnel restarts THAT section.

**Feel.** Real gunshot crack (the "muted" shot was a 4.2kHz hiss tick). Plane
and bike get separate roaring engine loops (eng() had the bike hardwired).
Phantom gun fixed (overlay now covers the baked rifle). Buddy rocks while
firing. Valkyries are individually-drawn silhouette Hueys, not copies.

## Gate

```bash
bash tools/gate.sh 12
```

Non-deterministic — never trust one run. Currently 10/10 and 12/12 on sweeps.
Ladder (6 seeds): novice 3/6 · casual 4/6 · good 6/6 · expert 6/6.

## What landed in v13.3

**Art pipeline.** The chroma key that cuts sprites out of their magenta
background was eating dark pixels and leaving a purple rim. 33 of 43 sprites
carried it — 17,691 pixels on the claws viewmodel alone. That rim is the "hard
line where it was a lazy feather" on the throat-grab forearms and the reason the
paws did not match between weapons. `tools/dematte.py` removes it and is
idempotent, so it can run whenever new art lands.

**The door gun ghost.** Two broken assets, not a drawing bug. `m60_doorgun.png`
had been keyed so hard the gun's body went fully transparent, leaving a hollow
outline you could see the helicopter through. And `huey_doorgun.png` already has
a door gun painted into it, so the articulated M60 slid off a second fixed gun
every time you aimed. Body refilled, baked-in gun painted out, anchor retuned.

**Audio.** Measured every sound by spectral flatness. `sfx_click` was 0.8s of
dead-flat 4.8 kHz hiss with no attack or decay, fired whenever a gun ran dry —
that is the TV static. Fixed, along with `sfx_purr`, `sfx_gore`, `sfx_laser`,
`sfx_raygun`. Only one of the five meows was a real cat; the whole cast is now
pitched off that take.

**Tunnel.** Automap in the corner showing only what you have walked, plus the
path behind you (M toggles it). Mittens' rescue radius went 0.7 → 1.45 cells,
he calls out from five cells away, carries a lamp halo, and the rescue hitches
and flashes like a boss kill.

**Helicopter.** Supply drops at 12s and 26s bolt on rocket pods then a chin
turret; four armour pips absorb hits ahead of the hull and losing pip 2 shoots
the turret back off.

**Two balance bugs that made the game unwinnable, found by measurement.** The
Skyraider killed the reference bot five times a run against the door gun's one;
an ablation pinned it on treeline flak (5.0 → 1.2 deaths with it removed). And
`safeGroundX` respawned you ten pixels from a pit lip with no run-up, so a
low-skill player died in the same hole nine times with no enemy involved. Both
fixed. Neither was visible to `simtest`, which forces `lives = 99`.

**Onboarding, from a real first-time playtester.** The game looked *crashed*
when it auto-paused on blur (the PAUSED overlay was drawn in an animation frame
that a blurred tab never runs). A death hint told players to "sidestep" with no
sidestep key. The tunnel compass said "SHOTGUN" so players followed it instead
of looking for Mittens — the same wall Dylan hit. Running out of lives threw you
back to the opening film; there is a CONTINUE FROM CHECKPOINT now. And the
tunnel lunge had no wind-up at all despite a comment claiming one, so first
contact in the dark was literally undodgeable.

## Tools added

- `tools/playtest.mjs` — the same run as simtest at four skill levels with the
  real life count. `--skill=novice|casual|good|expert [--seed=N]`. This is what
  found both balance bugs.
- `tools/dematte.py` — strips chroma-key residue from sprites; idempotent.
- `tools/serve.py` — now serves by absolute path, so a rebuild no longer kills
  the server out from under a running playtest.

## Gate

```bash
bash tools/gate.sh 12
```

**Do not trust a single `simtest` run.** It is non-deterministic — `sim.js` and
`rails.js` call unseeded `Math.random()` for spawns, jitter and wave
composition — and it sat at **7 passes in 12** for part of this session while
every commit message quoted one green run. Three real softlocks were hiding in
that noise. `tools/gate.sh` runs it N times and fails if any run fails.

Currently **16/16** and **12/12** on repeat sweeps.

## Playtest round: 10 testers

All ten reported. What they found that was real, and fixed:

- **The game looked crashed on window blur** — the PAUSED overlay was drawn in an
  animation frame that a blurred tab never runs. Two testers reported it as a
  crash.
- **You could walk through walls in the tunnel** on a long frame, into a sealed
  secret and across the only corridor joining its two halves. Movement is swept
  now: the old code went through all 48 one-thick walls, the new through none.
- **The compass never advanced.** `done: () => this.script && this.script.done`
  returns *null* when script is null, which is falsy — so the first waypoint
  could never be satisfied. A tester watched it read "GUN, THEN MITTENS · 16"
  *after* rescuing Mittens, counting up as they walked away. Verified: the chain
  now walks grab corner → shotgun → MITTENS → EXIT.
- **The touch build was broken on every current iPhone.** The 2×2 button grid was
  gated at 820px; an iPhone 14/15/16 in landscape is 844. And `.panel` had no
  border-box, so the briefing rendered 706px wide inside a 667px phone with GO GO
  GO! below the fold — a phone player could not start the game.
- **The rotate gate had no escape**, so anyone with rotation lock on was stuck at
  the front door permanently.
- **My chroma cleanup missed `assets/sheets/` entirely** — 8,619 magenta rim
  pixels on the explosion sheet, a purple corona on every blast in the game.
  `assemble.sh` now checks the whole tree.
- **Colour-only signals**: the automap's Mittens and exit pips differed only by
  two colours that are 1.10:1 apart under deuteranopia; the health meter's
  warning tier was invisible for the same reason; Act II's green bolts on a green
  sky killed the reviewer twice unseen.
- **The dodge window was below the reaction floor** at 380ms while the tunnel
  already used 560ms and called it honest.

Skill-ladder win rate. Two caveats on these numbers, so they are not read as
more than they are: the first measurement was a single seed, and the six-seed
runs only started once the harness itself was trustworthy.

| measurement | novice | casual | good | expert |
|---|---|---|---|---|
| first run, seed 7 only | LOSS | LOSS | LOSS | LOSS |
| 6 seeds, mid-session | 0/6 | 1/6 | 2/6 | 3/6 |
| now, sweep 1 | 0/6 | 2/6 | 6/6 | 5/6 |
| now, sweep 2 | 2/6 | 4/6 | 5/6 | 5/6 |
| now, sweep 3 | 1/6 | 3/6 | 5/6 | 5/6 |

**Read these as noisy.** The harness is not deterministic: `sim.js` and
`rails.js` call unseeded `Math.random()` for spawns and jitter, so a fixed seed
does not fix the run — the three "now" rows are the same build measured three
times. Roughly ±2 on any cell. The shape is the signal: skilled players finish
reliably, novices rarely, and the game is no longer unwinnable at every level,
which is where it started.

### The last two testers (a Metal Slug purist and a QA hunt)

- **Every impact system in the engine was switched off for the gun you hold 90%
  of the time.** `hitPauseMs`, `flashMs`, `shakeHit` were gated behind
  `if (big)` inside the explosion branch, and `drawImgHit` — the white flash on a
  hit enemy — was only ever called from `rails.js`. So the vehicle sections had
  better hit feedback than the main mode, and shooting a rat produced no
  reaction on the rat at all until it died. Shot kills now emit their own
  impact beat and enemies flash white on every bullet.
- **The two hardest ground enemies attacked with no visual warning.** The "!"
  tell was drawn for grunts and plain aliens only; `ratbig` (a 330px/s charger)
  and `ratmech` (40 HP, five-rocket salvo) telegraphed through a *sound effect*
  and nothing else — silent, played muted, which is how most people play.
- **The CONTINUE I added this morning was actively harmful.** It replayed the
  opening cinematic (six seconds of dead input), teleported you ~456px backwards,
  and at the tunnel checkpoint dropped you into a pit before you could press a
  key. It re-ran already-finished rail and tunnel sections. Its "snapshot" stored
  live object references, so it restored your *death* state, not the checkpoint.
  Its record guard never fired. And continues were unlimited and free, so the
  game could not be lost.
- **The PAUSED overlay I "fixed" was still missing in the tunnel and the rails** —
  the two sections where the screen keeps animating while every key is ignored.
- **Dylan's "weird blue square"** was fixed in `render.js` and missed in
  `rails.js`, where an unconditional teal debug rect was still drawing under the
  rat line in the door-gun section.

### What they tried hard and could NOT break

Zero uncaught exceptions across ~37 scripted sessions. Conflicting inputs, a 1×1
canvas resize, reload and history navigation, cutscene skip races, and a CDN
blackout (the tunnel degrades to bundled art) all held.
