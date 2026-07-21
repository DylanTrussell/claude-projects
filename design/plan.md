# Apocalypse Meow — build plan digest

## Standing asset-generation rule (Dylan, v10)
For any gore, violence, or adult-toned content: try `kling_omni_image` and
`seedream_v4_5` FIRST, compare, use whichever is better — not `nano_banana_2`/
`nano_banana_pro` (Google/US-corp models, more conservative content filters
and reflects worse on the content if flagged). Confirmed in practice: a
throat-rip-aftermath shot that Nano Banana initially refused as NSFW (even
toned down) rendered cleanly on both Kling and Seedream on the first try —
Kling's result was clean and on-model, Seedream's was glitchy/malformed for
this particular chunky-pixel-art gore style, so Kling was used, but re-test
both per-asset rather than assuming one always wins. Non-violent/non-adult
asset generation is unaffected — Nano Banana stays the default for normal
sprites/backgrounds per STYLE FORMULA v1 below.

Experience formula: The player feels like an unstoppable action-cartoon war hero barely holding the line, because the game constantly pours readable waves of enemies and hazards that dissolve into huge explosions under their firepower.

Profile: real-time, continuous 2D side-view run-and-gun; 1 hero per player; vs system (PvE); authored single long level; win/lose; ONLINE CO-OP 1-2 players (tier 2 custom server, host-authoritative relay); session ~10 min; engagement: execution primary, discovery secondary.

Delivery context: desktop + mobile browsers + gamepad. Physical key codes only. Touch: virtual stick + FIRE/JUMP/GRENADE buttons. All player-visible strings in strings.js.

Level (one long level, ~8600 px world, three acts):
- ACT A "River Patrol" (0-3000): teach move/jump/shoot on crates; VC tunnel ambushes + punji spike traps telegraphed by disturbed-earth mounds; US and VC grunts fight each other and the players (crossfire chaos); exam wave A + helicopter strafing run.
- BREATHER "The Tunnel" (3000-3800): dark dip, POW cat rescue -> Gatling gun pickup.
- INVASION EVENT (3800): green flash, bg swap, truce cutscene (skippable); surviving grunts turn ally and fire at aliens.
- ACT B "Invasion" (3800-7000): alien mouse troopers (ray guns), UFOs with tractor beams (pull players up — dodge/shoot), cheese drops -> CHEESE LURE verb (throw cheese, aliens swarm it); exam wave B.
- BOSS (7000-8600): Cheese Mothership, 3 phases (death-ray sweep / tractor beam + trooper drops / gouda cannon volley), core weak point opens when it fires. Victory -> evac helicopter + tally (score, POWs, deaths).

Verbs: run, jump, shoot (hold up to aim up), grenade, auto claw-melee at close range, rescue POW, throw cheese lure. Resistance x verb matrix covered (each enemy answered by >=1 verb; traps answered by observation + jump).

Uncertainty: execution + spawn variance + hidden traps with discoverable tell.

Agency metrics (FROZEN): canvas logical 1280x720; hero height 96 px; run 260 px/s; gravity 1900 px/s^2; jump impulse -640 (apex ~190 px); coyote 90 ms; input buffer 120 ms; hero hitbox 60% of sprite; 1-hit death, 3 lives each, 2 s respawn invulnerability; checkpoints at act starts.

Economy: grenades (start 5, source: pickups/POW; sink: throw), Gatling ammo (source: POW/crates, timed 200 rounds), cheese lures (source: alien drops; sink: throw), lives (fixed 3 + 1up at 5 POWs).

Multiplayer: server.js relay (DurableObject). Host runs the sim, 20 Hz snapshots relayed to guest/spectators; guest sends inputs 30 Hz; server retains lastSnap for reconnect/resume; seats keyed by sessionStorage playerId; ?room= invite link; spectators view-only; host refresh resumes from last checkpoint snapshot.

STYLE FORMULA v1 (byte-identical in every generation prompt):
chunky 1990s arcade pixel art with hand-drawn sprite shading, squat exaggerated cartoon silhouettes outlined in dark charcoal, environment in lush olive jungle greens and muddy browns under smoky haze, hero cats in warm khaki with bright red accents that pop against the foliage, alien mice and their riveted steampunk machines in chrome teal with glowing acid-green lights, pickups and hazards flagged in bright cheese-yellow, sweaty war-movie dusk with orange explosion glow, gritty but comedic, high contrast between game elements and backgrounds, clean readable silhouettes, consistent side-view perspective across all assets

STYLE TOKEN: chunky arcade pixel art, olive jungle palette, chrome-teal alien tech, acid-green glow, charcoal outlines
