#!/bin/bash
# Cinematic opening v3: armada aerial (voiced "KITTY IN THE TREES!") -> cabin/landing
# -> de-rez ramp -> claw-slash title, with the "Jungle War Cry" chorus as the bed.
# Output: assets/video/intro.mp4
set -e
cd "$(dirname "$0")/.."
F=work/film
V6=work/v6
L="-loglevel error -y"

# 1) scene 1 (new, no aliens): normalize + the yell voice at the pointing moment
# no TTS: the native scream-meow carries the yell; subtitle renders at RUNTIME
ffmpeg $L -i $V6/scene1_new.mp4 -vf "scale=1280:720:flags=lanczos,fps=30" -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $F/s1n.mp4

# 2) scene 2: normalize (subtitle dropped — voices era now)
ffmpeg $L -i $F/scene2_landing.mp4 -vf "scale=1280:720:flags=lanczos,fps=30" -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $F/s2n.mp4

# 3) de-rez ramp on the last 0.8s of scene 2
ffmpeg $L -ss 0    -to 7.2  -i $F/s2n.mp4 -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $F/s2_a.mp4
ffmpeg $L -ss 7.2  -to 7.47 -i $F/s2n.mp4 -vf "pixelize=w=6:h=6"   -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $F/s2_b.mp4
ffmpeg $L -ss 7.47 -to 7.74 -i $F/s2n.mp4 -vf "pixelize=w=16:h=16" -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $F/s2_c.mp4
ffmpeg $L -ss 7.74 -to 8.0  -i $F/s2n.mp4 -vf "pixelize=w=36:h=36" -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $F/s2_d.mp4

# 4) animated claw-slash title
ffmpeg $L -i work/v5/title_claw.mp4 -vf "scale=1280:720:flags=lanczos,fps=30" -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $F/title.mp4

# 5) concat
printf "file 's1n.mp4'\nfile 's2_a.mp4'\nfile 's2_b.mp4'\nfile 's2_c.mp4'\nfile 's2_d.mp4'\nfile 'title.mp4'\n" > $F/list.txt
ffmpeg $L -f concat -safe 0 -i $F/list.txt -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $F/film_noscore.mp4

# 6) "Jungle War Cry" bed: 55.0s->75.5s window so the chorus hits on the armada/yell
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $F/film_noscore.mp4)
ffmpeg $L -i $F/film_noscore.mp4 -ss 55.0 -i music/jungle_war_cry.mp3 \
  -filter_complex "[1:a]volume=0.95,afade=t=in:st=0:d=0.7,afade=t=out:st=$(echo "$DUR-1.4"|bc):d=1.4,atrim=0:$DUR[bed];[0:a]volume=0.85[nat];[nat][bed]amix=inputs=2:duration=first:normalize=0[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 160k -movflags +faststart $F/intro_final.mp4

cp $F/intro_final.mp4 assets/video/intro.mp4
echo "FILM DONE: $DUR s $(du -h assets/video/intro.mp4 | cut -f1)"
