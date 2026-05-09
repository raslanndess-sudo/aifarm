import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createReadStream, existsSync, statSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';

const CACHE_FILE = path.join(process.cwd(), 'data', 'music-library-cache.json');

interface TrackEntry {
  absPath: string;
  sizeBytes: number;
}

interface CacheData {
  byId: Record<string, TrackEntry>;
}

export async function GET(req: NextRequest) {
  const session = (await cookies()).get('session')?.value;
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'missing ?id= parameter' }, { status: 400 });
  }

  // Read cache to resolve id → abs path
  let cache: CacheData;
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    cache = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'music library not scanned yet, call GET /api/music/library first' }, { status: 500 });
  }

  const track = cache.byId[id];
  if (!track) {
    return NextResponse.json({ error: `track not found: ${id}` }, { status: 404 });
  }

  if (!existsSync(track.absPath)) {
    return NextResponse.json({ error: 'file missing on disk' }, { status: 404 });
  }

  const stat = statSync(track.absPath);

  // Convert Node Readable to web ReadableStream
  const nodeStream = createReadStream(track.absPath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new NextResponse(webStream, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': stat.size.toString(),
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  });
}
