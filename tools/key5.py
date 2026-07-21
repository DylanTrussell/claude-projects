#!/usr/bin/env python3
import sys, numpy as np
from PIL import Image
src, dst, maxdim = sys.argv[1], sys.argv[2], int(sys.argv[3])
crop_bottom = len(sys.argv) > 4 and sys.argv[4] == 'nobottompad'
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.int16)
h, w, _ = a.shape
# viewmodels enter from the bottom edge — key color from TOP corners only
pads = np.concatenate([a[:12, :12].reshape(-1, 3), a[:12, -12:].reshape(-1, 3)])
kc = np.median(pads, axis=0)
dist = np.sqrt(((a - kc) ** 2).sum(axis=2))
alpha = np.clip((dist - 70) / 60.0, 0, 1)
spill = (alpha < 1) & (alpha > 0)
g = a[:, :, 1]
r = a[:, :, 0].copy(); b = a[:, :, 2].copy()
r[spill] = np.minimum(r[spill], g[spill] + 40)
b[spill] = np.minimum(b[spill], g[spill] + 40)
out = np.dstack([r, g, b, (alpha * 255).astype(np.int16)]).astype(np.uint8)
img = Image.fromarray(out, 'RGBA')
ys, xs = np.where(alpha > 0.5)
if len(xs) == 0: print(src, 'EMPTY AFTER KEY'); sys.exit(1)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
p = 6
# keep content flush to the bottom edge (arms enter frame there)
img = img.crop((max(0, x0 - p), max(0, y0 - p), min(w, x1 + p), h if y1 > h - 40 else min(h, y1 + p)))
scale = maxdim / max(img.size)
if scale < 1:
    img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.NEAREST)
img.save(dst)
print(f'{dst}: {img.size} coverage={(alpha > 0.5).mean() * 100:.0f}% key={kc.astype(int)}')
