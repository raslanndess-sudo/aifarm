import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { ScheduledPost } from '@/lib/types';

interface ScheduleRow extends ScheduledPost {
  video_title: string | null;
  device_name: string | null;
}

// GET /api/schedule — list schedule entries with optional status filter
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const platform = searchParams.get('platform');

    let query = `
      SELECT s.*, v.title AS video_title, d.name AS device_name
      FROM schedule s
      LEFT JOIN videos v ON v.id = s.video_id
      LEFT JOIN devices d ON d.id = s.device_id
    `;
    const conditions: string[] = [];
    const params: string[] = [];

    if (status) {
      conditions.push('s.status = ?');
      params.push(status);
    }
    if (platform) {
      conditions.push('s.platform = ?');
      params.push(platform);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY s.scheduled_at ASC';

    const schedule = db.prepare(query).all(...params) as ScheduleRow[];
    return NextResponse.json({ schedule });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface CreateBody {
  video_id?: number;
  device_id?: number;
  platform?: string;
  account?: string;
  scheduled_at?: string;
}

// POST /api/schedule — create a new scheduled post
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = (await request.json()) as CreateBody;

    const { video_id, device_id, platform, account, scheduled_at } = body;

    // Validation
    if (!video_id || !device_id || !scheduled_at) {
      return NextResponse.json(
        { error: 'video_id, device_id, and scheduled_at are required' },
        { status: 400 },
      );
    }

    // Check video exists
    const video = db.prepare('SELECT id FROM videos WHERE id = ?').get(video_id);
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 400 });
    }

    // Check device exists
    const device = db.prepare('SELECT id FROM devices WHERE id = ?').get(device_id);
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 400 });
    }

    const result = db
      .prepare(
        `INSERT INTO schedule (video_id, device_id, platform, account, scheduled_at, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
      )
      .run(video_id, device_id, platform ?? '', account ?? '', scheduled_at);

    const created = db.prepare('SELECT * FROM schedule WHERE id = ?').get(result.lastInsertRowid) as ScheduledPost;

    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
