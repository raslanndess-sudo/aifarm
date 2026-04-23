import fs from 'fs';
import path from 'path';
import { getDb } from './db';

/** Run schema + seed. Returns list of created tables. */
export function initDatabase(): string[] {
  const db = getDb();

  // ── Apply schema ──────────────────────────────────────────────────────────
  const schemaPath = path.join(process.cwd(), 'src', 'lib', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // ── Migrations (idempotent) ─────────────────────────────────────────────
  try {
    db.prepare(`ALTER TABLE videos ADD COLUMN video_url TEXT`).run();
  } catch {
    // Column already exists — SQLite throws "duplicate column name"
  }

  // ── Seed data (idempotent — only when tables are empty) ───────────────────
  const isEmpty = (table: string): boolean => {
    const row = db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as { cnt: number };
    return row.cnt === 0;
  };

  // Videos
  if (isEmpty('videos')) {
    const insert = db.prepare(
      `INSERT INTO videos (title, thumbnail, duration, status, platform, views, style, created_at)
       VALUES (@title, @thumbnail, @duration, @status, @platform, @views, @style, @created_at)`
    );

    const statusMap: Record<string, string> = {
      complete: 'complete',
      rendering: 'processing',
      scheduled: 'scheduled',
      failed: 'failed',
    };

    const videos = [
      { title: "Sakura's Awakening - Ep 1", thumbnail: 'https://picsum.photos/seed/v1/320/180', duration: '1:04', status: 'complete', platform: 'TikTok', views: 128400, style: 'Anime', created_at: '2026-04-01' },
      { title: 'Neon City Chase', thumbnail: 'https://picsum.photos/seed/v2/320/180', duration: '0:58', status: 'rendering', platform: 'Reels', views: 0, style: 'Cyberpunk', created_at: '2026-04-02' },
      { title: 'Forest Spirit Journey', thumbnail: 'https://picsum.photos/seed/v3/320/180', duration: '1:12', status: 'scheduled', platform: 'Shorts', views: 0, style: 'Ghibli', created_at: '2026-04-02' },
      { title: 'Iron Titan Rises', thumbnail: 'https://picsum.photos/seed/v4/320/180', duration: '0:47', status: 'complete', platform: 'TikTok', views: 84200, style: 'Mecha', created_at: '2026-03-31' },
      { title: 'Shadow Duel – Final Arc', thumbnail: 'https://picsum.photos/seed/v5/320/180', duration: '1:30', status: 'complete', platform: 'Reels', views: 210000, style: 'Seinen', created_at: '2026-03-30' },
      { title: 'Parallel World Gate', thumbnail: 'https://picsum.photos/seed/v6/320/180', duration: '1:05', status: 'failed', platform: 'Shorts', views: 0, style: 'Anime', created_at: '2026-03-29' },
    ];

    const insertMany = db.transaction(() => {
      for (const v of videos) {
        insert.run({ ...v, status: statusMap[v.status] ?? v.status });
      }
    });
    insertMany();
  }

  // Devices
  if (isEmpty('devices')) {
    const insert = db.prepare(
      `INSERT INTO devices (name, platform, account, status, posts_today, last_post, battery)
       VALUES (@name, @platform, @account, @status, @posts_today, @last_post, @battery)`
    );

    const devices = [
      { name: 'Android 01', platform: 'TikTok', account: '@sakura_stories', status: 'posting', posts_today: 3, last_post: '2 min ago', battery: 88 },
      { name: 'Android 02', platform: 'Reels', account: '@neon_clips', status: 'idle', posts_today: 5, last_post: '45 min ago', battery: 72 },
      { name: 'Android 03', platform: 'Shorts', account: '@forest_tales', status: 'cooldown', posts_today: 6, last_post: '12 min ago', battery: 54 },
      { name: 'Android 04', platform: 'TikTok', account: '@mecha_verse', status: 'posting', posts_today: 2, last_post: '5 min ago', battery: 91 },
      { name: 'Android 05', platform: 'Reels', account: '@shadow_arc', status: 'idle', posts_today: 4, last_post: '1 hr ago', battery: 65 },
      { name: 'Android 06', platform: 'Shorts', account: '@gate_world', status: 'error', posts_today: 0, last_post: null, battery: 30 },
      { name: 'Android 07', platform: 'TikTok', account: '@cyber_dream', status: 'idle', posts_today: 3, last_post: '30 min ago', battery: 77 },
      { name: 'Android 08', platform: 'Reels', account: '@spirit_run', status: 'cooldown', posts_today: 5, last_post: '20 min ago', battery: 60 },
    ];

    const insertMany = db.transaction(() => {
      for (const d of devices) {
        insert.run(d);
      }
    });
    insertMany();
  }

  // Schedule (video_id / device_id map to insertion order 1-6 / 1-8)
  if (isEmpty('schedule')) {
    const insert = db.prepare(
      `INSERT INTO schedule (video_id, device_id, platform, account, scheduled_at, status)
       VALUES (@video_id, @device_id, @platform, @account, @scheduled_at, @status)`
    );

    const scheduleRows = [
      { video_id: 1, device_id: 1, platform: 'TikTok', account: '@sakura_stories', scheduled_at: '2026-04-02T09:00:00', status: 'pending' },
      { video_id: 2, device_id: 2, platform: 'Reels', account: '@neon_clips', scheduled_at: '2026-04-02T12:30:00', status: 'pending' },
      { video_id: 3, device_id: 3, platform: 'Shorts', account: '@forest_tales', scheduled_at: '2026-04-02T15:00:00', status: 'pending' },
      { video_id: 4, device_id: 4, platform: 'TikTok', account: '@mecha_verse', scheduled_at: '2026-04-01T18:00:00', status: 'posted' },
      { video_id: 5, device_id: 5, platform: 'Reels', account: '@shadow_arc', scheduled_at: '2026-04-01T20:00:00', status: 'posted' },
      { video_id: 6, device_id: 6, platform: 'Shorts', account: '@gate_world', scheduled_at: '2026-04-01T14:00:00', status: 'failed' },
      { video_id: 2, device_id: 7, platform: 'TikTok', account: '@cyber_dream', scheduled_at: '2026-04-03T10:00:00', status: 'pending' },
      { video_id: 3, device_id: 8, platform: 'Reels', account: '@spirit_run', scheduled_at: '2026-04-03T13:00:00', status: 'pending' },
    ];

    const insertMany = db.transaction(() => {
      for (const s of scheduleRows) {
        insert.run(s);
      }
    });
    insertMany();
  }

  // Transactions
  if (isEmpty('transactions')) {
    const insert = db.prepare(
      `INSERT INTO transactions (description, amount, type, created_at)
       VALUES (@description, @amount, @type, @created_at)`
    );

    const txns = [
      { description: 'Scene generation × 12', amount: -240, type: 'debit', created_at: '2026-04-01' },
      { description: 'Hero character generation', amount: -80, type: 'debit', created_at: '2026-03-31' },
      { description: 'Pro plan renewal', amount: 10000, type: 'credit', created_at: '2026-03-30' },
      { description: 'Angle sheet × 10', amount: -200, type: 'debit', created_at: '2026-03-28' },
      { description: 'Video render × 3', amount: -150, type: 'debit', created_at: '2026-03-25' },
    ];

    const insertMany = db.transaction(() => {
      for (const t of txns) {
        insert.run(t);
      }
    });
    insertMany();
  }

  // Analytics daily — combine viewsChart dates with platform breakdown
  if (isEmpty('analytics_daily')) {
    const insert = db.prepare(
      `INSERT INTO analytics_daily (date, platform, views, followers, engagement)
       VALUES (@date, @platform, @views, @followers, @engagement)`
    );

    const viewsChart = [
      { date: '2026-03-26', views: 32000, engagement: 6.2 },
      { date: '2026-03-27', views: 45000, engagement: 7.1 },
      { date: '2026-03-28', views: 38000, engagement: 6.8 },
      { date: '2026-03-29', views: 62000, engagement: 8.0 },
      { date: '2026-03-30', views: 78000, engagement: 8.5 },
      { date: '2026-03-31', views: 91000, engagement: 7.9 },
      { date: '2026-04-01', views: 105000, engagement: 9.2 },
    ];

    const insertMany = db.transaction(() => {
      for (const day of viewsChart) {
        insert.run({ ...day, platform: 'all', followers: 0 });
      }
    });
    insertMany();
  }

  // Settings
  if (isEmpty('settings')) {
    const insert = db.prepare(`INSERT INTO settings (key, value) VALUES (@key, @value)`);
    const settings = [
      { key: 'balance', value: '7430' },
      { key: 'totalCredits', value: '10000' },
      { key: 'plan', value: 'Pro' },
      { key: 'renewDate', value: 'May 1, 2026' },
    ];

    const insertMany = db.transaction(() => {
      for (const s of settings) {
        insert.run(s);
      }
    });
    insertMany();
  }

  // Return list of tables
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];

  return tables.map((t) => t.name);
}
