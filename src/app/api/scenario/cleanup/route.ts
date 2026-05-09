import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { promises as fs } from 'fs';
import path from 'path';

// Wipes stale img_* and vid_* job directories from public/generations/.
// Triggered by Studio.tsx after the user clicks Stop — clears partial
// intermediate artifacts so the next run starts clean. Final scenario_xxx
// directories (containing final.mp4) are preserved — those are listed in
// Library and represent committed user output.
//
// Safety: a 30-second mtime guard skips any directory created very recently —
// if a parallel session somehow has a fresh job in flight, we won't yank it.

const RECENT_THRESHOLD_MS = 30_000;

export async function POST() {
  const cookieStore = await cookies();
  if (!cookieStore.get('session')?.value) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const generationsRoot = path.join(process.cwd(), 'public', 'generations');
  const auditPath = path.join(process.cwd(), 'data', 'higgsfield-audit.log');

  const log = async (event: string, detail = '') => {
    try {
      await fs.appendFile(
        auditPath,
        `[${new Date().toISOString()}] ${event}${detail ? ` — ${detail}` : ''}\n`,
      );
    } catch { /* non-critical */ }
  };

  await log('cleanup:start');

  let entries: string[] = [];
  try {
    entries = await fs.readdir(generationsRoot);
  } catch {
    return NextResponse.json({ deleted: 0, kept: [], skippedRecent: 0, note: 'generations dir empty or missing' });
  }

  const removed: string[] = [];
  const kept: string[] = [];
  let skippedRecent = 0;
  const now = Date.now();

  await Promise.all(
    entries.map(async (name) => {
      const full = path.join(generationsRoot, name);

      // Preserve scenario_* — those are committed final outputs in Library
      if (name.startsWith('scenario_')) {
        kept.push(name);
        return;
      }

      // Only target intermediate artifact dirs
      if (!name.startsWith('img_') && !name.startsWith('vid_')) {
        kept.push(name);
        return;
      }

      try {
        const stat = await fs.stat(full);
        if (now - stat.mtimeMs < RECENT_THRESHOLD_MS) {
          skippedRecent++;
          return;
        }
        await fs.rm(full, { recursive: true, force: true });
        removed.push(name);
        await log('cleanup:removed', name);
      } catch (err) {
        await log('cleanup:error', `${name}: ${(err as Error).message}`);
      }
    }),
  );

  await log('cleanup:done', `deleted=${removed.length} kept=${kept.length} skippedRecent=${skippedRecent}`);

  return NextResponse.json({
    deleted: removed.length,
    removed,
    kept,
    skippedRecent,
  });
}
