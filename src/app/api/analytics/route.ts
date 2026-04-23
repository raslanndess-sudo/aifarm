import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { AnalyticsDaily, Video } from '@/lib/types';

export async function GET() {
  try {
    const db = getDb();

    const totalViewsRow = db.prepare(
      'SELECT COALESCE(SUM(views), 0) as total FROM videos'
    ).get() as { total: number };

    const latestDateRow = db.prepare(
      'SELECT date FROM analytics_daily ORDER BY date DESC LIMIT 1'
    ).get() as { date: string } | undefined;

    let totalFollowers = 0;
    if (latestDateRow) {
      const followersRow = db.prepare(
        'SELECT COALESCE(MAX(followers), 0) as total FROM analytics_daily WHERE date = ?'
      ).get(latestDateRow.date) as { total: number };
      totalFollowers = followersRow.total;
    }

    const avgEngagementRow = db.prepare(
      `SELECT COALESCE(AVG(engagement), 0) as avg
       FROM analytics_daily
       WHERE date >= date('now', '-7 days')`
    ).get() as { avg: number };

    const videosPublishedRow = db.prepare(
      "SELECT COUNT(*) as count FROM videos WHERE status = 'complete'"
    ).get() as { count: number };

    const viewsChart = db.prepare(
      'SELECT * FROM analytics_daily ORDER BY date ASC LIMIT 7'
    ).all() as AnalyticsDaily[];

    const platformBreakdown = db.prepare(
      `SELECT platform, SUM(views) as views
       FROM videos
       WHERE platform IS NOT NULL
       GROUP BY platform`
    ).all() as { platform: string; views: number }[];

    const topVideos = db.prepare(
      "SELECT * FROM videos WHERE status = 'complete' ORDER BY views DESC LIMIT 3"
    ).all() as Video[];

    return NextResponse.json({
      totalViews: totalViewsRow.total,
      totalFollowers,
      avgEngagement: Math.round(avgEngagementRow.avg * 100) / 100,
      videosPublished: videosPublishedRow.count,
      viewsChart,
      platformBreakdown,
      topVideos,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface AnalyticsPostBody {
  date: string;
  platform: string;
  views: number;
  followers?: number;
  engagement?: number;
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json() as AnalyticsPostBody;

    if (!body.date || !body.platform || body.views == null) {
      return NextResponse.json(
        { error: 'date, platform, and views are required' },
        { status: 400 }
      );
    }

    const existing = db.prepare(
      'SELECT * FROM analytics_daily WHERE date = ? AND platform = ?'
    ).get(body.date, body.platform) as AnalyticsDaily | undefined;

    let record: AnalyticsDaily;

    if (existing) {
      db.prepare(
        `UPDATE analytics_daily
         SET views = views + ?,
             followers = COALESCE(?, followers),
             engagement = COALESCE(?, engagement)
         WHERE date = ? AND platform = ?`
      ).run(
        body.views,
        body.followers ?? null,
        body.engagement ?? null,
        body.date,
        body.platform
      );
      record = db.prepare(
        'SELECT * FROM analytics_daily WHERE date = ? AND platform = ?'
      ).get(body.date, body.platform) as AnalyticsDaily;

      return NextResponse.json(record, { status: 200 });
    } else {
      const result = db.prepare(
        `INSERT INTO analytics_daily (date, platform, views, followers, engagement)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        body.date,
        body.platform,
        body.views,
        body.followers ?? 0,
        body.engagement ?? 0
      );
      record = db.prepare(
        'SELECT * FROM analytics_daily WHERE id = ?'
      ).get(result.lastInsertRowid) as AnalyticsDaily;

      return NextResponse.json(record, { status: 201 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
