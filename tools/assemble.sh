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
