#!/usr/bin/env python3
"""Strip the transparency checkerboard ChatGPT bakes into some PNG exports.

Keying on brightness alone eats white highlights inside the art (Mittens'
whiskers). Flood-filling from the frame edge protects those but cannot reach
pockets enclosed by the art -- between a cat's legs, inside a vat's pipework.

The discriminator that actually works: the checkerboard is TWO alternating
tones. A real highlight inside the art is one flat tone. So every connected
region of near-neutral bright pixels is background only if it genuinely
contains both checker tones.

--beam SIDE additionally lifts a translucent coloured beam (a scan cone, a
laser) off the checkerboard into its own sprite with real alpha, since a beam
wants to pulse and blend in game rather than sit baked into the hull.
"""
import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

def keys_of(a):
    """The two checker tones. They must actually differ: sampling too thin a
    border strip returns two shades of the same white and the key collapses."""
    b = 24
    border = np.vstack([a[:b].reshape(-1,3), a[-b:].reshape(-1,3),
                        a[:,:b].reshape(-1,3), a[:,-b:].reshape(-1,3)])
    cols, cnt = np.unique(border, axis=0, return_counts=True)
    order = np.argsort(-cnt)
    first = cols[order[0]]
    for i in order[1:]:
        if np.abs(cols[i].astype(int) - first.astype(int)).max() >= 4:
            return np.array([first, cols[i]])
    return np.array([first, first])


def period_of(mask):
    """Checker square size, from the run lengths along the middle rows."""
    runs = []
    h, w = mask.shape
    for y in range(h//4, 3*h//4, max(1, h//40)):
        row = mask[y]
        n = 1
        for x in range(1, w):
            if row[x] == row[x-1]:
                n += 1
            else:
                if 3 < n < 80: runs.append(n)
                n = 1
    return int(np.median(runs)) if runs else 8

def checker_mask(a, keys, tol=7):
    mx, mn = a.max(axis=2), a.min(axis=2)
    neutral = (mx - mn) <= 12
    m = [np.abs(a - k[None,None,:]).max(axis=2) <= tol for k in keys]
    cand = (m[0] | m[1]) & neutral

    lab, n = ndimage.label(cand)
    bg = np.zeros(cand.shape, bool)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:,0], lab[:,-1]]))) - {0}
    for i in range(1, n+1):
        sel = lab == i
        area = sel.sum()
        if area < 64:
            continue
        f0 = (m[0] & sel).sum()/area
        f1 = (m[1] & sel).sum()/area
        # both tones present => it is the checkerboard, wherever it sits
        if (f0 > 0.15 and f1 > 0.15) or i in edge and area > 4000:
            bg |= sel
    return bg

def soften(alpha, feather=1.0):
    a = np.array(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(feather)))
    return np.clip((a.astype(np.int16)-118)*3+128, 0, 255).astype(np.uint8)

def strip(path, out, beam=None, beam_hue='green'):
    im = Image.open(path).convert('RGB')
    a = np.array(im).astype(np.int16)
    keys = keys_of(a)
    bg = checker_mask(a, keys)

    rgb = np.array(im)
    alpha = np.where(bg, 0, 255).astype(np.uint8)

    if beam:
        # A translucent beam over the checkerboard is tinted, so it never looked
        # neutral and was never in bg. Find it as bright green-tinted pixels
        # whose region touches the background, then rebuild its alpha from how
        # far each pixel sits below white.
        r, g, b = (rgb[:,:,i].astype(int) for i in range(3))
        if beam_hue == 'red':
            tint = (r - g > 40) & (r - b > 40) & (r > 110)
        else:
            tint = (g - r > 10) & (g - b > 10) & (rgb.mean(axis=2) > 120)
        lab, n = ndimage.label(tint)
        keep = np.zeros(tint.shape, bool)
        if n:
            grown = ndimage.binary_dilation(bg, iterations=2)
            for i in range(1, n+1):
                sel = lab == i
                if sel.sum() > (120 if beam_hue == 'red' else 400) and (sel & grown).any():
                    keep |= sel
        if keep.any():
            lum = rgb[keep].mean(axis=1)
            ba = np.zeros(alpha.shape, np.uint8)
            ba[keep] = np.clip((255 - lum) * 3.4, 0, 240).astype(np.uint8)
            # the checker still alternates through the translucent beam. Squares
            # over grey read thicker than squares over white; the white-backed
            # reading is the true one, so take a local minimum across one full
            # square, then smooth the seams out.
            per = period_of(bg)
            ba = np.array(Image.fromarray(ba).filter(
                ImageFilter.MinFilter(per*2+1 if per*2+1 <= 21 else 21)))
            ba = np.array(Image.fromarray(ba).filter(ImageFilter.GaussianBlur(per*0.7)))
            ba = np.clip(ba.astype(np.int16)*1.9, 0, 240).astype(np.uint8)
            ba[~keep] = 0
            brgb = np.zeros_like(rgb); brgb[:,:] = (255, 70, 70) if beam_hue == 'red' else (120, 255, 130)
            bim = Image.fromarray(np.dstack([brgb, ba]))
            bb = bim.getchannel('A').point(lambda v: 255 if v > 6 else 0).getbbox()
            if bb:
                bim.crop(bb).save(beam)
                print('  beam -> %s %s' % (beam.split('/')[-1], bim.crop(bb).size))
            # the cone's antialiased rim is too pale to read as tinted and
            # survives as a ghost outline. Clear the halo just outside the beam,
            # but only where it is washed out -- never hull pixels.
            halo = ndimage.binary_dilation(keep, iterations=4) & ~keep
            sat = rgb.max(axis=2).astype(int) - rgb.min(axis=2).astype(int)
            alpha[keep] = 0
            alpha[halo & (sat < 45) & (rgb.mean(axis=2) > 140)] = 0

    rgba = np.dstack([rgb, soften(alpha)])
    Image.fromarray(rgba).save(out)
    print('%-18s keys=%s bg=%.1f%%' % (out.split('/')[-1],
          [tuple(int(v) for v in k) for k in keys], 100*(rgba[:,:,3] < 16).mean()))

if __name__ == '__main__':
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    dobeam = '--beam' in sys.argv
    hue = 'red' if '--red' in sys.argv else 'green' 
    for p in args:
        base = p.rsplit('.',1)[0]
        strip(p, base + '_rgba.png', base + '_beam.png' if dobeam else None, hue)
