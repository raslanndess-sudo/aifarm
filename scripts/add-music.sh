#!/bin/bash
V=/mnt/e/Users/rasla/Desktop/ai-video-platform/public/generations/merge_1778218555824/final.mp4
M="/mnt/a/Новая папка/600+ Music/Chill normal (MUS)/3DS and Wii (MUS)/Mii Channel Music (MUS).mp3"
TMP=/mnt/e/Users/rasla/Desktop/ai-video-platform/public/generations/merge_1778218555824/final.tmp.mp4

# Mix existing video audio (voice) with music at 25% volume
ffmpeg -y -i "$V" -i "$M" -filter_complex "[1:a]volume=0.25[m];[0:a][m]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest "$TMP" 2>&1 | tail -3
mv "$TMP" "$V"
echo "=== result ==="
ffprobe -i "$V" 2>&1 | grep -E "Duration|Stream"
