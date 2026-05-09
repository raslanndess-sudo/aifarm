#!/bin/bash
V=/mnt/e/Users/rasla/Desktop/ai-video-platform/public/generations/merge_1778217227635/final.mp4
A=/mnt/e/Users/rasla/Desktop/ai-video-platform/public/generations/voice_1778216763040/voice.mp3
ORIG=/mnt/e/Users/rasla/Desktop/ai-video-platform/public/generations/merge_1778217227635/final-orig.mp4

# Restore from saved orig if exists, else current is already the source
if [ -f "$ORIG" ]; then mv "$ORIG" "$V"; fi
# Save backup of current video-only
cp "$V" "$ORIG"

# Pad audio with silence to match video, keep full video length
ffmpeg -y -i "$V" -i "$A" -filter_complex "[1:a]apad[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest "$V.tmp.mp4" 2>&1 | tail -3
mv "$V.tmp.mp4" "$V"
rm "$ORIG"
echo "=== result ==="
ffprobe -i "$V" 2>&1 | grep -E "Duration|Stream"
ls -la "$V"
