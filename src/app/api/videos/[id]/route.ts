import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Video } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const db = getDb();

    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as Video | undefined;

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    return NextResponse.json(video);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as Video | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const body = await request.json() as Partial<Omit<Video, 'id' | 'created_at'>>;

    const allowedFields: (keyof Omit<Video, 'id' | 'created_at'>)[] = [
      'title', 'thumbnail', 'duration', 'status', 'platform', 'views', 'style',
    ];

    const setClauses: string[] = [];
    const values: (string | number | null)[] = [];

    for (const field of allowedFields) {
      if (field in body) {
        setClauses.push(`${field} = ?`);
        values.push(body[field] as string | number | null);
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(Number(id));
    db.prepare(`UPDATE videos SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as Video;

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as Video | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM videos WHERE id = ?').run(id);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
