#!/usr/bin/env python3
"""Master a game SFX one-shot to spec.

Two problems this solves, both found by measuring rather than listening:

1. The generator places the sound anywhere inside the requested duration. Two of
   five first-pass clips had ~90% leading silence (the explosion's transient did
   not arrive until 1.8s of a 2.0s clip), which in-game reads as the sound
   simply not firing. So: trim to the first sample that crosses a floor, with a
   small pre-roll so the transient is not clipped.

2. The shipped v11.2 set measured -12.2 to -32.3 dBFS RMS -- a 20 dB spread --
   with 9 of 17 clips peaking hotter than the -3 dBFS ear-safety limit, and DC
   offsets up to 9% on sfx_meow/sfx_purr (which causes a click on every trigger
   and wastes headroom). So: strip DC, then peak-normalise to a common ceiling.

Peak-normalisation, not loudnorm: these are sub-2s one-shots, and single-pass
EBU R128 on a clip that is mostly silence produces wild results (it left the
set spanning -11.6 to -33.9 RMS). Peak alignment is what game one-shots want --
per-sound mix balance is the engine's job (CFG.gainSfx + the compressor bus).
"""
import sys, os, math, wave, struct, subprocess, tempfile

CEILING_DBFS = -3.0
FLOOR_FRAC   = 0.02   # transient detection threshold, relative to the clip peak
PREROLL_MS   = 12

def decode(path):
    w = tempfile.mktemp(suffix='.wav')
    subprocess.run(['ffmpeg','-v','error','-i',path,'-ac','1','-ar','44100','-f','wav',w,'-y'], check=True)
    wv = wave.open(w); n = wv.getnframes(); sr = wv.getframerate()
    d = list(struct.unpack('<%dh' % n, wv.readframes(n))); wv.close(); os.unlink(w)
    return d, sr

def finish(d, sr, start, dst):
    gain = (10 ** (CEILING_DBFS / 20)) * 32768 / max(abs(x) for x in d)
    d = [max(-32768, min(32767, int(x * gain))) for x in d]
    w = tempfile.mktemp(suffix='.wav')
    out = wave.open(w, 'wb'); out.setnchannels(1); out.setsampwidth(2); out.setframerate(sr)
    out.writeframes(struct.pack('<%dh' % len(d), *d)); out.close()
    subprocess.run(['ffmpeg','-v','error','-i',w,'-c:a','libmp3lame','-q:a','3',dst,'-y'], check=True)
    os.unlink(w)
    npk = max(abs(x) for x in d); nrms = math.sqrt(sum(x*x for x in d)/len(d)) or 1
    return {'dead': False, 'trimmed_ms': int(start/sr*1000), 'sec': len(d)/sr,
            'peak_dbfs': 20*math.log10(npk/32768), 'rms_dbfs': 20*math.log10(nrms/32768)}

def master(src, dst, oneshot_cut=False):
    d, sr = decode(src)
    if not d:
        return None
    dc = sum(d) / len(d)
    d = [x - dc for x in d]
    pk = max(abs(x) for x in d) or 1
    if pk < 400:                      # ~ -38 dBFS: nothing but noise floor
        return {'dead': True, 'peak_dbfs': 20*math.log10(pk/32768)}
    floor = pk * FLOOR_FRAC
    start = next((i for i, x in enumerate(d) if abs(x) >= floor), 0)
    start = max(0, start - int(sr * PREROLL_MS / 1000))
    end = len(d) - next((i for i, x in enumerate(reversed(d)) if abs(x) >= floor), 0)
    d = d[start:end]
    # The generator sometimes returns TWO strikes inside one clip (the retry
    # raygun fired at 20-45% and again at 70-95% of the window). A one-shot the
    # engine retriggers per bullet must contain exactly one strike, so cut at
    # the first sustained gap after the first hit.
    #
    # ONLY for freshly generated clips. Applying this to the existing library
    # was destructive: it cut sfx_screech from 2.02s to 0.39s and sfx_gore from
    # 1.97s to 1.01s, because those sounds legitimately breathe mid-clip. Caught
    # by diffing durations before/after rather than by listening.
    if not oneshot_cut:
        return finish(d, sr, start, dst)
    gap_len = int(sr * 0.15)
    quiet = 0
    for i, x in enumerate(d):
        if abs(x) < floor:
            quiet += 1
            if quiet >= gap_len and i > gap_len:
                d = d[:i - quiet + int(sr * 0.03)]
                break
        else:
            quiet = 0
    if not d:
        return None
    return finish(d, sr, start, dst)

if __name__ == '__main__':
    src_dir, dst_dir = sys.argv[1], sys.argv[2]
    NEW = set(sys.argv[3].split(',')) if len(sys.argv) > 3 else set()
    os.makedirs(dst_dir, exist_ok=True)
    dead = []
    print('%-20s %8s %7s %10s %9s' % ('file','trim ms','sec','peak dBFS','rms dBFS'))
    for f in sorted(os.listdir(src_dir)):
        if not f.endswith('.mp3'): continue
        r = master(os.path.join(src_dir, f), os.path.join(dst_dir, f), f in NEW)
        if r is None: continue
        if r['dead']:
            dead.append((f, r['peak_dbfs'])); print('%-20s  DEAD - peak %.1f dBFS, noise floor only' % (f, r['peak_dbfs']))
            continue
        print('%-20s %8d %7.2f %10.1f %9.1f' % (f, r['trimmed_ms'], r['sec'], r['peak_dbfs'], r['rms_dbfs']))
    if dead:
        print('\nUNUSABLE (regenerate): ' + ', '.join(n for n, _ in dead))
