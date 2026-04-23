import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Device } from '@/lib/types';

export async function GET() {
  try {
    const db = getDb();
    const devices = db.prepare('SELECT * FROM devices ORDER BY name').all() as Device[];
    return NextResponse.json(devices);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { name, platform, account } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!platform || typeof platform !== 'string') {
      return NextResponse.json({ error: 'platform is required' }, { status: 400 });
    }

    const db = getDb();
    const result = db.prepare(
      `INSERT INTO devices (name, platform, account, status, posts_today, battery)
       VALUES (?, ?, ?, 'idle', 0, 100)`
    ).run(name, platform, account ?? null);

    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(result.lastInsertRowid) as Device;

    return NextResponse.json(device, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
