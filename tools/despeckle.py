#!/usr/bin/env python3
"""Drop stray opaque fragments left behind by a background key."""
import sys, numpy as np
from PIL import Image
from scipy import ndimage

def clean(path, minarea=250):
    im = Image.open(path).convert('RGBA'); a = np.array(im)
    op = a[:,:,3] > 24
    lab, n = ndimage.label(op)
    if n <= 1:
        print('%-24s clean' % path.split('/')[-1]); return
    sizes = ndimage.sum(op, lab, range(1, n+1))
    big = sizes.max()
    kill = [i+1 for i, s in enumerate(sizes) if s < max(minarea, big*0.004)]
    if kill:
        a[np.isin(lab, kill), 3] = 0
        Image.fromarray(a).save(path)
    print('%-24s removed %d fragment(s) of %d' % (path.split('/')[-1], len(kill), n))

for p in sys.argv[1:]:
    clean(p)
