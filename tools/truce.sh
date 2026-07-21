#!/bin/bash
# Truce cutscene v3: same films, VOICED dialogue instead of subtitles.
# Clip C slowed 1.2x to fit the lines; original meows ducked under the voices.
set -e
cd "$(dirname "$0")/.."
V=work/v5
V6=work/v6
L="-loglevel error -y"

ffmpeg $L -i $V/clipA_brawl.mp4     -vf "scale=1280:720:flags=lanczos,fps=30" -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $V6/tA.mp4
ffmpeg $L -i $V/clipB_rats.mp4      -vf "scale=1280:720:flags=lanczos,fps=30" -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $V6/tB.mp4

# clip C: slow video 1.2x (dramatic push-in), duck native meows, lay in the voices
ffmpeg $L -i $V/clipC_dialogue.mp4 -filter_complex "[0:v]setpts=1.2*PTS,scale=1280:720:flags=lanczos,fps=30[v];[0:a]atempo=0.8333,volume=0.5[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $V6/tC_base.mp4
# hilarious cute meow dialogue over the top; words render as RUNTIME subtitles
ffmpeg $L -i $V6/tC_base.mp4 -i $V6/voc/meow_vc1.wav -i $V6/voc/meow_us1.wav -i $V6/voc/meow_vc2.wav -i $V6/voc/meow_us2.wav -i $V6/voc/meow_vc3.wav \
  -filter_complex "\
[1:a]adelay=400|400,volume=1.5[a1];\
[2:a]adelay=2450|2450,volume=1.6[a2];\
[3:a]adelay=4550|4550,volume=1.5[a3];\
[4:a]adelay=6900|6900,volume=1.6[a4];\
[5:a]adelay=11450|11450,volume=1.6[a5];\
[0:a][a1][a2][a3][a4][a5]amix=inputs=6:duration=first:normalize=0[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -ar 48000 -ac 2 $V6/tC.mp4

ffmpeg $L -i $V/clipD_handshake.mp4 -vf "scale=1280:720:flags=lanczos,fps=30" -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $V6/tD.mp4
ffmpeg $L -ss 0    -to 4.2  -i $V6/tD.mp4 -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $V6/tD_a.mp4
ffmpeg $L -ss 4.2  -to 4.47 -i $V6/tD.mp4 -vf "pixelize=w=6:h=6"   -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $V6/tD_b.mp4
ffmpeg $L -ss 4.47 -to 4.74 -i $V6/tD.mp4 -vf "pixelize=w=16:h=16" -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $V6/tD_c.mp4
ffmpeg $L -ss 4.74 -to 5.0  -i $V6/tD.mp4 -vf "pixelize=w=36:h=36" -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 $V6/tD_d.mp4

printf "file 'tA.mp4'\nfile 'tB.mp4'\nfile 'tC.mp4'\nfile 'tD_a.mp4'\nfile 'tD_b.mp4'\nfile 'tD_c.mp4'\nfile 'tD_d.mp4'\n" > $V6/tlist.txt
ffmpeg $L -f concat -safe 0 -i $V6/tlist.txt -c:v libx264 -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart $V6/truce_v3.mp4

mkdir -p assets/video/archive
[ -f assets/video/truce.mp4 ] && cp assets/video/truce.mp4 assets/video/archive/truce_subtitled_v2.mp4
cp $V6/truce_v3.mp4 assets/video/truce.mp4
echo "TRUCE DONE: $(ffprobe -v error -show_entries format=duration -of csv=p=0 assets/video/truce.mp4)s $(du -h assets/video/truce.mp4 | cut -f1)"
