CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  description TEXT,
  style TEXT,
  hero_image_url TEXT,
  locked INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  thumbnail TEXT,
  duration TEXT,
  status TEXT DEFAULT 'queued' CHECK(status IN ('queued','processing','complete','failed','scheduled')),
  platform TEXT CHECK(platform IN ('TikTok','Reels','Shorts')),
  views INTEGER DEFAULT 0,
  style TEXT,
  video_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  account TEXT,
  status TEXT DEFAULT 'idle' CHECK(status IN ('idle','posting','cooldown','error')),
  posts_today INTEGER DEFAULT 0,
  last_post TEXT,
  battery INTEGER DEFAULT 100
);

CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER REFERENCES videos(id),
  device_id INTEGER REFERENCES devices(id),
  platform TEXT,
  account TEXT,
  scheduled_at TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','posted','failed')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT CHECK(type IN ('credit','debit')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS analytics_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  platform TEXT,
  views INTEGER DEFAULT 0,
  followers INTEGER DEFAULT 0,
  engagement REAL DEFAULT 0,
  UNIQUE(date, platform)
);
