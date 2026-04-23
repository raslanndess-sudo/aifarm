'use client';
import { useState, useEffect, useCallback } from 'react';
import { Play, Clock, CheckCircle, CalendarClock, XCircle, TrendingUp, Trash2, Hourglass, Film, Download } from 'lucide-react';
import type { Video } from '@/lib/types';
import NoSignal from '@/components/NoSignal';

type VideoStatusKey = Video['status'];

const STATUS_CONFIG: Record<VideoStatusKey, { label: string; color: string; badgeBg: string; icon: React.FC<{ className?: string }> }> = {
  complete:   { label: 'Complete',    color: 'text-green-400',  badgeBg: 'bg-green-500/10 border-green-500/20',   icon: CheckCircle },
  processing: { label: 'Processing',  color: 'text-yellow-400', badgeBg: 'bg-yellow-500/10 border-yellow-500/20', icon: Clock },
  queued:     { label: 'Queued',      color: 'text-zinc-400',   badgeBg: 'bg-zinc-500/10 border-zinc-500/20',     icon: Hourglass },
  scheduled:  { label: 'Scheduled',   color: 'text-cyan-400',   badgeBg: 'bg-cyan-500/10 border-cyan-500/20',     icon: CalendarClock },
  failed:     { label: 'Failed',      color: 'text-red-400',    badgeBg: 'bg-red-500/10 border-red-500/20',       icon: XCircle },
};

const PLATFORM_COLORS: Record<string, string> = {
  TikTok: 'text-cyan-400',
  Reels:  'text-purple-400',
  Shorts: 'text-red-400',
};

const STATUS_FILTERS: { label: string; value: string | undefined }[] = [
  { label: 'All',        value: undefined },
  { label: 'Complete',   value: 'complete' },
  { label: 'Processing', value: 'processing' },
  { label: 'Scheduled',  value: 'scheduled' },
  { label: 'Failed',     value: 'failed' },
];

