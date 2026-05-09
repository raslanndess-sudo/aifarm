#!/bin/bash
V=/mnt/e/Users/rasla/Desktop/ai-video-platform/public/generations/scenario_1777602274436/final.mp4
A=/mnt/e/Users/rasla/Desktop/ai-video-platform/public/generations/voice_1778186332786/voice.mp3
O=/mnt/e/Users/rasla/Desktop/ai-video-platform/public/generations/MERGE_TEST.mp4
ls -la "$V" "$A"
echo "=== merge ==="
ffmpeg -y -i "$V" -i "$A" -c:v copy -c:a aac -shortest "$O" 2>&1 | tail -3
echo "=== result ==="
ffprobe -i "$O" 2>&1 | grep -E "Duration|Stream"
ls -la "$O"
