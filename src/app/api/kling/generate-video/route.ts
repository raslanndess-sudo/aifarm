import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { resolveProvider } from '@/lib/providers/resolve-provider';
import { submitFalVideo, FAL_MODEL_MAP, ensureFalReachableUrl, type FalVideoProvider } from '@/lib/providers/fal-video';
import { getDb } from '@/lib/db';

export const maxDuration = 300; // 5 min for Vercel

type VideoProvider = 'kling-direct' | FalVideoProvider;

function getDefaultVideoProvider(): VideoProvider {
  try {
    const row = getDb().prepare(`SELECT value FROM settings WHERE key = 'video_provider'`).get() as { value: string } | undefined;
    return (row?.value as VideoProvider) ?? 'kling-direct';
  } catch {
    return 'kling-direct';
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      imageUrl,
      endImageUrl,
      animationPrompt = '',
      modelName = 'kling-v1',
      duration = '5',
      mode = 'std',
      submitOnly = false,
      videoProvider: rawProvider,
      aspectRatio,
    } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    }

    const videoProvider: VideoProvider = rawProvider ?? getDefaultVideoProvider();

    // --- fal.ai branch ---
    if (videoProvider !== 'kling-direct' && videoProvider in FAL_MODEL_MAP) {
      // fal.ai needs a publicly reachable URL. Local paths / localhost URLs / data URIs
      // are uploaded to fal.storage and replaced with the fal CDN URL.
      let resolvedImageUrl: string;
      let resolvedEndImageUrl: string | undefined;
      try {
        resolvedImageUrl = await ensureFalReachableUrl(imageUrl);
        if (endImageUrl) {
          resolvedEndImageUrl = await ensureFalReachableUrl(endImageUrl);
        }
      } catch (uploadErr) {
        const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        console.error('[generate-video] fal upload error:', msg);
        return NextResponse.json({ error: `fal image upload failed: ${msg}` }, { status: 500 });
      }

      try {
        const outDir = path.join(process.cwd(), 'public', 'generations', `vid_fal_${Date.now()}`);
        const { jobId, cost } = await submitFalVideo({
          provider: videoProvider as FalVideoProvider,
          imageUrl: resolvedImageUrl,
          prompt: animationPrompt,
          duration: duration as '5' | '10',
          endImageUrl: resolvedEndImageUrl,
          aspectRatio: aspectRatio as '16:9' | '9:16' | '1:1' | undefined,
          outDir,
        });

        return NextResponse.json({
          success: true,
          taskId: `fal:${videoProvider}:${jobId}`,
          submitTime: Date.now(),
          status: 'submitted',
          provider: videoProvider,
          cost,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[generate-video] fal error:', msg);
        return NextResponse.json({ error: `fal submit failed: ${msg}` }, { status: 500 });
      }
    }

    // --- Existing paths (kling-direct / higgsfield) ---
    const { provider, mode: providerMode } = await resolveProvider();

    let taskId: string;
    let submitTime: number | undefined;
    try {
      if (providerMode === 'higgsfield') {
        // Higgsfield Web flow: pass original URL/path through — provider.downloadToTempPng handles
        // http://, data:, /generations/* and absolute paths. It does NOT accept raw base64.
        // Map Studio's API-style names (kling-v1 etc.) → Higgsfield UI names (kling-2-5-turbo etc.)
        const higgsfieldVideoModel =
          /kling/i.test(modelName) ? 'kling-2-5-turbo' :
          /seedance/i.test(modelName) ? 'seedance-2' :
          'kling-2-5-turbo';

        const hf = provider as any;
        await hf.connect();
        try {
          const job = await (provider as any).generateVideo({
            imageUrl,
            endImageUrl,
            prompt: animationPrompt,
            model: higgsfieldVideoModel,
            duration,
            mode,
            submitOnly,
          });
          taskId = job.jobId;
          submitTime = job.submitTime;
        } finally {
          await hf.disconnect();
        }
      } else {
        // Kling API flow: requires raw base64 (no data URI prefix)
        if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY) {
          return NextResponse.json({ error: 'Kling API keys not configured' }, { status: 500 });
        }

        let imageBase64: string;
        if (imageUrl.startsWith('http')) {
          const imgRes = await fetch(imageUrl);
          if (!imgRes.ok) throw new Error(`Failed to download scene image: ${imgRes.status}`);
          imageBase64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
        } else if (imageUrl.startsWith('data:')) {
          imageBase64 = imageUrl.split(',')[1] ?? imageUrl;
        } else {
          imageBase64 = imageUrl;
        }

        let endImageBase64: string | undefined;
        if (endImageUrl) {
          if (endImageUrl.startsWith('http')) {
            const endRes = await fetch(endImageUrl);
            if (!endRes.ok) throw new Error(`Failed to download end image: ${endRes.status}`);
            endImageBase64 = Buffer.from(await endRes.arrayBuffer()).toString('base64');
          } else if (endImageUrl.startsWith('data:')) {
            endImageBase64 = endImageUrl.split(',')[1] ?? endImageUrl;
          } else {
            endImageBase64 = endImageUrl;
          }
        }

        const job = await provider.generateVideo({
          imageUrl: imageBase64,
          endImageUrl: endImageBase64,
          prompt: animationPrompt,
          model: modelName,
          duration,
          mode,
        });
        taskId = job.jobId;
      }
    } catch (klingErr: unknown) {
      const msg = klingErr instanceof Error ? klingErr.message : String(klingErr);
      console.error('[generate-video] error:', msg);
      return NextResponse.json({ error: `Submit failed: ${msg}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, taskId, submitTime, status: 'submitted' });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generate-video] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
