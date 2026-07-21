# Numeric thresholds (fixed before build; never softened in the iteration that failed them)

- Frame budget: 60 fps fixed-timestep (16.67 ms step); render + update <= 12 ms on a mid phone; measured via ?dev=1 overlay.
- Entity caps: <= 140 live entities; bullet pool 96; particle pool 256; zero allocations inside the frame loop (pools only).
- Draw budget: <= 320 drawImage/shape ops per frame; offscreen entities culled before draw.
- DPR cap 1.5; canvas letterboxed to 1280x720 logical space.
- Netcode: host snapshots 20 Hz (<= 8 KB each), guest inputs 30 Hz; guest interpolation window 100 ms; reconnect resumes from lastSnap <= 5 s old.
- Input feel: coyote 90 ms; jump buffer 120 ms; respawn invulnerability 2000 ms; hero hitbox 0.6x sprite box.
- Payload: total zip <= 25 MiB; code (non-media) <= 2 MB.
- Asset regen budget: 2 attempts per asset, then best-of + code compensation.
- Audio mix: music -18 dBFS (~gain 0.22), SFX -11 dBFS (~gain 0.5), true-peak <= -3 dBFS; UFO hum looped, ducked under explosions.
