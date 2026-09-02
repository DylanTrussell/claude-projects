// Lazy-loaded content that lives OUTSIDE the deploy zip, on Higgsfield's CDN,
// so total game size is no longer bounded by the deploy payload cap. Each
// section fetches its own chunk right before it's needed (see main.js), with
// a short prefetch kicked off in the background as soon as the run starts so
// a normal-paced player rarely sees the loading beat at all.
//
// Adding new content (new tunnel art, a whole new level) means: generate the
// assets, upload each file via media_upload/media_confirm (get back a
// permanent https URL), and add an entry here — NOT into assets/ + assemble.sh.
// That's what keeps the deploy zip from ever hitting a ceiling again.

const CDN = 'https://d2ol7oe51mr4n9.cloudfront.net/user_326nzvdI1NU8OaRgxKtyLxSyQWq/';
// v10.2: direct Higgsfield generation-output CDN (same convention deploy_game's
// own thumbnail/favicon params use — a generate_image/generate_audio result URL
// is already a permanent https link, no separate media_upload round-trip needed).
const HF = 'https://d8j0ntlcm91z4.cloudfront.net/user_326nzvdI1NU8OaRgxKtyLxSyQWq/';

export const CHUNKS = {
  // v13: weapon overlays load at boot with the rest of the base art -- they are
  // needed topside, long before any tunnel chunk is fetched.
  weapons: {
    images: {
      wep_gatling: CDN + '4f16866a-f82c-42e4-91f0-cbc1685ce2d8.png',
      wep_flame: CDN + 'ed9518af-ee49-46c6-94af-71c7e427b09d.png',
      wep_raygun: CDN + '49f24919-1e51-4828-b0ea-5a5dc3ccfc29.png',
    },
  },
  tunnel: {
    images: {
      // v10.2 (Dylan, furious: "the gun is pointing at me like im committing
      // suicide, it turns to the left when i fire it instead of shooting
      // ahead of me... REDO THE ENTIRE TUNNEL SCENE ALMOST FROM SCRATCH"):
      // the v10 pistol/shotgun set stared straight down the muzzle at the
      // camera at idle, and the fire frame swung the barrel hard left on
      // recoil instead of kicking back along its own aim axis. Claimed at
      // the time to be fixed into a proper "3/4-angle FPS grip... barrel
      // visibly aimed forward-and-up."
      // v11 CORRECTION: that v10.2 claim was wrong. Dylan's next playtest
      // ("the tunnel gun is pointing sideways and firing sideways... both
      // guns are currently sideways") turned out to be completely accurate
      // — pulled the actual deployed fps_pistol/fps_pistol_fire pixels and
      // both showed a two-fisted grip with the barrel pointed diagonally at
      // the UPPER-LEFT CORNER, nothing like "forward." (fps_shotgun_fire was
      // correctly centered/forward the whole time — Dylan called this one
      // out as "actually looks good" and it was used as the reference target
      // below.) Regenerated fps_pistol/fps_pistol_fire/fps_shotgun for real
      // this time: pistol is now ONE hand only, shotgun is two hands, both
      // dead-center bottom of frame with the barrel foreshortened straight
      // into the screen (classic Doom/Half-Life HUD gun), verified by
      // actually looking at the generated pixels (not just trusting the
      // prompt) before shipping. Reload frames still untouched (Dylan: "the
      // only good action you have is the reloading").
      // v11.1: even the "verified" v11 set above was still wrong two more
      // ways Dylan caught by eye in the Higgsfield job UI: (1) the pistol
      // was still muzzle-first — a big black bore hole staring at the
      // camera, i.e. still "pointed at our hero." Fixed by flipping it so
      // we see the BACK of the slide (hammer/rear-sight/serrations) with
      // the front sight small and receding — no more bore hole, confirmed
      // by side-by-side pixel diff against the old asset, not just eyeballing
      // a thumbnail. (2) the shotgun's two hands were bunched together right
      // on the pump instead of separated hand-per-role. This one took THREE
      // regeneration attempts because nano_banana kept returning a
      // pixel-near-identical copy of the broken input (confirmed via a
      // resized numpy diff — first two "fixes" changed nothing but the
      // background). What finally worked: generate a plain, non-pixel-art
      // "pose reference" image from a text-only prompt showing correct
      // right-hand-on-stock / left-hand-on-pump separation, use THAT (not
      // the broken original) as the primary reference for a from-scratch
      // regeneration, then one more pass to re-center the framing and match
      // the sleeve color. fps_pistol_fire regenerated to match the pistol's
      // corrected orientation (same muzzle-flash/shell-eject content, just
      // flipped). All three re-verified for real alpha transparency via
      // PIL extrema (not just visual checkerboard) before shipping.
      // v13.2 (Dylan: "is that a human hand in the tunnel? make it a cat
      // hand"): the whole pistol/shotgun viewmodel set had bare HUMAN hands
      // baked into the CDN art while the claws were tabby paws. Re-edited via
      // nano-banana (paws in, guns untouched), keyed to alpha, and shipped in
      // the LOCAL bundle so the base loadAll owns them.
      fps_pistol: './assets/fps_pistol.png',
      fps_pistol_fire: './assets/fps_pistol_fire.png',
      fps_pistol_reload: './assets/fps_pistol_reload.png',
      // v11.2 (Dylan: "you hold the back stock and trigger with your right
      // hand and the pump/grip up front with your left hand... you should
      // barely see the right arm it should be under the wood, there should
      // be no profile of the shotgun of the arm... also it should be cat
      // arms not human"). The v11.1 asset fixed the grip-separation issue
      // but Dylan caught it was still reading as two equally-visible
      // symmetric hands — not the asymmetric Doom-style "one dominant
      // visible hand, trigger hand almost hidden under the stock" look he
      // asked for. Regenerated with gpt_image_2 (per Dylan's explicit "try a
      // diff image generator") using grunt_us.png (bundled local reference,
      // the definitive cat-character design) as the primary reference, with
      // an explicit asymmetric-composition instruction. Landed on the first
      // try this round — real cat forearm/paw with fur+sleeve, one hand
      // clearly gripping the pump, the other tucked mostly behind the wood
      // stock. Background-removed and alpha-extrema verified (0,255) before
      // shipping, not just eyeballed.
      // v12 (Dylan: "the pistol looks good in the tunnel, but the shotgun is a
      // different style and needs to match the pistol, its too real looking so
      // make the style of the cat arms and gun sprite the same, also when you
      // reload the shotgun it looks like 3 arms instead of two so fix that").
      // Both confirmed by pulling the deployed pixels: the v11.2 shotgun was a
      // photoreal painterly render (real wood grain, fabric weave, soft
      // gradients, no outline) next to a flat chunky pixel-art pistol, and the
      // reload frame was a THIRD style again -- thick-ink comic -- with three
      // separate sleeved forearms and three paws visible at once.
      // Regenerated both from fps_pistol as the style reference so all three
      // tunnel weapon frames finally share one look, with an explicit
      // two-arms-only constraint. Checker/white background keyed out by
      // border flood-fill (the generator paints fake transparency: raw output
      // measured alpha extrema (255,255) both times) and re-verified at
      // (0,255). Reload checked against the idle frame by pixel diff (mean
      // 40.2) so it is a real redraw, not the usual silent no-op.
      // v13.2: cat-paw edits, local bundle (see the pistol note above)
      fps_shotgun: './assets/fps_shotgun.png',
      fps_shotgun_fire: './assets/fps_shotgun_fire.png',
      fps_shotgun_reload: './assets/fps_shotgun_reload.png',
      fps_claws: CDN + '6f2f4b7b-4b9e-4cc0-999a-6849db4f1167.png',
      // throat-grab sequence: appear (original) -> mid-rip -> aftermath.
      fps_throat: HF + 'hf_20260720_215610_d78a9dc9-1a50-4fac-b79c-b4a86898f046.png',
      // v11.2 (Dylan: "when you choke the cat, and rip its throat out it
      // switched from vietnam cat to some random black cat, fix that, make
      // it more real looking"). Root cause: the choke/throat-rip sequence's
      // VICTIM design never matched the actual standing tunnel enemy
      // (vc_knife_a.png — orange/tan tabby, conical straw hat with red
      // star). All three frames redrawn (nano_banana_2/flash) using both
      // the original throat frame AND vc_knife_a as dual references so the
      // victim now matches the real enemy design consistently across all
      // three frames, not just internally consistent with each other like
      // before. Frame 2 (mid-rip) needed a second pass — the first attempt
      // silently kept the old dark-green-beret design; the retry with an
      // explicit "you MUST change the hat, it currently has X" instruction
      // fixed it. All three background-removed and alpha-verified (0,255).
      fps_throat_mid: HF + 'hf_20260720_220052_08bceb20-6f45-4042-8371-115c8df00843.png',
      fps_throat_aftermath: HF + 'hf_20260720_215953_26bc8052-42b8-4bdc-b620-8f746d888e31.png',
      fps_knife: CDN + '387524ed-a0be-432d-844a-e1c770c39787.png',
      // knife-cat animation set: was 2 static alternating frames ("flat and
      // sucks" per Dylan) — now a real walk cycle + a second lunge pose + a
      // hit-react frame, see fps.js render() for how these get picked.
      vc_knife_a: CDN + 'e6f27a1f-3c69-40cf-bc7b-7dc67ec08011.png',
      vc_knife_b: CDN + '013a2709-dc29-49cf-b6be-7901123adb9b.png',
      vc_knife_walk1: CDN + 'fb81d2be-430a-4d63-b9dc-89af146c93fe.png',
      vc_knife_walk2: CDN + 'f7fdbd99-fe10-4394-a396-9c7bb5cea9c7.png',
      vc_knife_lunge2: CDN + '0680b303-6e9f-4201-ba47-c11bfe355e8a.png',
      vc_knife_hurt: CDN + '6e864b8e-6ef8-4719-9100-acd7b3475a2e.png',
      // v10.2 (Dylan: "the enemies are barely animated and not high
      // resolution enough... redo the enemies from scratch"): rat_blade was
      // a single 278x300 static pose with no walk/lunge/hurt frames at all
      // — the only enemy in the game with zero animation. Redone at 2K as a
      // full 5-pose set (idle/walk1/walk2/lunge/hurt) the same way the VC
      // knife set works, blade held up and threatening instead of a flat
      // idle stance. See fps.js render() for the state->frame mapping.
      // v13 (Dylan: "the graphics of the tunnel enemies are really bad id like
      // to improve them to stop them from being flat and more 3d"). Redrawn
      // with explicit volumetric shading and rim light, brass/copper armour and
      // steam vents so it reads as a solid object rather than a flat decal.
      // Generated on a PURE BLACK background and keyed to alpha locally
      // (tools/key_black.py) rather than asking for transparency -- the model
      // paints a fake checkerboard when asked directly. Verified (0,255).
      rat_blade: CDN + '0bf2e6b8-c719-44fe-a9e9-7ccdffff699a.png',
      rat_blade_walk1: HF + 'hf_20260719_220426_7ed4591b-db12-489f-99c1-1297fb916b7c.png',
      rat_blade_walk2: HF + 'hf_20260719_220428_710aa544-852d-43c1-b42e-99e725ee05a9.png',
      rat_blade_lunge: HF + 'hf_20260719_220431_567c5c0e-c9a3-458e-aee6-31d5dfa0c8de.png',
      rat_blade_hurt: HF + 'hf_20260719_220433_3d8153ff-c801-474e-a10b-3e4b30c68931.png',
      tile_wall_bamboo: CDN + '8545c105-2ad1-47fb-9cdf-8388fa3aaf22.png',
      tile_wall_blood: CDN + '21a05608-0d33-4af7-a9be-b68c55cc8a5b.png',
      tile_wall_dirt: CDN + '3735ad15-ecbb-4e1d-a357-122417555bb1.png',
      // pickups: health kit replaces the gray dot, shotgun pickup replaces the
      // "two hands holding a gun" viewmodel render with a standalone glowing
      // spinning weapon (spin/pulse done in code, see fps.js render()).
      pickup_health: CDN + '93608007-0684-4257-bde8-e961e0625005.png',
      pickup_shotgun_glow: CDN + 'd5f649a7-ede5-4802-8d8e-ce524198cb2d.png',
    },
    audio: {
      music_tunnel: CDN + '7d2cd4da-437b-456d-bfc5-4cfbe4d3d33d.mp3',
      // v10.2 (Dylan: "the sound effects are terrible and shrill and
      // repetitive and annoying in the tunnel"): sfx_gore/sfx_knife/
      // sfx_screech regenerated with explicit anti-shrill prompting (no
      // high-pitched ringing, not ear-piercing). sfx_reload deliberately
      // NOT touched — Dylan called it out as the one thing that's good.
      sfx_gore: HF + 'hf_20260719_215958_a4fbeb8b-3b07-48d3-9835-0b04ee607359.mp3',
      sfx_knife: HF + 'hf_20260719_215957_0e4effcc-77ca-4ffa-b9cf-128d5a4b87ad.mp3',
      sfx_screech: HF + 'hf_20260719_215959_3057351e-7b84-45b1-8d08-62e657befa3b.mp3',
      sfx_reload: CDN + '963b3f6b-6b4d-4be8-a7f9-8af9f5aae9bf.mp3',
      // new: two tunnel-only pistol-fire variants (confined-space reverb,
      // randomly alternated in fps.js) so mashing the trigger in the tunnel
      // doesn't sound like the exact same outdoor sample on a loop — this
      // does NOT touch the overworld sfx_shot used everywhere else.
      sfx_pistol_tunnel_a: HF + 'hf_20260719_220001_78108d97-cc86-41ca-9216-b99f7502df49.mp3',
      sfx_pistol_tunnel_b: HF + 'hf_20260719_220001_4b8bfa66-e922-47e5-85e9-23bc5b6670d0.mp3',
    },
  },
  // Act III part two: PT boat down the river, then the surf out to the LZ
  // (game/boat.js). No dedicated audio — reuses sfx_shot/sfx_explosion/sfx_meow/
  // sfx_laser and music_ratpatrol/music_gunner, all already in the base manifest.
  ptboat: {
    images: {
      ptboat_vehicle: CDN + '34eae323-916b-4a74-bf92-ae02216062dc.png',
      river_mine: CDN + '87463eb9-b7b1-449a-b071-924bfc3136e0.png',
      rat_gunboat: CDN + '95a965bc-899b-40a0-9f4e-ff2600174efa.png',
      // v9: regenerated with a visible gap between rider and hull + a bigger,
      // more detailed vehicle (Dylan: "the ship is too close to the rat alien").
      alien_raider_boat: CDN + 'c0aa8466-4ebc-4471-9c4b-a41603770657.png',
      rat_diver: CDN + 'ef486ae7-8be5-4f6f-a753-cbd61e80688d.png',
      rat_shark: CDN + 'a6efa7ee-c58d-49fa-b940-e1233ba346b9.png',
      surf_hero: CDN + '454f1556-30fd-4cba-b91c-f6e7921c837d.png',
    },
  },
  // Act IV: the LZ ambush (game/boss2.js) — Chancellor Grimtail's parley-turned-
  // boss-fight. Painterly Jodorowsky's-Dune / Chris Foss style, deliberately
  // distinct from STYLE FORMULA v1 (this is an otherworldly "mothership tier"
  // encounter, not a ground-level pixel-art enemy). No dedicated audio — reuses
  // sfx_laser/sfx_explosion/sfx_shot/sfx_meow + music_invasion, all already
  // in the base manifest.
  boss2: {
    images: {
      chancellor_boss: CDN + '3dc17b4b-38bb-4319-a6c4-b4616d1fe6d9.png',
      // v13.4 (Dylan: "why is the rat floating next to the spaceship? It
      // makes no sense. He should be in it" + "use the one that briefly
      // appears in the water level as the ending one, because it's more
      // epic"). The finale ship is now the Jodorowsky-Dune flagship from the
      // river flyover, with Grimtail visible ON HIS THRONE inside a lit dome.
      // The old golden barrel moved to the mid-game mothership slot
      // (assets/sprites/boss_closed.png), which is the "different level" he
      // asked it moved to.
      chancellor_ship: CDN + 'f4897a61-3e1a-4acf-8af5-96d0fa59680b.png',
      // generated + keyed this session, NOT yet placed in a level — ready for
      // the next two boss/mini-boss slots whenever Dylan picks where they go.
      boss_ship_1: CDN + 'd7154a17-c3c1-4e41-9783-bf4065487cf9.png',
      boss_ship_2: CDN + '7184b6d2-a28b-49b8-b2d3-fd764ca6d6d9.png',
    },
  },
};

