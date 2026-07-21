#!/usr/bin/env python3
"""Video -> spritesheet (2d-animation pipeline stages 4-7).
Frames come from seedance videos shot on a SOLID key-color background, so the
per-frame matte is a deterministic chroma key (corner-sampled per frame, same
operator as the static sprites). Union bbox, bottom-center anchor, loop dedup,
near-square grid, metadata in the filename."""
import os, subprocess, sys, glob
import numpy as np
from PIL import Image

WORK = '/home/claude/apocalypse-meow/work'
OUT = '/home/claude/apocalypse-meow/assets/sheets'
os.makedirs(OUT, exist_ok=True)

JOBS = [
    # (video, asset name, action, frame_count(selected), fps, cell target height)
    ('anim_us.mp4', 'sheet_hero_us_run', 'run', 10, 10, 150),
    ('anim_vc.mp4', 'sheet_hero_vc_run', 'run', 10, 10, 150),
    ('anim_alien2.mp4', 'sheet_alien_walk', 'walk', 8, 10, 150),
]

def key_frame(img):
    a = np.asarray(img.convert('RGB')).astype(np.int16)
    pads = np.concatenate([a[:10, :10].reshape(-1, 3), a[:10, -10:].reshape(-1, 3),
                           a[-10:, :10].reshape(-1, 3), a[-10:, -10:].reshape(-1, 3)])
    kc = np.median(pads, axis=0)
    dist = np.sqrt(((a - kc) ** 2).sum(axis=2))
    alpha = np.clip((dist - 75) / 55.0, 0, 1)
    g = a[:, :, 1]; r = a[:, :, 0].copy(); b = a[:, :, 2].copy()
    sp = (alpha < 1)
    # despill toward the dominant non-key channel
    if kc[0] > kc[1] and kc[2] > kc[1]:      # magenta key
        r[sp] = np.minimum(r[sp], g[sp] + 40); b[sp] = np.minimum(b[sp], g[sp] + 40)
    elif kc[1] > kc[0] and kc[1] > kc[2]:    # green key
        g[sp] = np.minimum(g[sp], ((r[sp] + b[sp]) // 2) + 40)
    return np.dstack([r, g, b, (alpha * 255)]).astype(np.uint8), alpha, kc

for vid, name, action, fc, fps, cellH in JOBS:
    vpath = f'{WORK}/raw/{vid}'
    fdir = f'{WORK}/frames_{name}'
    os.makedirs(fdir, exist_ok=True)
    for f in glob.glob(fdir + '/*.png'): os.remove(f)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', vpath, '-vsync', '0', f'{fdir}/%04d.png'], check=True)
    frames = sorted(glob.glob(fdir + '/*.png'))
    total = len(frames)
    idx = np.unique(np.round(np.linspace(1, total, fc)).astype(int))
    sel = [frames[i - 1] for i in idx]
    keyed, boxes = [], []
    for fp in sel:
        arr, alpha, kc = key_frame(Image.open(fp))
        cov = (alpha > 0.5).mean()
        if cov < 0.04 or cov > 0.8:
            print(f'WARN {name} frame {fp}: coverage {cov:.2f} — matte suspect')
        ys, xs = np.where(alpha > 0.5)
        boxes.append((xs.min(), ys.min(), xs.max(), ys.max()))
        keyed.append(arr)
    # union bbox
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    p = 6
    x0 = max(0, x0 - p); y0 = max(0, y0 - p)
    x1 = min(keyed[0].shape[1], x1 + p); y1 = min(keyed[0].shape[0], y1 + p)
    cells = [Image.fromarray(k[y0:y1, x0:x1], 'RGBA') for k in keyed]
    # loop dedup: drop last (identical to first)
    cells = cells[:-1]
    n = len(cells)
    # downscale NEAREST to cell target height
    w0, h0 = cells[0].size
    scale = cellH / h0
    cw, ch = max(1, int(w0 * scale)), cellH
    cells = [c.resize((cw, ch), Image.NEAREST) for c in cells]
    cols = int(np.ceil(np.sqrt(n))); rows = int(np.ceil(n / cols))
    sheet = Image.new('RGBA', (cols * cw, rows * ch), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        sheet.paste(c, ((i % cols) * cw, (i // cols) * ch))
    fname = f'{name}_f{n}_{cw}x{ch}_g{cols}x{rows}_fps{fps}_loop.png'
    # clear any older variant of this sheet
    for old in glob.glob(f'{OUT}/{name}_f*.png'): os.remove(old)
    sheet.save(f'{OUT}/{fname}')
    print(f'{fname}: {total} raw frames -> {n} cells {cw}x{ch}')
