'use client';
import { useState, useEffect, useCallback } from 'react';
import { Play, CheckCircle, XCircle, Trash2, Hourglass, Film, Download, Clock, CalendarClock, RefreshCw, X } from 'lucide-react';
import type { Video } from '@/lib/types';
import NoSignal from '@/components/NoSignal';

type VideoStatusKey = Video['status'];

const STATUS_CONFIG: Record<VideoStatusKey, { label: string; color: string; icon: React.FC<{ className?: string; style?: React.CSSProperties }> }> = {
  complete:   { label: 'Complete',   color: '#88a584', icon: CheckCircle },
  processing: { label: 'Processing', color: '#c9a86a', icon: Clock },
  queued:     { label: 'Queued',     color: 'rgba(245,230,211,0.45)', icon: Hourglass },
  scheduled:  { label: 'Scheduled',  color: 'rgba(245,230,211,0.45)', icon: CalendarClock },
  failed:     { label: 'Failed',     color: '#ff3344', icon: XCircle },
};

const STATUS_FILTERS: { label: string; value: string | undefined }[] = [
  { label: 'All',      value: undefined },
  { label: 'Complete', value: 'complete' },
  { label: 'Failed',   value: 'failed' },
];

function confirmDelete(title: string): boolean {
  return typeof window !== 'undefined'
    ? window.confirm(`Удалить видео "${title}"?\n\nФайл на диске останется (public/generations/), но запись в Library исчезнет.`)
    : false;
}

export default function VideoLibrary() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<{ status?: string }>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [playingVideo, setPlayingVideo] = useState<Video | null>(null);

  useEffect(() => {
    if (!playingVideo) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlayingVideo(null);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [playingVideo]);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set('status', filter.status);
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

  const handleDelete = async (id: number, title: string) => {
    if (!confirmDelete(title)) return;
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

  return (
    <div>
      {/* Header */}
      <div className="mb-10">
        <span className="section-label block mb-3">Library &middot; Archive</span>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '48px', lineHeight: 0.95, letterSpacing: '-0.03em', color: '#f5e6d3' }}>
          Your <em style={{ color: '#ff3344', fontStyle: 'italic' }}>finished</em> reels.
        </h1>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {[
          { label: 'Total Videos', value: videos.length },
          { label: 'Complete', value: completeCount },
        ].map(stat => (
          <div key={stat.label} className="glass-card p-6">
            <span className="section-label block mb-2">{stat.label}</span>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '38px', color: '#f5e6d3' }} className="tabular-nums">
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-8">
        <span className="section-label mr-2">Status</span>
        {STATUS_FILTERS.map(f => {
          const active = filter.status === f.value;
          return (
            <button
              key={f.label}
              onClick={() => setFilter(prev => ({ ...prev, status: f.value }))}
              className={`reel-chip ${active ? 'active' : ''}`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Video grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {videos.map(video => {
          const cfg = STATUS_CONFIG[video.status];
          const StatusIcon = cfg.icon;
          return (
            <div key={video.id} className="glass-card overflow-hidden group relative">
              {/* Filmstrip frame */}
              <div className="p-2">
                <div className="relative aspect-video overflow-hidden" style={{ border: '1px solid rgba(245,230,211,0.08)', background: '#1a1a1a' }}>
                  {video.thumbnail ? (
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    />
                  ) : video.video_url ? (
                    <video
                      src={video.video_url}
                      preload="metadata"
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Play className="w-8 h-8" style={{ color: 'rgba(245,230,211,0.15)' }} />
                    </div>
                  )}
                  {/* Hover play overlay */}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPlayingVideo(video); }}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center cursor-pointer"
                    aria-label={`Play ${video.title}`}
                  >
                    <div className="w-12 h-12 flex items-center justify-center" style={{ border: '1px solid rgba(245,230,211,0.3)' }}>
                      <Play className="w-5 h-5 ml-0.5" style={{ color: '#f5e6d3' }} />
                    </div>
                  </button>
                  {/* Duration */}
                  {video.duration && (
                    <span className="absolute bottom-2 right-2 tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '0.1em', color: 'rgba(245,230,211,0.7)', background: 'rgba(0,0,0,0.6)', padding: '2px 6px' }}>
                      {video.duration}
                    </span>
                  )}
                  {/* Status badge */}
                  <span className="badge absolute top-2 left-2" style={{ borderColor: cfg.color, color: cfg.color }}>
                    <StatusIcon className="w-2.5 h-2.5" />
                    {cfg.label}
                  </span>
                </div>
              </div>

              {/* Delete button */}
              <button
                onClick={() => handleDelete(video.id, video.title)}
                disabled={deletingId === video.id}
                title="Delete from Library"
                aria-label={`Delete ${video.title}`}
                className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 disabled:opacity-50 cursor-pointer"
                style={{ border: '1px solid rgba(245,230,211,0.2)', background: 'transparent' }}
              >
                {deletingId === video.id
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: '#ff3344' }} />
                  : <Trash2 className="w-3.5 h-3.5" style={{ color: 'rgba(245,230,211,0.45)' }} />}
              </button>

              {/* Info */}
              <div className="px-4 pb-4 pt-2">
                <h3 className="line-clamp-1 mb-2" style={{ fontFamily: "'Fraunces', serif", fontSize: '16px', color: '#f5e6d3' }}>{video.title}</h3>
                <div className="flex items-center gap-3">
                  {video.style && (
                    <span className="badge">{video.style}</span>
                  )}
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(245,230,211,0.3)' }}>
                    {video.created_at}
                  </span>
                  {video.video_url && (
                    <a
                      href={video.video_url}
                      download
                      className="btn-ghost ml-auto !px-2 !py-1"
                      style={{ fontSize: '10px' }}
                      aria-label={`Download ${video.title}`}
                    >
                      <Download className="w-3.5 h-3.5" /> DL
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {videos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <Film className="w-12 h-12 mb-4" style={{ color: 'rgba(245,230,211,0.12)' }} />
          <h3 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '28px', color: 'rgba(245,230,211,0.45)', marginBottom: '8px' }}>
            No reels yet. <em style={{ color: '#ff3344', fontStyle: 'italic' }}>Begin</em> with a script.
          </h3>
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: '14px', color: 'rgba(245,230,211,0.3)' }}>
            Try changing your filters or create a new video in Studio.
          </p>
        </div>
      )}

      {/* Modal player */}
      {playingVideo && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setPlayingVideo(null); }}
        >
          <button
            type="button"
            onClick={() => setPlayingVideo(null)}
            className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center transition-colors duration-200 cursor-pointer"
            style={{ border: '1px solid rgba(245,230,211,0.2)', color: '#f5e6d3' }}
            aria-label="Close player"
          >
            <X className="w-5 h-5" />
          </button>
          <p className="mb-4" style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '18px', color: '#f5e6d3' }}>{playingVideo.title}</p>
          <video
            src={playingVideo.video_url}
            controls
            autoPlay
            className="max-w-[90vw] max-h-[80vh]"
            style={{ border: '1px solid rgba(245,230,211,0.08)' }}
          />
        </div>
      )}
    </div>
  );
}
