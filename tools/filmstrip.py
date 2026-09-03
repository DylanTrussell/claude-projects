#!/usr/bin/env python3
"""Turn a clip into dense contact sheets so it can actually be WATCHED.

A four-frame grid hides exactly the thing that matters in an action shot -- the
motion between frames. This samples at a fixed rate (default 4 fps) and writes
numbered sheets of 8, each frame stamped with its timecode, so an inspector can
follow an arc frame by frame and judge weight, speed and continuity.
"""
import subprocess, sys, os, math
from PIL import Image, ImageDraw, ImageFont

FP = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

def strip(src, outdir, fps=4.0, width=460, per=8):
    os.makedirs(outdir, exist_ok=True)
    dur = float(subprocess.check_output(
        ['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',src]).decode().strip())
    n = int(dur * fps)
    times = [round(i / fps, 3) for i in range(n)]
    frames = []
    for t in times:
        f = os.path.join(outdir, 'f_%06.3f.png' % t)
        subprocess.run(['ffmpeg','-v','error','-ss',str(t),'-i',src,'-frames:v','1',
                        '-vf','scale=%d:-1' % width,'-y',f], check=True)
        frames.append((t, f))
    font = ImageFont.truetype(FP, 20)
    sheets = []
    for s in range(0, len(frames), per):
        chunk = frames[s:s+per]
        im0 = Image.open(chunk[0][1]); cw, ch = im0.size
        cols = 4; rows = math.ceil(len(chunk)/cols)
        W = Image.new('RGB', (cols*cw, rows*(ch+30)), (12,12,16))
        d = ImageDraw.Draw(W)
        for i,(t,f) in enumerate(chunk):
            W.paste(Image.open(f), ((i%cols)*cw, (i//cols)*(ch+30)))
            d.text(((i%cols)*cw+6, (i//cols)*(ch+30)+ch+5), '%.2fs' % t, font=font, fill=(255,220,120))
        out = os.path.join(outdir, 'sheet_%02d.png' % (s//per))
        W.save(out); sheets.append(out)
    for t,f in frames: os.remove(f)
    print('%s: %.2fs, %d frames at %.1f fps -> %d sheet(s)' % (os.path.basename(src), dur, n, fps, len(sheets)))
    for s2 in sheets: print('  ' + s2)
    return sheets

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    fps = 4.0
    for a in sys.argv[1:]:
        if a.startswith('--fps='): fps = float(a.split('=')[1])
    for src in args:
        base = os.path.splitext(src)[0] + '_strip'
        strip(src, base, fps=fps)
