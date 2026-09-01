#!/usr/bin/env python3
"""Strip chroma-key residue from sprite PNGs.

The art pipeline keys sprites off a magenta background. When the subject
contains dark pixels the key eats them too, and it always leaves a magenta rim
one to three pixels wide around the silhouette. In game that rim reads as a
purple halo and a hard cut edge -- Dylan on the throat-grab viewmodel: "at the
ends of my forearms you can see a hard line where it was a lazy feather", and on
the door gun: "a weird ghost image on it" (that one was keyed so badly the gun's
whole body went transparent).

Two classes of residue, handled differently:

  OUTSIDE rim -- magenta reachable from the image border through
                 {transparent, magenta}. It is background. Delete it.
  INSIDE hole -- magenta or transparent enclosed by real art. It is subject the
                 key ate. Refill it by nearest-real-pixel BFS, which follows the
                 local structure instead of streaking along one axis.

DO NOT RUN THIS ON GRIMTAIL'S FLEET. As of v13.9 the flagship, the scanner
ship and the shield nodes are deliberately mottled PINK AND MAGENTA flesh over
brass -- that is the faction's colour, not chroma residue. This tool cannot
tell the difference and will eat the hull. Those files are listed in SKIP below
and are excluded from both the report and --write.

Idempotent: a clean sprite comes back byte-identical, so it is safe to re-run
over the whole tree.

  python3 tools/dematte.py assets/sprites/*.png        # report only
  python3 tools/dematte.py --write assets/sprites/*.png
"""
import os
import sys
from collections import deque

try:
    from PIL import Image
except ImportError:
    sys.exit("dematte: needs Pillow (pip3 install Pillow)")


def is_magenta(c):
    """Chroma residue: red and blue both present, green suppressed between."""
    r, g, b, a = c
    return a > 24 and r > 45 and b > 45 and g < min(r, b) * 0.62


def clean(path, write=False, fill=False):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    px = im.load()

    magenta = set()
    clear = set()
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c[3] < 24:
                clear.add((x, y))
            elif is_magenta(c):
                magenta.add((x, y))
    if not magenta:
        return 0, 0

    # flood from the border through background-ish pixels: what it reaches is
    # outside the subject, what it cannot reach is a hole punched in the art.
    outside = set()
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            p = (x, y)
            if p not in outside and (p in clear or p in magenta):
                outside.add(p); q.append(p)
    for y in range(h):
        for x in (0, w - 1):
            p = (x, y)
            if p not in outside and (p in clear or p in magenta):
                outside.add(p); q.append(p)
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if (0 <= n[0] < w and 0 <= n[1] < h and n not in outside
                    and (n in clear or n in magenta)):
                outside.add(n); q.append(n)

    rim = magenta & outside
    holes = (magenta | clear) - outside
    out = im.copy()
    o = out.load()
    for p in rim:
        o[p] = (0, 0, 0, 0)

    if holes and fill:
        # multi-source BFS outward from every real pixel touching a hole
        col = {}
        q = deque()
        for (x, y) in holes:
            if (x, y) in col:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + dx, y + dy)
                if (0 <= n[0] < w and 0 <= n[1] < h and n not in holes
                        and n not in rim and px[n][3] > 200):
                    col[(x, y)] = px[n]; q.append((x, y)); break
        while q:
            x, y = q.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + dx, y + dy)
                if n in holes and n not in col:
                    col[n] = col[(x, y)]; q.append(n)
        for p in holes:
            o[p] = col.get(p, (0, 0, 0, 0))

    if write:
        out.save(path)
    return len(rim), (len(holes) if fill else 0)


# v13.9: Grimtail's fleet is pink-and-magenta flesh BY DESIGN. The chroma key
# cannot tell that from residue and would strip the hull, so these never pass
# through it. Add any new pink-fleet art here.
SKIP = {
    'alien_scanship', 'alien_scanship_hurt', 'alien_scanship_wreck',
    'grim_node_dormant', 'grim_node_waking', 'grim_node_live',
    'grim_trophy_wall', 'grimtail_crawl',
}


def main(argv):
    write = '--write' in argv
    fill = '--fill' in argv
    files = [a for a in argv if not a.startswith('--')]
    skipped = [f for f in files if os.path.basename(f)[:-4] in SKIP]
    files = [f for f in files if os.path.basename(f)[:-4] not in SKIP]
    if skipped:
        print(f"  (skipping {len(skipped)} pink-fleet sprite(s) -- their magenta is the art)")
    if not files:
        sys.exit(__doc__)
    total = 0
    for f in files:
        try:
            rim, holes = clean(f, write, fill)
        except Exception as e:                                  # noqa: BLE001
            print(f"  !! {f}: {e}")
            continue
        if rim or holes:
            total += 1
            print(f"  {'fixed' if write else 'would fix'} {f}: "
                  f"rim {rim}px, refilled {holes}px")
    print(f"dematte: {total} of {len(files)} sprites had chroma residue"
          + ("" if write else "  (re-run with --write to apply)"))


if __name__ == '__main__':
    main(sys.argv[1:])
