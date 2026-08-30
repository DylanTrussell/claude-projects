#!/bin/bash
# Assemble ./public in the exact zip layout (§1): server.js + index.html + modules + assets/
set -e
cd "$(dirname "$0")/.."
rm -rf public && mkdir -p public/assets
# v11: boat.js/boss2.js were missing from this list entirely — a third,
# independent reason the PT-boat/Grimtail content was never reachable even
# on top of the RailBase-export bug and main.js never importing them: even a
# correct main.js import would have 404'd in production because these two
# files never made it into the deploy zip in the first place.
cp game/index.html game/main.js game/config.js game/assets.js game/sim.js game/render.js game/strings.js game/fps.js game/rails.js game/boat.js game/boss2.js game/logic.js game/chunks.js public/
cp -r assets/sprites/* public/assets/ 2>/dev/null || true
mkdir -p public/assets/video
cp assets/video/*.mp4 public/assets/video/ 2>/dev/null || true
for f in assets/audio/*.mp3; do cp "$f" public/assets/; done
for f in assets/sheets/*.png; do [ -e "$f" ] && cp "$f" public/assets/; done
# build manifest.json from what actually exists
python3 - <<'EOF'
import json, os, re
imgs, sheets, audio = {}, {}, {}
for f in sorted(os.listdir('public/assets')):
    if f.endswith('.png'):
        if re.search(r'_f\d+_\d+x\d+_g\d+x\d+_fps\d+_(loop|once)\.png$', f):
            sheets[f.split('_f')[0].replace('sheet_','sheet_')] = f
            # id = everything before _f<count>
            sid = re.sub(r'_f\d+.*$', '', f)
            sheets.pop(f.split('_f')[0].replace('sheet_','sheet_'), None)
            sheets[sid] = f
        else:
            imgs[f[:-4]] = f
    elif f.endswith('.mp3'):
        audio[f[:-4]] = f
json.dump({'images': imgs, 'sheets': sheets, 'audio': audio}, open('public/assets/manifest.json','w'), indent=1)
print('manifest:', len(imgs), 'images,', len(sheets), 'sheets,', len(audio), 'audio')
EOF
echo assembled.

# ---- chroma residue gate. The magenta key eats dark pixels and leaves a rim;
# the first cleanup pass ran over assets/sprites/ ONLY and silently missed
# assets/sheets/, where sheet_explosion carried 8,619 rim pixels -- a purple
# corona on every explosion in the game. Fail loudly rather than ship it again.
if command -v python3 >/dev/null 2>&1; then
  if ! python3 tools/dematte.py assets/sprites/*.png assets/sheets/*.png 2>/dev/null | grep -q "^dematte: 0 of"; then
    echo "WARNING: chroma residue found in assets/ -- run: python3 tools/dematte.py --write assets/sprites/*.png assets/sheets/*.png"
  fi
fi

# ---- deaf twin for automated playtesting (Dylan: "mute while you simulate",
# said three times before this existed). public_deaf/ is public/ with the
# audio DESTINATION nulled before any module runs: every AudioContext routes
# through a zero-gain sink and every media element is force-muted on play.
# Agents browse port 8935 (this build) and CANNOT make sound, param or no
# param; Dylan plays port 8934 (public/) with sound intact.
rm -rf public_deaf && cp -R public public_deaf
python3 - <<'PYEOF'
inject = """<script>
(() => {
  for (const N of ['AudioContext', 'webkitAudioContext']) {
    const Real = window[N];
    if (!Real) continue;
    window[N] = function (...a) {
      const ctx = new Real(...a);
      const realDest = ctx.destination;       // capture before override
      const sink = ctx.createGain();
      sink.gain.value = 0;
      sink.connect(realDest);
      Object.defineProperty(ctx, 'destination', { get: () => sink });
      return ctx;
    };
    window[N].prototype = Real.prototype;
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) { this.muted = true; this.volume = 0; return play.apply(this, a); };
  setInterval(() => document.querySelectorAll('audio,video').forEach(m => { m.muted = true; m.volume = 0; }), 500);
})();
</script>"""
p = 'public_deaf/index.html'
s = open(p).read()
import re
s = s.replace('<head>', '<head>\\n' + inject, 1) if '<head>' in s else inject + s
open(p, 'w').write(s)
print('deaf build injected')
PYEOF
