import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Device } from '@/lib/types';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ALLOWED_FIELDS = new Set<string>([
  'name', 'platform', 'account', 'status', 'posts_today', 'last_post', 'battery',
]);

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;

    const entries = Object.entries(body).filter(([key]) => ALLOWED_FIELDS.has(key));
    if (entries.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const db = getDb();

    const existing = db.prepare('SELECT id FROM devices WHERE id = ?').get(Number(id));
    if (!existing) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const setClauses = entries.map(([key]) => `${key} = ?`).join(', ');
    const values = entries.map(([, val]) => val as string | number | null);

    db.prepare(`UPDATE devices SET ${setClauses} WHERE id = ?`).run(...values, Number(id));

    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(Number(id)) as Device;
    return NextResponse.json(device);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const db = getDb();

    const existing = db.prepare('SELECT id FROM devices WHERE id = ?').get(Number(id));
    if (!existing) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM devices WHERE id = ?').run(Number(id));
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
