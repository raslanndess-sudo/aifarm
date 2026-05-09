import { NextRequest, NextResponse } from 'next/server';
import { resolveProvider } from '@/lib/providers/resolve-provider';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { mkdirSync, copyFileSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { getDb } from '@/lib/db';

export const maxDuration = 1800; // 30 min — covers 6+ scenes on Higgsfield Unlimited Relax queue (~5-10 min/scene)

const execAsync = promisify(exec);

interface SubmittedJob {
  jobId: string;
  submitTime: number;
}

/**
 * After a scenario pipeline has fired N submitOnly video generations on Higgsfield,
 * this endpoint:
 *   1. Calls provider.collectAndDownloadVideos to fetch all N mp4 files into public/generations/{jobId}/clips/clip_0.mp4
 *   2. Concatenates them with ffmpeg into one final.mp4
 *   3. Returns the public URL of the merged video.
 *
 * For Kling API mode this endpoint just merges the already-finished URLs supplied in `existingVideoUrls`.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      submittedJobs?: SubmittedJob[];
      existingVideoUrls?: string[];
      voiceUrl?: string;
      musicId?: string;
      musicVolume?: number;
      ducking?: boolean;
      musicStart?: number;
      musicDuration?: number;
      captionsAssPath?: string;
      captionsEnabled?: boolean;
    };

    console.log('[finalize] body.voiceUrl:', body.voiceUrl ?? 'NOT PROVIDED');
    if (body.voiceUrl) {
      const vp = path.join(process.cwd(), 'public', body.voiceUrl.replace(/^\//, ''));
      const vExists = existsSync(vp);
      console.log('[finalize] voice file check:', vp, 'exists:', vExists, vExists ? `size: ${require('fs').statSync(vp).size}` : '');
    }

    const { provider, mode: providerMode } = await resolveProvider();

    let videoLocalPaths: string[] = [];
    let videoPublicUrls: string[] = [];
    let collectErrors: string[] = [];

    if (providerMode === 'higgsfield') {
      if (!body.submittedJobs || body.submittedJobs.length === 0) {
        return NextResponse.json(
          { error: 'submittedJobs is required for higgsfield mode' },
          { status: 400 },
        );
      }
      const hf = provider as any;
      await hf.connect();
      try {
        const results = await hf.collectAndDownloadVideos(body.submittedJobs, {
          timeoutMs: 30 * 60_000,
        });
        for (const r of results as Array<{ jobId: string; resultUrl: string | null; error?: string }>) {
          if (r.resultUrl) {
            videoPublicUrls.push(r.resultUrl);
            videoLocalPaths.push(path.join(process.cwd(), 'public', r.resultUrl.replace(/^\//, '')));
          } else if (r.error) {
            collectErrors.push(`${r.jobId}: ${r.error}`);
          }
        }
      } finally {
        await hf.disconnect();
      }
    } else {
      // Kling API mode: existingVideoUrls already finished, just download & merge
      if (!body.existingVideoUrls || body.existingVideoUrls.length === 0) {
        return NextResponse.json(
          { error: 'existingVideoUrls is required for kling API mode' },
          { status: 400 },
        );
      }
      videoPublicUrls = body.existingVideoUrls;
    }

    if (videoPublicUrls.length === 0) {
      return NextResponse.json(
        { error: 'No videos collected', collectErrors },
        { status: 502 },
      );
    }

    // Run ffmpeg concat
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scenario-finalize-'));
    try {
      // For higgsfield: videoLocalPaths is already absolute, use directly.
      // For kling API: download each URL into tmpDir.
      const concatInputs: string[] = [];
      if (providerMode === 'higgsfield' && videoLocalPaths.length > 0) {
        for (let i = 0; i < videoLocalPaths.length; i++) {
          if (existsSync(videoLocalPaths[i])) {
            concatInputs.push(videoLocalPaths[i]);
          }
        }
      } else {
        for (let i = 0; i < videoPublicUrls.length; i++) {
          const url = videoPublicUrls[i];
          let buf: Buffer;
          if (url.startsWith('http')) {
            const r = await fetch(url);
            if (!r.ok) throw new Error(`fetch ${url} failed: HTTP ${r.status}`);
            buf = Buffer.from(await r.arrayBuffer());
          } else {
            // public path like /generations/.../clip_0.mp4
            const localPath = path.join(process.cwd(), 'public', url.replace(/^\//, ''));
            buf = await fs.readFile(localPath);
          }
          const tmpPath = path.join(tmpDir, `clip_${String(i).padStart(3, '0')}.mp4`);
          await fs.writeFile(tmpPath, buf);
          concatInputs.push(tmpPath);
        }
      }

      if (concatInputs.length === 0) {
        return NextResponse.json(
          { error: 'No clips available to merge', collectErrors },
          { status: 502 },
        );
      }

      // Build ffmpeg concat list
      const listPath = path.join(tmpDir, 'concat.txt');
      const listContent = concatInputs
        .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
        .join('\n');
      await fs.writeFile(listPath, listContent);

      // Output to public/generations/scenario_{ts}/final.mp4
      const scenarioId = `scenario_${Date.now()}`;
      const finalDir = path.join(process.cwd(), 'public', 'generations', scenarioId);
      mkdirSync(finalDir, { recursive: true });
      const finalPath = path.join(finalDir, 'final.mp4');

      // -c copy is fast but requires uniform codec. Higgsfield Kling clips are h264/aac so this works;
      // if it fails (codec mismatch) fall back to re-encode.
      try {
        await execAsync(
          `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${finalPath}"`,
          { timeout: 120_000 },
        );
      } catch {
        // Re-encode fallback
        await execAsync(
          `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -preset fast -c:a aac "${finalPath}"`,
          { timeout: 300_000 },
        );
      }

      // Voice merge: overlay voice.mp3 onto final.mp4
      if (body.voiceUrl) {
        const voicePath = path.join(process.cwd(), 'public', body.voiceUrl.replace(/^\//, ''));
        if (existsSync(voicePath)) {
          const tmpFinal = path.join(finalDir, 'final-noaudio.mp4');
          await fs.rename(finalPath, tmpFinal);
          await execAsync(
            `ffmpeg -y -i "${tmpFinal}" -i "${voicePath}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest "${finalPath}"`,
            { timeout: 120_000 },
          );
          console.log('[finalize] voice merged:', body.voiceUrl);
          // Verify audio stream exists
          try {
            const { stdout: probe } = await execAsync(
              `ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "${finalPath}"`,
              { timeout: 10_000 },
            );
            console.log('[finalize] audio stream:', probe.trim() || 'none');
          } catch {
            console.warn('[finalize] ffprobe not available, skipping audio verify');
          }
        } else {
          console.warn('[finalize] voice file missing:', voicePath);
        }
      }

      // Music merge: mix background music into final.mp4
      if (body.musicId) {
        let musicPath: string | null = null;
        try {
          const cacheFile = path.join(process.cwd(), 'data', 'music-library-cache.json');
          const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
          const track = cache.byId[body.musicId];
          if (track && existsSync(track.absPath)) {
            musicPath = track.absPath;
          } else {
            console.warn('[finalize] music id not found or file missing:', body.musicId);
          }
        } catch {
          console.warn('[finalize] music cache not available');
        }

        if (musicPath) {
          const musicVol = Math.max(0, Math.min(1, body.musicVolume ?? 0.3));
          const tmpBeforeMusic = path.join(finalDir, 'final-before-music.mp4');
          await fs.rename(finalPath, tmpBeforeMusic);

          // Trim params: -ss (seek) before -i for fast seek, -t (duration) after -i
          const ssPart = body.musicStart && body.musicStart > 0 ? `-ss ${body.musicStart.toFixed(2)}` : '';
          const tPart = body.musicDuration && body.musicDuration > 0 ? `-t ${body.musicDuration.toFixed(2)}` : '';
          const musicInput = [ssPart, '-stream_loop -1', tPart, `-i "${musicPath}"`].filter(Boolean).join(' ');

          console.log('[finalize] music trim:', { id: body.musicId, start: body.musicStart, duration: body.musicDuration });

          const hasVoice = !!body.voiceUrl;
          let cmd: string;

          if (hasVoice) {
            // finalPath already has voice merged as audio track [0:a].
            // Mix existing audio (voice) with music at reduced volume.
            cmd = `ffmpeg -y -i "${tmpBeforeMusic}" ${musicInput} -filter_complex "[1:a]volume=${musicVol}[m];[0:a][m]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest "${finalPath}"`;
          } else {
            // No voice — replace audio track with music at specified volume.
            cmd = `ffmpeg -y -i "${tmpBeforeMusic}" ${musicInput} -filter_complex "[1:a]volume=${musicVol}[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest "${finalPath}"`;
          }

          try {
            await execAsync(cmd, { timeout: 180_000 });
            console.log('[finalize] music merged:', body.musicId, 'vol:', musicVol, 'hasVoice:', hasVoice);
          } catch (musicErr) {
            console.error('[finalize] music merge failed, keeping version without music:', musicErr);
            // Restore pre-music version
            await fs.rename(tmpBeforeMusic, finalPath);
          }

          // Clean up temp file if still exists
          await fs.rm(tmpBeforeMusic, { force: true }).catch(() => {});
        }
      }

      // Captions burn-in: hardcode subtitles into video pixels
      if (body.captionsAssPath && body.captionsEnabled !== false) {
        const absAssPath = path.join(process.cwd(), 'public', body.captionsAssPath.replace(/^\//, ''));
        if (existsSync(absAssPath)) {
          const tmpBeforeSubs = path.join(finalDir, 'final-before-subs.mp4');
          await fs.rename(finalPath, tmpBeforeSubs);

          // Escape colons and backslashes for ffmpeg subtitles filter path
          const escapedAssPath = absAssPath.replace(/\\/g, '/').replace(/:/g, '\\:');
          const fontsDir = path.join(process.cwd(), 'assets', 'fonts').replace(/\\/g, '/').replace(/:/g, '\\:');

          const subsCmd = existsSync(path.join(process.cwd(), 'assets', 'fonts'))
            ? `ffmpeg -y -i "${tmpBeforeSubs}" -vf "subtitles='${escapedAssPath}':fontsdir='${fontsDir}'" -c:v libx264 -preset fast -crf 22 -c:a copy "${finalPath}"`
            : `ffmpeg -y -i "${tmpBeforeSubs}" -vf "subtitles='${escapedAssPath}'" -c:v libx264 -preset fast -crf 22 -c:a copy "${finalPath}"`;

          try {
            await execAsync(subsCmd, { timeout: 300_000 });
            console.log('[finalize] captions burned in:', body.captionsAssPath);
          } catch (subsErr) {
            console.error('[finalize] captions burn-in failed, continuing without subs:', subsErr);
            // Restore pre-subs version
            if (existsSync(tmpBeforeSubs)) {
              await fs.rename(tmpBeforeSubs, finalPath);
            }
          }

          // Clean up temp
          await fs.rm(tmpBeforeSubs, { force: true }).catch(() => {});
        } else {
          console.warn('[finalize] captions ASS file not found:', absAssPath);
        }
      }

      const stat = await fs.stat(finalPath);

      // Consolidate per-scene clips into the scenario dir, then delete the scattered vid_* dirs.
      // This keeps the per-scene mp4 reachable for UI cards while reclaiming disk from the originals.
      const consolidatedClipUrls: string[] = [];
      let cleanedClips = 0;
      const generationsRoot = path.join(process.cwd(), 'public', 'generations');

      if (providerMode === 'higgsfield' && videoLocalPaths.length > 0) {
        for (let i = 0; i < videoLocalPaths.length; i++) {
          const src = videoLocalPaths[i];
          const dstName = `scene_${String(i + 1).padStart(2, '0')}.mp4`;
          const dst = path.join(finalDir, dstName);
          try {
            await fs.copyFile(src, dst);
            consolidatedClipUrls.push(`/generations/${scenarioId}/${dstName}`);
            // Now delete the original vid_<ts>/ directory
            const jobDir = path.resolve(src, '..', '..');
            if (jobDir.startsWith(generationsRoot) && path.basename(jobDir).startsWith('vid_')) {
              await fs.rm(jobDir, { recursive: true, force: true });
              cleanedClips++;
            }
          } catch (copyErr) {
            // Keep the original path if copy failed
            consolidatedClipUrls.push(videoPublicUrls[i]);
            console.warn('[finalize] clip consolidation failed:', copyErr);
          }
        }
      } else {
        consolidatedClipUrls.push(...videoPublicUrls);
      }

      // Persist a videos row so the result shows up in Library and clients can
      // fetch the public URL without a follow-up POST.
      let dbVideoId: number | null = null;
      try {
        const finalUrl = `/generations/${scenarioId}/final.mp4`;
        const totalSec = Math.max(1, Math.round(stat.size / 200_000)); // crude estimate when ffprobe not available
        const result = getDb()
          .prepare(
            `INSERT INTO videos (title, status, duration, video_url) VALUES (?, ?, ?, ?)`,
          )
          .run(
            `Final Cut (${concatInputs.length} clips)`,
            'complete',
            `${totalSec}s`,
            finalUrl,
          );
        dbVideoId = Number(result.lastInsertRowid);
      } catch (dbErr) {
        console.warn('[finalize] DB insert failed (non-fatal):', dbErr);
      }

      return NextResponse.json({
        success: true,
        scenarioId,
        finalUrl: `/generations/${scenarioId}/final.mp4`,
        clipCount: concatInputs.length,
        sizeBytes: stat.size,
        clipUrls: consolidatedClipUrls,
        cleanedClips,
        dbVideoId,
        collectErrors: collectErrors.length > 0 ? collectErrors : undefined,
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[scenario/finalize] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
