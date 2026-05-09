import { type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { sleep, randomDelay, auditLog } from './browser-helpers';
import { ensureContext, withMutex } from './higgsfield-singleton';

export type VoiceName = 'TALLULAH' | 'ROMAN' | 'MABEL' | 'STERLING' | 'QUINN' | 'LEO';

export async function generateVoiceoverHF(opts: {
  text: string;
  voice: VoiceName;
  outDir: string;
}): Promise<{ outPath: string; sizeBytes: number }> {
  return withMutex('generateVoiceoverHF', () => generateVoiceoverLocked(opts));
}

async function generateVoiceoverLocked({
  text,
  voice,
  outDir,
}: {
  text: string;
  voice: VoiceName;
  outDir: string;
}): Promise<{ outPath: string; sizeBytes: number }> {
  const ctx = await ensureContext();
  const page = ctx.pages()[0] ?? await ctx.newPage();

  // 1. Navigate to Audio tab
  await page.goto('https://higgsfield.ai/ai/audio', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  auditLog('voiceoverHF:loaded', page.url());

  // 2. Ensure Voiceover crank is selected (click it — no-op if already active)
  try {
    const voiceoverLabel = page.locator('text=/^Voiceover$/i').first();
    if (await voiceoverLabel.count() > 0) {
      await voiceoverLabel.click({ timeout: 3000 });
      await sleep(500);
      auditLog('voiceoverHF:crank', 'clicked Voiceover');
    }
  } catch {
    auditLog('voiceoverHF:crank', 'click failed or already selected');
  }

  // 3. Type narration text into textarea / contenteditable
  await typeNarration(page, text);
  auditLog('voiceoverHF:text-typed', `${text.length} chars`);
  await sleep(800);

  // 4. Select voice — click Voice Preset area → modal → click voice tile
  await selectVoice(page, voice);
  auditLog('voiceoverHF:voice-selected', voice);

  // 5. Capture audio baseline before clicking GENERATE
  const audioBaselineCount = await page.locator('audio').count();
  const baselineAudioSrcs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('audio[src], audio source[src]'))
      .map(el => (el as HTMLAudioElement | HTMLSourceElement).src)
      .filter(s => s && !s.startsWith('blob:'));
  });
  const baselineSet = new Set(baselineAudioSrcs);

  // 6. Click GENERATE button
  const generateBtn = page.locator('button').filter({ hasText: /GENERATE/i }).last();
  await generateBtn.waitFor({ state: 'visible', timeout: 10000 });
  const btnText = ((await generateBtn.textContent()) || '').trim();
  auditLog('voiceoverHF:generate-btn', `text="${btnText}"`);
  await generateBtn.click({ delay: 100 });
  auditLog('voiceoverHF:clicked-generate', '');

  // 7. Poll for audio result (up to 5 min)
  const waitStart = Date.now();
  let resultUrl: string | null = null;
  let pollCount = 0;

  while (Date.now() - waitStart < 5 * 60_000) {
    await sleep(5000);
    pollCount++;

    // Strategy A: new <audio> element with a real src (not blob:)
    const audioSrcs = await page.evaluate(() => {
      const srcs: string[] = [];
      for (const audio of Array.from(document.querySelectorAll('audio'))) {
        const a = audio as HTMLAudioElement;
        if (a.src && !a.src.startsWith('blob:')) srcs.push(a.src);
        for (const source of Array.from(a.querySelectorAll('source'))) {
          const s = (source as HTMLSourceElement).src;
          if (s && !s.startsWith('blob:')) srcs.push(s);
        }
      }
      return srcs;
    });
    const newAudioSrcs = audioSrcs.filter(s => !baselineSet.has(s));
    if (newAudioSrcs.length > 0) {
      resultUrl = newAudioSrcs[newAudioSrcs.length - 1];
      auditLog('voiceoverHF:found-audio', `via <audio> src: ${resultUrl?.slice(0, 120)}`);
      break;
    }

    // Strategy B: new <audio> count increased — might have blob src, try download button
    const currentAudioCount = await page.locator('audio').count();
    if (currentAudioCount > audioBaselineCount) {
      // Try finding a download button near the new audio
      const downloadBtn = page.locator('a[download], button').filter({ hasText: /download/i }).first();
      if (await downloadBtn.count() > 0) {
        try {
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 10000 }),
            downloadBtn.click({ delay: 100 }),
          ]);
          mkdirSync(outDir, { recursive: true });
          const outPath = path.join(outDir, 'voice.mp3');
          await download.saveAs(outPath);
          const { statSync } = require('fs');
          const sizeBytes = statSync(outPath).size;
          auditLog('voiceoverHF:saved-via-download', `${outPath} (${sizeBytes} bytes)`);
          return { outPath, sizeBytes };
        } catch (e) {
          auditLog('voiceoverHF:download-btn-failed', String(e).slice(0, 120));
        }
      }
    }

    // Strategy C: look for CDN links (cloudfront/higgs.ai .mp3/.wav/.ogg)
    const cdnLinks = await page.evaluate(() => {
      const links: string[] = [];
      for (const a of Array.from(document.querySelectorAll('a[href]'))) {
        const h = (a as HTMLAnchorElement).href;
        if (/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(h)) links.push(h);
      }
      return links;
    });
    const newCdnLinks = cdnLinks.filter(s => !baselineSet.has(s));
    if (newCdnLinks.length > 0) {
      resultUrl = newCdnLinks[newCdnLinks.length - 1];
      auditLog('voiceoverHF:found-audio', `via CDN link: ${resultUrl?.slice(0, 120)}`);
      break;
    }

    const elapsed = Math.round((Date.now() - waitStart) / 1000);
    auditLog('voiceoverHF:polling', `#${pollCount} audios=${audioSrcs.length} cdnLinks=${cdnLinks.length} elapsed=${elapsed}s`);

    // Reload page every ~90s to trigger fresh API calls
    if (pollCount % 18 === 0 && pollCount > 0) {
      auditLog('voiceoverHF:reload', 'reloading /ai/audio');
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(3000);
      } catch { /* ignore */ }
    }
  }

  if (!resultUrl) {
    throw new Error('voiceoverHF: timeout — no audio result after 5 min');
  }

  // 8. Download audio via Node fetch
  const resp = await fetch(resultUrl);
  if (!resp.ok) throw new Error(`voiceoverHF: fetch ${resultUrl} → HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());

  mkdirSync(outDir, { recursive: true });
  const ext = resultUrl.match(/\.(mp3|wav|ogg|m4a)/i)?.[1] ?? 'mp3';
  const outPath = path.join(outDir, `voice.${ext}`);
  writeFileSync(outPath, buf);
  auditLog('voiceoverHF:saved', `${outPath} (${buf.length} bytes)`);

  return { outPath, sizeBytes: buf.length };
}

/** Type narration text into the Audio tab's text input */
async function typeNarration(page: Page, text: string): Promise<void> {
  // Try textarea first (placeholder "Describe the sound you imagine...")
  const textarea = page.locator('textarea').first();
  if (await textarea.count() > 0) {
    await textarea.click();
    await textarea.fill('');
    await textarea.pressSequentially(text, { delay: randomDelay(15, 40) });
    return;
  }

  // Fallback: contenteditable
  const editable = page.locator('[contenteditable="true"]').first();
  if (await editable.count() > 0) {
    await editable.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await sleep(200);
    await page.keyboard.type(text, { delay: randomDelay(15, 40) });
    return;
  }

  // Last resort: any input with related placeholder
  const input = page.locator('input[placeholder*="Describe"], input[placeholder*="sound"], input[placeholder*="voice"]').first();
  if (await input.count() > 0) {
    await input.click();
    await input.fill(text);
    return;
  }

  throw new Error('voiceoverHF: no text input found on /ai/audio');
}

/** Open voice selector modal and pick a voice by name */
async function selectVoice(page: Page, voice: VoiceName): Promise<void> {
  // Find the voice preset area — look for waveform widget, or any element
  // that looks like the voice selector panel (text contains current voice name or "Voice Preset")
  const voicePresetCandidates = [
    page.locator('text=/Voice Preset/i').first(),
    page.locator('text=/SELECT.*VOICE/i').first(),
    // The black widget with wave visualization — often has the voice name visible
    page.locator('[class*="voice"], [class*="preset"]').first(),
  ];

  let clicked = false;
  for (const loc of voicePresetCandidates) {
    if (await loc.count() > 0) {
      try {
        await loc.click({ timeout: 3000 });
        await sleep(1500);
        clicked = true;
        auditLog('voiceoverHF:voice-modal', 'opened via preset click');
        break;
      } catch {
        continue;
      }
    }
  }

  // Fallback: click any element showing a known voice name (current selection)
  if (!clicked) {
    const knownNames = ['TALLULAH', 'ROMAN', 'MABEL', 'STERLING', 'QUINN', 'LEO', 'NAMIES'];
    for (const name of knownNames) {
      const el = page.locator(`text=${name}`).first();
      if (await el.count() > 0) {
        await el.click({ timeout: 2000 });
        await sleep(1500);
        clicked = true;
        auditLog('voiceoverHF:voice-modal', `opened via current voice name "${name}"`);
        break;
      }
    }
  }

  if (!clicked) {
    auditLog('voiceoverHF:voice-modal-warn', 'could not open voice selector — proceeding with default voice');
    return;
  }

  // Modal should now be open ("SELECT OR ADD A VOICE")
  // Wait for modal content
  await sleep(1000);

  // Click the target voice tile
  const voiceTile = page.locator(`text=${voice}`).first();
  if (await voiceTile.count() > 0) {
    await voiceTile.click({ delay: 100 });
    await sleep(1500);
    auditLog('voiceoverHF:voice-tile-clicked', voice);
  } else {
    auditLog('voiceoverHF:voice-tile-missing', `"${voice}" not found in modal, using current default`);
    // Close modal via Escape
    await page.keyboard.press('Escape');
    await sleep(500);
  }

  // Modal should close automatically after selection — verify, close if still open
  const modalStillOpen = await page.locator('text=/SELECT.*VOICE/i').count();
  if (modalStillOpen > 0) {
    await page.keyboard.press('Escape');
    await sleep(500);
  }
}
