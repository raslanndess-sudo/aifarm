import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

export async function GET() {
  const session = (await cookies()).get('session')?.value;
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = getDb().prepare(`SELECT key, value FROM settings`).all() as Array<{ key: string; value: string }>;
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const session = (await cookies()).get('session')?.value;
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const updates = body as Record<string, string>;

  const db = getDb();
  const upsert = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);

  const applied: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (typeof key !== 'string' || typeof value !== 'string') continue;
    upsert.run(key, value);
    applied.push(key);
  }

  return NextResponse.json({ success: true, applied });
}
