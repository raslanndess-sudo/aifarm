/**
 * Fetch 10 ElevenLabs Voice Library voices, add them to workspace,
 * and write src/lib/elevenlabs-voices.json with workspace voice IDs.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=... npx tsx scripts/fetch-elevenlabs-voices.ts
 */

import { writeFileSync, readFileSync } from 'fs';
import path from 'path';

const API = 'https://api.elevenlabs.io/v1';

const TARGET_VOICES = [
  { id: 'mark',      searchName: 'Mark',      fullName: 'Mark - Natural Conversations',           gender: 'M', category: 'Conversational' },
  { id: 'sean',      searchName: 'Sean',       fullName: 'Sean - Expressive and Conversational',   gender: 'M', category: 'Conversational' },
  { id: 'alexandra', searchName: 'Alexandra',  fullName: 'Alexandra - Conversational and Natural', gender: 'F', category: 'Conversational' },
  { id: 'viraj',     searchName: 'Viraj',      fullName: 'Viraj - Bold & Commanding Banking',     gender: 'M', category: 'Professional' },
  { id: 'lauren',    searchName: 'Lauren',     fullName: 'Lauren - Empathetic and Encouraging',    gender: 'F', category: 'Warm' },
  { id: 'ivanna',    searchName: 'Ivanna',     fullName: 'Ivanna - Young, Versatile and Casual',   gender: 'F', category: 'Casual' },
  { id: 'eve',       searchName: 'Eve',        fullName: 'Eve - Authentic, Energetic and Happy',   gender: 'F', category: 'Energetic' },
  { id: 'tripti',    searchName: 'Tripti',     fullName: 'Tripti - Calm and Experienced',          gender: 'F', category: 'Professional' },
  { id: 'adam_m',    searchName: 'Adam',       fullName: 'Adam M - Middle-aged male voice',        gender: 'M', category: 'Conversational' },
  { id: 'joseph',    searchName: 'Joseph',     fullName: 'Joseph - Customer Support Agent',        gender: 'M', category: 'Professional' },
] as const;

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  // Try reading from .env.local
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    const match = envContent.match(/^ELEVENLABS_API_KEY=(.+)$/m);
    if (match) {
      process.env.ELEVENLABS_API_KEY = match[1].trim();
    }
  } catch {}
}

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error('ELEVENLABS_API_KEY not set');
  process.exit(1);
}

const headers = { 'xi-api-key': KEY, 'Content-Type': 'application/json' };

interface SharedVoice {
  public_owner_id: string;
  voice_id: string;
  name: string;
  description?: string;
  category?: string;
}

interface WorkspaceVoice {
  voice_id: string;
  name: string;
}

async function searchSharedVoice(searchTerm: string, fullName: string): Promise<SharedVoice | null> {
  // Try first name search
  const url = `${API}/shared-voices?search=${encodeURIComponent(searchTerm)}&category=professional&page_size=20`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    console.error(`  shared-voices search failed: HTTP ${resp.status}`);
    return null;
  }
  const data = await resp.json() as { voices: SharedVoice[] };

  // Exact match on name (case-insensitive, partial)
  let match = data.voices.find(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  if (match) return match;

  // Try full name search
  const url2 = `${API}/shared-voices?search=${encodeURIComponent(fullName)}&page_size=20`;
  const resp2 = await fetch(url2, { headers });
  if (resp2.ok) {
    const data2 = await resp2.json() as { voices: SharedVoice[] };
    match = data2.voices.find(v =>
      v.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (match) return match;
  }

  // Broader search without category filter
  const url3 = `${API}/shared-voices?search=${encodeURIComponent(searchTerm)}&page_size=40`;
  const resp3 = await fetch(url3, { headers });
  if (resp3.ok) {
    const data3 = await resp3.json() as { voices: SharedVoice[] };
    match = data3.voices.find(v =>
      v.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (match) return match;
  }

  return null;
}

async function addToWorkspace(publicOwnerId: string, voiceId: string, displayName: string): Promise<string | null> {
  const url = `${API}/voices/add/${publicOwnerId}/${voiceId}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ new_name: displayName }),
  });

  if (resp.ok) {
    const data = await resp.json() as { voice_id: string };
    return data.voice_id;
  }

  if (resp.status === 409) {
    // Already added — find in workspace
    console.log(`  409 conflict — already in workspace, fetching ID...`);
    return findInWorkspace(displayName);
  }

  const body = await resp.text().catch(() => '');
  console.error(`  add to workspace failed: HTTP ${resp.status} ${body}`);
  return null;
}

async function findInWorkspace(name: string): Promise<string | null> {
  const resp = await fetch(`${API}/voices`, { headers });
  if (!resp.ok) return null;
  const data = await resp.json() as { voices: WorkspaceVoice[] };
  const match = data.voices.find(v =>
    v.name.toLowerCase().includes(name.toLowerCase())
  );
  return match?.voice_id ?? null;
}

async function main() {
  console.log('=== ElevenLabs Voice Library Fetch ===\n');

  const results: Array<{
    id: string;
    label: string;
    description: string;
    voiceId: string;
    gender: string;
    category: string;
  }> = [];

  const notFound: string[] = [];

  for (const target of TARGET_VOICES) {
    console.log(`[${target.id}] Searching for "${target.fullName}"...`);

    const shared = await searchSharedVoice(target.searchName, target.fullName);
    if (!shared) {
      console.log(`  NOT FOUND in shared library`);
      notFound.push(target.fullName);
      continue;
    }

    console.log(`  Found: "${shared.name}" (${shared.voice_id}) by ${shared.public_owner_id}`);

    const workspaceId = await addToWorkspace(shared.public_owner_id, shared.voice_id, target.searchName);
    if (!workspaceId) {
      console.log(`  FAILED to add to workspace`);
      notFound.push(target.fullName);
      continue;
    }

    console.log(`  Workspace voice ID: ${workspaceId}`);

    results.push({
      id: target.id,
      label: target.searchName,
      description: `${shared.name} · ${target.category.toLowerCase()}`,
      voiceId: workspaceId,
      gender: target.gender,
      category: target.category,
    });
  }

  // Write JSON
  const outPath = path.join(process.cwd(), 'src', 'lib', 'elevenlabs-voices.json');
  const payload = { voices: results };
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
  console.log(`\nWrote ${results.length} voices to ${outPath}`);

  if (notFound.length > 0) {
    console.log(`\n[ASK] Not found (${notFound.length}):`);
    notFound.forEach(n => console.log(`  - ${n}`));
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
