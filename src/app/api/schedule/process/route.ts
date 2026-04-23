import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { ScheduledPost } from '@/lib/types';

// POST /api/schedule/process — process all due pending posts
export async function POST() {
  try {
    const db = getDb();

    const processed = db.transaction(() => {
      const pending = db
        .prepare(
          `SELECT * FROM schedule
           WHERE scheduled_at <= datetime('now')
             AND status = 'pending'`,
        )
        .all() as ScheduledPost[];

      for (const post of pending) {
        // Mark as posted
        db.prepare("UPDATE schedule SET status = 'posted' WHERE id = ?").run(post.id);

        // Update device stats
        db.prepare(
          `UPDATE devices
           SET posts_today = posts_today + 1,
               last_post = datetime('now')
           WHERE id = ?`,
        ).run(post.device_id);

        // Add random views to the video
        const randomViews = Math.floor(Math.random() * 49000) + 1000;
        db.prepare('UPDATE videos SET views = views + ? WHERE id = ?').run(randomViews, post.video_id);

        // UPSERT analytics_daily for today + platform
        const today = new Date().toISOString().slice(0, 10);
        db.prepare(
          `INSERT INTO analytics_daily (date, platform, views, followers, engagement)
           VALUES (?, ?, ?, 0, 0)
           ON CONFLICT(date, platform) DO UPDATE SET views = views + ?`,
        ).run(today, post.platform, randomViews, randomViews);
      }

      return pending.length;
    })();

    return NextResponse.json({ processed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
