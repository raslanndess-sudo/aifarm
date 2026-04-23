import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Video } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = request.nextUrl;

    const conditions: string[] = [];
    const params: string[] = [];

    const status = searchParams.get('status');
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    const platform = searchParams.get('platform');
    if (platform) {
      conditions.push('platform = ?');
      params.push(platform);
    }

    const style = searchParams.get('style');
    if (style) {
      conditions.push('style = ?');
      params.push(style);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM videos ${where} ORDER BY created_at DESC`;

    const videos = db.prepare(sql).all(...params) as Video[];

    return NextResponse.json({ videos });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json() as Partial<Video>;

    if (!body.title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const result = db.prepare(
      `INSERT INTO videos (title, thumbnail, duration, status, platform, views, style, video_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      body.title,
      body.thumbnail ?? null,
      body.duration ?? null,
      body.status ?? 'queued',
      body.platform ?? null,
      body.views ?? 0,
      body.style ?? null,
      body.video_url ?? null,
    );

    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(result.lastInsertRowid) as Video;

    return NextResponse.json(video, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
