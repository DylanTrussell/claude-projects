# GATES — the radio ending film

Task: the ending cutscene must match the other films. The first attempt came
back Pixar-plush and off-costume. Same system throughout: Higgsfield, kling3_0
for video, Higgsfield generate_image for the start frame. No other providers.

- [x] G1: The film exists locally, 1920x1080, at least 6 seconds
      CHECK: node -e "const{execSync}=require('child_process');const o=execSync('ffprobe -v error -show_entries stream=width,height -show_entries format=duration -of default=nw=1 /private/tmp/claude-501/-Users-dylantrussell-Claude/c91d7fee-e0d4-412f-a7a5-a44f0b02dfc0/scratchpad/branch/ending.mp4').toString();const w=+/width=(\d+)/.exec(o)[1],h=+/height=(\d+)/.exec(o)[1],d=+/duration=([\d.]+)/.exec(o)[1];if(w===1920&&h===1080&&d>=6)console.log('G1_OK');else throw new Error('got '+w+'x'+h+' '+d+'s')"
      EXPECT: G1_OK
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/dylantrussell/Dev/apocalypse-meow; path=296102fd490f/22 entries; EXPECT=matched; output-sha256=12f841018a5fb79f124a27a4fae08421644bf1e3d94346a382aff5761ae59efb; output-bytes=6

- [x] G2: The film is live on the CDN
      CHECK: node tools/gate_ending_cdn.mjs
      EXPECT: G2_OK
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/dylantrussell/Dev/apocalypse-meow; path=296102fd490f/22 entries; EXPECT=matched; output-sha256=e08b6024499f7063fc7e93eefd5be0951553d7144840d659c4857e5c5c167691; output-bytes=6

- [x] G3: The build references the ending film and plays it on the win
      CHECK: node -e "const fs=require('fs');const c=fs.readFileSync('/Users/dylantrussell/Dev/apocalypse-meow/public/chunks.js','utf8');const m=fs.readFileSync('/Users/dylantrussell/Dev/apocalypse-meow/public/main.js','utf8');if(/ending:\s*(CDN|HF)\s*\+/.test(c)&&/'ending'/.test(m))console.log('G3_OK');else throw new Error('chunks='+/ending:/.test(c)+' main='+/ending/.test(m))"
      EXPECT: G3_OK
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/dylantrussell/Dev/apocalypse-meow; path=296102fd490f/22 entries; EXPECT=matched; output-sha256=0bfc4273b320f03e14e34bfa2b5ef6d79dc9a76d7611258d18443e32b2bd1c80; output-bytes=6

- [x] G4: Both cats are on-costume and photoreal, not cartoon
      Manual, MET. Evidence: six-frame grid off the finished ending.mp4 at
      0.3 / 2.0 / 3.8 / 5.4 / 6.6 / 7.8s, inspected directly.
      Black cat: straw conical hat AND checkered scarf, both present.
      Orange tabby: RED HEADBAND present, ammo belt and dog tags.
      Fur is matted and dirty with film grain, matching the truce and dock
      films. Not the smooth toy shading of the rejected attempt.
      Beat reads: 2.0 both radios light, 3.8 both look down at them, 6.6-7.8
      they turn and hold each other's eyes. Nobody moves.
      EVIDENCE: manual visual inspection of the six-frame grid from ending.mp4; all four criteria (conical hat, checkered scarf, red headband, photoreal weathered fur) confirmed present, and the radio beat reads in order.

- [x] G5: The gate is still green on both branches after wiring
      CHECK: cd /Users/dylantrussell/Dev/apocalypse-meow && bash tools/gate.sh 12
      EXPECT: GATE GREEN
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/dylantrussell/Dev/apocalypse-meow; path=296102fd490f/22 entries; EXPECT=matched; output-sha256=4c2754cff3b87cf968b01754ea67573feeac38695cd5383d28ff2e4d8c52491f; output-bytes=46
