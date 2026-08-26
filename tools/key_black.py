# v13: key a solid-black generation background to real alpha, then crop to
# content. Asking the model for PURE BLACK and keying it here is far more
# reliable than asking for "transparent background" -- models paint a
# checkerboard into an opaque image instead (standing gotcha), and
# remove_background over-eats thin pixel-art details like gun barrels.
import sys, numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
thr = int(sys.argv[3]) if len(sys.argv) > 3 else 42
im = Image.open(src).convert('RGBA')
a = np.array(im).astype(np.int16)
lum = a[:, :, :3].max(axis=2)
# soft ramp so edges feather over a few levels instead of stair-stepping
alpha = np.clip((lum - thr) * (255.0 / max(1, (thr * 2 - thr))), 0, 255)
a[:, :, 3] = alpha.astype(np.int16)
out = Image.fromarray(a.astype(np.uint8), 'RGBA')
bbox = out.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
if bbox:
    out = out.crop(bbox)
out.save(dst)
ex = out.getchannel('A').getextrema()
print('%-22s %s alpha=%s %s' % (dst.split('/')[-1], out.size, ex, 'OK' if ex[0] == 0 else 'STILL OPAQUE'))
