#!/bin/bash
V=/mnt/e/Users/rasla/Desktop/ai-video-platform/public/generations/merge_1778218555824/final.mp4
A=/mnt/e/Users/rasla/Desktop/ai-video-platform/public/generations/voice_1778216763040/voice.mp3
TMP=/mnt/e/Users/rasla/Desktop/ai-video-platform/public/generations/merge_1778218555824/final.tmp.mp4
# Pad audio with silence so video keeps its full duration
ffmpeg -y -i "$V" -i "$A" -filter_complex "[1:a]apad=pad_dur=20[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest "$TMP" 2>&1 | tail -3
mv "$TMP" "$V"
echo "=== result ==="
ffprobe -i "$V" 2>&1 | grep -E "Duration|Stream"
