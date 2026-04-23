import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { ScheduledPost } from '@/lib/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/schedule/[id] — update status or scheduled_at
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const db = getDb();
    const numId = Number(id);

    const existing = db.prepare('SELECT * FROM schedule WHERE id = ?').get(numId) as ScheduledPost | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Schedule entry not found' }, { status: 404 });
    }

    const body = (await request.json()) as Partial<Pick<ScheduledPost, 'status' | 'scheduled_at'>>;

    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (body.status !== undefined) {
      fields.push('status = ?');
      values.push(body.status);
    }
    if (body.scheduled_at !== undefined) {
      fields.push('scheduled_at = ?');
      values.push(body.scheduled_at);
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(numId);
    db.prepare(`UPDATE schedule SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM schedule WHERE id = ?').get(numId) as ScheduledPost;
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/schedule/[id] — delete only if status is pending
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const db = getDb();
    const numId = Number(id);

    const existing = db.prepare('SELECT * FROM schedule WHERE id = ?').get(numId) as ScheduledPost | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Schedule entry not found' }, { status: 404 });
    }

    if (existing.status !== 'pending') {
      return NextResponse.json({ error: 'Can only delete pending posts' }, { status: 400 });
    }

    db.prepare('DELETE FROM schedule WHERE id = ?').run(numId);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
