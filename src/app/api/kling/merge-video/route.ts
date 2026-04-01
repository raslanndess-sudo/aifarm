import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  const { videoUrls } = await request.json() as { videoUrls: string[] };

  if (!videoUrls || videoUrls.length === 0) {
    return NextResponse.json({ error: 'videoUrls is required' }, { status: 400 });
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kling-merge-'));
  try {
    // Download all videos
    const localPaths: string[] = [];
    for (let i = 0; i < videoUrls.length; i++) {
      const res = await fetch(videoUrls[i]);
      if (!res.ok) throw new Error(`Failed to download video ${i + 1}: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const filePath = path.join(tmpDir, `scene_${String(i).padStart(3, '0')}.mp4`);
      await fs.writeFile(filePath, buffer);
      localPaths.push(filePath);
    }

    // Create ffmpeg concat list
    const listPath = path.join(tmpDir, 'concat.txt');
    const listContent = localPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    await fs.writeFile(listPath, listContent);

    // Output path
    const outPath = path.join(tmpDir, 'final.mp4');

    // Merge with ffmpeg
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outPath}"`,
      { timeout: 120_000 }
    );

    // Read result and return as base64
    const merged = await fs.readFile(outPath);
    const base64 = merged.toString('base64');

    return NextResponse.json({
      success: true,
      videoBase64: base64,
      mimeType: 'video/mp4',
      sceneCount: videoUrls.length,
    });

  } finally {
    // Cleanup temp dir
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
