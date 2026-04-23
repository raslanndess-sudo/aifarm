export interface Video {
  id: number;
  title: string;
  thumbnail: string | null;
  duration: string | null;
  status: 'queued' | 'processing' | 'complete' | 'failed' | 'scheduled';
  platform: 'TikTok' | 'Reels' | 'Shorts' | null;
  views: number;
  style: string | null;
  video_url?: string;
  created_at: string;
}

export interface Device {
  id: number;
  name: string;
  platform: 'TikTok' | 'Reels' | 'Shorts';
  account: string | null;
  status: 'idle' | 'posting' | 'cooldown' | 'error';
  posts_today: number;
  last_post: string | null;
  battery: number;
}

export interface ScheduledPost {
  id: number;
  video_id: number;
  device_id: number;
  platform: string;
  account: string;
  scheduled_at: string;
  status: 'pending' | 'posted' | 'failed';
  created_at: string;
}

export interface Transaction {
  id: number;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  created_at: string;
}

export interface AnalyticsDaily {
  id: number;
  date: string;
  platform: string;
  views: number;
  followers: number;
  engagement: number;
}

export interface Settings {
  key: string;
  value: string;
}

export type { ProviderMode, VideoProvider, GenerationJob } from './providers';