const PLATFORM_FILTERS: { label: string; value: string | undefined }[] = [
  { label: 'All',    value: undefined },
  { label: 'TikTok', value: 'TikTok' },
  { label: 'Reels',  value: 'Reels' },
  { label: 'Shorts', value: 'Shorts' },
];

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function VideoLibrary() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<{ status?: string; platform?: string }>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set('status', filter.status);
      if (filter.platform) params.set('platform', filter.platform);
      const qs = params.toString();
      const res = await fetch(`/api/videos${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error('fetch failed');
      const data: { videos: Video[] } = await res.json();
      setVideos(data.videos);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/videos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setVideos(prev => prev.filter(v => v.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <NoSignal isLoading />;
  if (error) return <NoSignal title="No Signal" message="Failed to load video library" onRetry={fetchVideos} />;

  const completeCount = videos.filter(v => v.status === 'complete').length;
  const processingCount = videos.filter(v => v.status === 'processing').length;
  const scheduledCount = videos.filter(v => v.status === 'scheduled').length;

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Videos', value: videos.length,  gradient: 'from-purple-500 to-cyan-500', icon: Film,          iconBg: 'bg-purple-500/10', iconColor: 'text-purple-400' },
          { label: 'Complete',     value: completeCount,   gradient: 'from-green-500 to-emerald-500', icon: CheckCircle, iconBg: 'bg-green-500/10',  iconColor: 'text-green-400' },
          { label: 'Processing',   value: processingCount, gradient: 'from-yellow-500 to-orange-500', icon: Clock,       iconBg: 'bg-yellow-500/10', iconColor: 'text-yellow-400' },
          { label: 'Scheduled',    value: scheduledCount,  gradient: 'from-cyan-500 to-blue-500', icon: CalendarClock,    iconBg: 'bg-cyan-500/10',   iconColor: 'text-cyan-400' },
        ].map(stat => (
          <div key={stat.label} className="glass-card p-5 group">
            <div className="flex items-center justify-between mb-3">
              <span className="section-label">{stat.label}</span>
              <div className={`w-9 h-9 rounded-xl ${stat.iconBg} flex items-center justify-center transition-transform duration-200 group-hover:scale-110`}>
                <stat.icon className={`w-4 h-4 ${stat.iconColor}`} />
              </div>
            </div>
            <div className={`text-2xl font-bold tabular-nums bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="section-label mr-1">Status</span>
          {STATUS_FILTERS.map(f => {
            const active = filter.status === f.value;
            return (
              <button
                key={f.label}
                onClick={() => setFilter(prev => ({ ...prev, status: f.value }))}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${
                  active
                    ? 'bg-white/[0.08] border-white/[0.12] text-text-primary'
                    : 'bg-transparent border-border-subtle text-text-muted hover:text-text-secondary hover:border-border-hover'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="w-px h-5 bg-border-subtle" />
        <div className="flex items-center gap-1.5">
          <span className="section-label mr-1">Platform</span>
          {PLATFORM_FILTERS.map(f => {
            const active = filter.platform === f.value;
            return (
              <button
                key={f.label}
                onClick={() => setFilter(prev => ({ ...prev, platform: f.value }))}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${
                  active
                    ? 'bg-white/[0.08] border-white/[0.12] text-text-primary'
                    : 'bg-transparent border-border-subtle text-text-muted hover:text-text-secondary hover:border-border-hover'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Video grid */}
      <div className="grid grid-cols-3 gap-5">
        {videos.map(video => {
          const cfg = STATUS_CONFIG[video.status];
          const StatusIcon = cfg.icon;
          return (
            <div key={video.id} className="glass-card overflow-hidden group relative glow-border">
              {/* Thumbnail */}
              <div className="relative aspect-video bg-surface-2 overflow-hidden">
                {video.thumbnail ? (
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted">
                    <Play className="w-8 h-8" />
                  </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-surface-0/80 via-transparent to-transparent" />
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-surface-0/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform duration-300">
                    <Play className="w-5 h-5 text-white ml-0.5" />
                  </div>
                </div>
                {/* Duration badge */}
                {video.duration && (
                  <span className="absolute bottom-2 right-2 text-[10px] px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-zinc-200 font-medium tabular-nums">
                    {video.duration}
                  </span>
                )}
                {/* Status badge */}
                <span className={`absolute top-2 left-2 badge ${cfg.badgeBg} ${cfg.color}`}>
                  <StatusIcon className="w-2.5 h-2.5" />
                  {cfg.label}
                </span>
              </div>

              {/* Delete button */}
              <button
                onClick={() => handleDelete(video.id)}
                disabled={deletingId === video.id}
                className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-red-500/80 border border-red-400/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-500 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5 text-white" />
              </button>

              {/* Info */}
              <div className="p-4">
                <h3 className="text-sm font-medium text-text-primary line-clamp-1 mb-2 group-hover:text-white transition-colors">{video.title}</h3>
                <div className="flex items-center justify-between text-xs">
                  {video.platform && (
                    <span className={`font-medium ${PLATFORM_COLORS[video.platform] ?? ''}`}>{video.platform}</span>
                  )}
                  {video.style && (
                    <span className="bg-white/[0.04] border border-border-subtle px-2 py-0.5 rounded-md text-text-muted text-[11px]">{video.style}</span>
                  )}
                </div>
                {video.views > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-text-secondary">
                    <TrendingUp className="w-3 h-3 text-green-400" />
                    <span className="tabular-nums">{formatViews(video.views)} views</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px] text-text-muted">{video.created_at}</span>
                  {video.video_url && (
                    <a
                      href={video.video_url}
                      download
                      className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {videos.length === 0 && (
        <div className="text-center py-16">
          <Film className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted text-sm">No videos found</p>
          <p className="text-text-muted text-xs mt-1">Try changing your filters or create a new video in Studio</p>
        </div>
      )}
    </div>
  );
}
