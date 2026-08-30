# IS IT LIVE? **NO**

Everything below is on this machine only. https://soft-cabin-573.higgsfield.gg/
is still serving v13 and has **none** of the v13.3 work.

Verified, not assumed — fetched the deployed bundle and grepped it:

| feature | live | local |
|---|---|---|
| `drawValkyries` (helicopter squadron) | absent | present |
| `ratmech` (giant / mecha / jetpack rats) | absent | present |
| `heliT2` (helicopter upgrade lifecycle) | absent | present |

That URL only updates through the Higgsfield MCP `deploy_game` tool, game_id
`78f224f4-218e-4c86-afbd-136b3c0abdf4`. Nothing has been pushed to it.

## Where to play the local build

```bash
python3 tools/serve.py 8934 public
```

Then http://127.0.0.1:8934/ — full audio, this is the one to play.
`?tunnel=1` boots straight into the tunnel, `?tunnel=2` into the rat nest.

`public_deaf/` on port 8951 is the same build with the audio graph severed, for
automated playtesting. Agents use that one and cannot make noise from it.

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

`node tools/simtest.mjs` must print `RESULT: VICTORY`. It does, currently at
~320s with 12/12 waves and the tunnel reporting `rescued=true`.

## Playtest round: 10 testers

Seven have reported. What they found that was real, and fixed:

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

Skill-ladder win rate across six seeds, before and after this session:

| | novice | casual | good | expert |
|---|---|---|---|---|
| start of session | 0/6 | 0/6 | 0/6 | 0/6 (unwinnable) |
| after balance work | 0/6 | 1/6 | 2/6 | 3/6 |
| now | 3/6 | 4/6 | 5/6 | 4/6 |
