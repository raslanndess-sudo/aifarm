import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync, statSync } from 'fs';

const CACHE_FILE = path.join(process.cwd(), 'data', 'music-library-cache.json');
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

interface TrackEntry {
  absPath: string;
  category: string;
  subfolder: string | null;
  name: string;
  sizeBytes: number;
}

interface CacheData {
  scannedAt: string;
  totalTracks: number;
  byId: Record<string, TrackEntry>;
  byCategory: Record<string, string[]>;
}

/** Resolve env path. On Windows-native node use as-is. On WSL convert A:\\ → /mnt/a/ */
function resolveLibraryPath(envPath: string): string {
  // Already a Unix path
  if (envPath.startsWith('/')) return envPath;
  // Windows drive letter
  const match = envPath.match(/^([A-Za-z]):([\\/].*)$/);
  if (!match) return envPath;
  // On Windows-native node, keep as Windows path (Node handles A:\... natively)
  if (process.platform === 'win32') return envPath;
  // On WSL/Linux, translate to /mnt/a/...
  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, '/');
  return `/mnt/${drive}${rest}`;
}

function cleanTrackName(filename: string): string {
  return path.basename(filename, '.mp3')
    .replace(/\s*\(MUS\)\s*$/i, '')
    .trim();
}

function cleanCategoryName(dirName: string): string {
  return dirName
    .replace(/\s*\(MUS\)\s*$/i, '')
    .replace(/\s*music\s*$/i, '')
    .replace(/\s*\([^)]*\)\s*$/i, '')
    .trim();
}

function hashId(absPath: string): string {
  return crypto.createHash('sha1').update(absPath).digest('hex').slice(0, 16);
}

async function scanLibrary(libraryPath: string): Promise<CacheData> {
  const byId: Record<string, TrackEntry> = {};
  const byCategory: Record<string, string[]> = {};

  const categoryDirs = await fs.readdir(libraryPath, { withFileTypes: true });

  for (const catDir of categoryDirs) {
    if (!catDir.isDirectory()) continue;
    const categoryRaw = catDir.name;
    const category = cleanCategoryName(categoryRaw);
    const categoryPath = path.join(libraryPath, categoryRaw);

    if (!byCategory[category]) byCategory[category] = [];

    // Scan files + 1 level of subdirectories
    const entries = await fs.readdir(categoryPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp3')) {
        const absPath = path.join(categoryPath, entry.name);
        const id = hashId(absPath);
        const stat = statSync(absPath);
        byId[id] = {
          absPath,
          category,
          subfolder: null,
          name: cleanTrackName(entry.name),
          sizeBytes: stat.size,
        };
        byCategory[category].push(id);
      } else if (entry.isDirectory()) {
        // Subfolder level
        const subPath = path.join(categoryPath, entry.name);
        try {
          const subEntries = await fs.readdir(subPath, { withFileTypes: true });
          for (const subEntry of subEntries) {
            if (subEntry.isFile() && subEntry.name.toLowerCase().endsWith('.mp3')) {
              const absPath = path.join(subPath, subEntry.name);
              const id = hashId(absPath);
              const stat = statSync(absPath);
              byId[id] = {
                absPath,
                category,
                subfolder: entry.name,
                name: cleanTrackName(subEntry.name),
                sizeBytes: stat.size,
              };
              byCategory[category].push(id);
            }
          }
        } catch {
          // Skip unreadable subdirs
        }
      }
    }
  }

  const data: CacheData = {
    scannedAt: new Date().toISOString(),
    totalTracks: Object.keys(byId).length,
    byId,
    byCategory,
  };

  // Ensure data/ exists
  mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(data));
  console.log(`[music/library] scanned ${data.totalTracks} tracks in ${Object.keys(byCategory).length} categories`);

  return data;
}

async function getCache(libraryPath: string): Promise<CacheData> {
  // Try reading existing cache
  try {
    const stat = statSync(CACHE_FILE);
    const age = Date.now() - stat.mtimeMs;
    if (age < CACHE_MAX_AGE_MS) {
      const raw = await fs.readFile(CACHE_FILE, 'utf8');
      return JSON.parse(raw) as CacheData;
    }
  } catch {
    // No cache or unreadable
  }
  return scanLibrary(libraryPath);
}

export async function GET() {
  const session = (await cookies()).get('session')?.value;
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const envPath = process.env.MUSIC_LIBRARY_PATH;
  if (!envPath) {
    return NextResponse.json({ error: 'MUSIC_LIBRARY_PATH not configured' }, { status: 500 });
  }

  const libraryPath = resolveLibraryPath(envPath);
  if (!existsSync(libraryPath)) {
    return NextResponse.json({ error: `music library not found: ${libraryPath}` }, { status: 500 });
  }

  const cache = await getCache(libraryPath);

  // Build response grouped by category
  const categories = Object.entries(cache.byCategory).map(([name, ids]) => ({
    name,
    trackCount: ids.length,
    tracks: ids.map(id => {
      const t = cache.byId[id];
      return {
        id,
        name: t.name,
        subfolder: t.subfolder,
        durationS: null,
        sizeBytes: t.sizeBytes,
      };
    }),
  }));

  categories.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    categories,
    totalTracks: cache.totalTracks,
  });
}
