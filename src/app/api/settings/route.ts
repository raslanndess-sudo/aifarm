import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Settings } from '@/lib/types';

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all() as Settings[];

    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { key: string; value: string };

    if (!body.key || typeof body.value !== 'string') {
      return NextResponse.json({ error: 'key and value are required' }, { status: 400 });
    }

    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(body.key, body.value);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