// Cutscene videos aren't routed through IMG/SND — a <video> tag streams over
// HTTP on its own, so there's nothing to "load" ahead of time. Pointing src
// at a CDN URL instead of a bundled file is the entire fix; it just needed
// to live somewhere both main.js and (later) other chunks can share.
// v13: topside weapon overlays (Dylan: "when he gets gun upgrades, his actual
// gun needs to change... the same gun shooting different bullets is fucking
// lazy"). The hero sprite has one rifle painted into it, so picking up a
// gatling/flamethrower/raygun changed only the bullets. These are drawn OVER
// the hero at his gun hand, per weapon -- see drawPlayerEnt() in render.js.
// All generated on pure black and keyed locally; alpha verified (0,255).
export const WEAPON_ART = {
  gatling: CDN + '4f16866a-f82c-42e4-91f0-cbc1685ce2d8.png',
  flame: CDN + 'ed9518af-ee49-46c6-94af-71c7e427b09d.png',
  raygun: CDN + '49f24919-1e51-4828-b0ea-5a5dc3ccfc29.png',
};

export const VIDEO_URLS = {
  intro: './assets/video/intro.mp4', // stays bundled: needed at t=0, before any network round trip is acceptable
  // v11.2 (Dylan: "during the cut scene when orange cat is speaking, make
  // his roars that you have in now into cute MEOWS"). The roar is baked
  // into the cutscene's audio track, not a separate SFX cue, so this
  // required an actual audio splice: waveform peak analysis + frame-by-frame
  // mouth-open/closed inspection pinned the vocal-performance window to
  // ~19.9-24.3s (matches the "Charlie, what do you say..." line), a
  // generated "cute meow" clip was gain-boosted+limited to match the
  // surrounding dialogue's loudness (the raw generation was much quieter
  // than the roar it replaces — flat-swapping it in would have read as
  // nearly silent), crossfaded in at both boundaries, and muxed back with
  // the original (untouched) video stream so lip-sync and the rest of the
  // scene's timing are unaffected. Re-verified post-splice via waveform
  // peak scan (not just "the ffmpeg command didn't error").
  // v13.7 THE MEOW FIX, corrected. v13.6 read the loud low-frequency event at
  // 17.5-19.7s as "the roar" and ducked it to 7%. Pulling frames at each
  // subtitle proves that window is the BLACK cat on screen -- it was his
  // performance, the one Dylan calls the good meows, and v13.6 destroyed it
  // ("the black cat had the good meows, and you got rid of those").
  // Speaker map, verified frame by frame: BLACK 13.4-15.2, ORANGE 15.4-17.3,
  // BLACK 17.5-19.7, ORANGE 19.9-24.3 (the big speech), BLACK 24.4-25.3.
  // So: every BLACK window is now passed through untouched (bit-identical --
  // measured rms 2326/14305/8080 in and out), and only the two ORANGE lines
  // are revoiced. Their new performance is cut from the black cat's own
  // approved take at its natural phrase dips, pitch-shifted down to 0.78-0.86
  // for a bigger tomcat and layered as short beats (Dylan: "pick a bunch of
  // the shorter ones and layer them in"). Same mic, same room tone, same
  // film, so it sits natively instead of reading as library SFX.
  // (ElevenLabs SFX was the intent and the generations DO exist in flow
  // LfUQipz6lQHdrWtSvlPw, but its only results-reader takes an array
  // parameter this MCP bridge cannot transmit, and the browser is signed into
  // a different ElevenLabs account -- so the audio cannot be pulled back.)
  truce: CDN + '971e6fde-52d5-43eb-90dd-52525c06462a.mp4',
  // v13.4 story films (Dylan: "everything needs to have a cut scene"). All five
  // generated with ONE model (Seedance 2.0) using frames extracted from the
  // original intro/truce films as identity references, so the whole set reads
  // as one movie. escape: the jungle chase into the A-1 pickup ("Get in").
  // mecha: mothership high-five -> the mecha rat reveal -> the village bike.
  // dock: the road runs out at the river. parley: the flagship descends with
  // Grimtail visible inside. grimdeath: his last breath as the ship falls.
  escape: CDN + '02f30a5b-b701-4770-9b25-1fc613a1918f.mp4',
  mecha: CDN + '8262dab6-e623-4819-9ba3-8a84b2882339.mp4',
  dock: HF + 'hf_20260831_011525_bedb12c0-ff64-4c86-ba47-4082c2d8bf4c.mp4',
  parley: HF + 'hf_20260831_011546_db265157-b126-4641-a4a3-0f7b31fef11e.mp4',
  grimdeath: HF + 'hf_20260831_011600_27fd01fc-3bce-4ffd-990a-d0d87b382fbd.mp4',
  // v13.4: the old victory film was a painterly cartoon that matched nothing
  // (Dylan: "not only was it absolutely god-awful, but it didn't match at
  // all"). Redone in the same photoreal style as every other film: dawn over
  // the paddies, the crashed checkered flagship oozing molten cheese, the
  // tired high-five. The molten cheese thread pays off here on purpose.
  victory: HF + 'hf_20260831_013940_297316a1-49cb-4e7a-bf21-78ba7f6820f8.mp4',
  // v13.5 (Dylan: "There needs to be a cut scene between the boat and the
  // surfboard. You missed that part."): the PT boat takes the torpedo, both
  // cats go flying, Whiskers hauls himself onto a floating board and rides it
  // -- which is exactly the state the Surf section hands the player.
  surfout: HF + 'hf_20260831_031014_9ecfd5e7-cf9e-4ee0-96c3-d930107ceb6b.mp4',
  // v13.11 FORK 2: the other way out of the river. You put the boat over the
  // wreck's fin instead of round it, and you come down in the trees.
  rampout: CDN + 'ed91a2d6-5821-4c5b-92fe-bc675365f70f.mp4',
  // v13.11 THE ENDING: Grimtail is down, the fleet pulls out, and both their
  // radios go off at once. The alien war is over. Theirs is not.
  ending: CDN + '79890436-5d17-45ac-9a12-e3744016dd9b.mp4',
};
