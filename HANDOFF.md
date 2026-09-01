# HANDOFF — pick up here

**IS IT LIVE?** Yes. v13.9 is deployed and verified at
https://dylantrussell.github.io/claude-projects/ (GitHub Pages, `gh-pages`
branch, root). Redeploy = `bash tools/assemble.sh`, then replace the contents
of `gh-pages` with `public/` and push. Pages is already wired; no reconfig.

`soft-cabin-573.higgsfield.gg` is STALE (v13) — the Higgsfield `deploy_game`
tool is not in the current toolset. Dylan authorised GitHub as the deploy
target on 2026-09-01.

## The schema degradation is GONE

Last session's Higgsfield/ElevenLabs tools came through with empty input
schemas, so any array/object argument was flattened to a string. This session
the schemas are intact and `creative_show_flow_results` worked first try. If it
ever recurs, it is session-local — re-test one call before assuming a broken
connector.

## FIRST THING — DONE in v13.8

Dylan's real ElevenLabs meows (flow `LfUQipz6lQHdrWtSvlPw`) are in the film.
Both orange lines are the generated tomcat now; the pitched-down black-cat
stand-in from v13.7 is gone. See STATUS.md v13.8 for the levels and the method.

### The truce film speaker map — VERIFIED, do not get this wrong again

Frame-checked at every subtitle. v13.6 destroyed the black cat's good take by
mistaking it for a roar; v13.7 restored it.

| Window | Speaker | Status |
|---|---|---|
| 13.4–15.2 "What the hell is that?" | BLACK | keep original, untouched |
| 15.4–17.3 "…rat problem." | ORANGE | revoice |
| 17.5–19.7 "I know how to set traps." | BLACK | **keep — this is the good take** |
| 19.9–24.3 the big speech | ORANGE | revoice |
| 24.4–25.3 "I'm in." | BLACK | keep original, untouched |

Current film: `chunks.js` → `truce: CDN + '4e57b4fe-...mp4'`. Black windows are
bit-identical to the original (rms 2326 / 14305 / 8080 in and out). Only the
two orange windows are ducked (to 0.13) and re-voiced.
`CUT_MEOWS.truce` is `[]` on purpose — the film carries the performance now.

## STANDING RULES (also in memory)

1. **Both cats in every scene after the truce.** It is written as a two-player
   game. Charlie (black, conical hat) must be present alongside Whiskers.
   Currently MISSING in: the surfboard section, the Grimtail parley finale,
   and the helicopter→foot landing.
2. **Every cutscene must be caused by something the player sees in gameplay.**
   No films out of nowhere.
3. Everything that takes damage visibly reacts to every hit.
4. Show, don't tell. No instruction banners.
5. No em dashes in anything a player reads.

## OUTSTANDING — Dylan's open notes

**Needs media generation (blocked last session):**
- Alt Grimtail ending film: ship blown apart, the rat crawling through debris
  leaving a green blood trail toward a half-melted wheel of cheese. Dylan wants
  to SEE it before deciding whether it goes in the game.
- Sprites — a prompt pack was sent to Dylan for ChatGPT
  (`SPRITE_PROMPTS.md`): Charlie on the floating fuel tank, Charlie for the
  ship fight, Whiskers on the surfboard with the machine gun, Mittens tied to
  a chair. If generation works now, make them directly instead.

**Gameplay / design:**
- **Duel "…HE'S OUT TOO" is fake.** `sim.js` `triggerInvasion` sets
  `g.invT = 2600` then force-sets `g.noFire = 1` on a timer — the player never
  actually runs dry. Dylan: make it legitimately run out of ammo, or jam the
  gun. Diagnosed, NOT yet fixed.
- Boat→surf causality: the alien ship must fly in, scan, then green-laser the
  boat IN GAME so the film is the payoff. Also the water flyby currently pops
  in oddly and you can drive the boat straight INTO the ship.
- Helicopter→foot transition is broken; both cats should land. Recommend a
  cutscene rather than a hard cut.
- Molten cheese is never established before the payoff.
- Bike gap jump reads as a glitch — driving off the edge should look cool.
- Mittens: tied to a chair, visibly tortured, properly rescued.

**Transitions audit — remaining items** (agent report, items already done are
marked in STATUS.md v13.7): film in/out fades DONE, audio ducking DONE, HUD
freeze DONE, event-drain DONE. Still open: the 1.4s stale jungle frame before
the victory film; the mid-run loader showing the boot title screen with a
frozen 0% bar; Skyraider/Surf ending with a hard cut while only the door gun
got the white-out; door gun resuming the sim while the screen is still white;
the tunnel exit white-out having the HUD drawn on top of it; `audio.music()`
restarting a track that is already playing.

## Verification commands

```bash
bash tools/gate.sh 12                 # simtest, must be GATE GREEN
node tools/playtest.mjs --skill=good  # full run, logs events with x positions
python3 tools/serve.py 8934 public    # play build (full audio)
```
Port 8951 serves `public_deaf/` — the silent twin for agent playtesting.
Last state: gate 10/10 green; casual, good and expert all complete end to end.
