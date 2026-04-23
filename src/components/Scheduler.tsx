'use client';
import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Clock, CheckCircle, XCircle, Play, Send } from 'lucide-react';
import NoSignal from '@/components/NoSignal';

interface ScheduleItem {
  id: number;
  video_id: number;
  device_id: number;
  platform: string;
  account: string;
  scheduled_at: string;
  status: 'pending' | 'posted' | 'failed';
  created_at: string;
  video_title?: string;
  device_name?: string;
}

const PLATFORM_BADGE: Record<string, string> = {
  TikTok: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  Reels:  'bg-purple-500/10 border-purple-500/20 text-purple-400',
  Shorts: 'bg-red-500/10 border-red-500/20 text-red-400',
};

const STATUS_CONFIG: Record<ScheduleItem['status'], { icon: React.FC<{ className?: string }>; color: string; label: string; dotBg: string }> = {
  pending: { icon: Clock,       color: 'text-yellow-400', label: 'Pending', dotBg: 'bg-yellow-500/20' },
  posted:  { icon: CheckCircle, color: 'text-green-400',  label: 'Posted',  dotBg: 'bg-green-500/20' },
  failed:  { icon: XCircle,     color: 'text-red-400',    label: 'Failed',  dotBg: 'bg-red-500/20' },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function groupByDate(posts: ScheduleItem[]): Map<string, ScheduleItem[]> {
  const map = new Map<string, ScheduleItem[]>();
  for (const post of posts) {
    const key = post.scheduled_at.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(post);
  }
  return map;
}

export default function Scheduler() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [processing, setProcessing] = useState(false);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/schedule');
      if (!res.ok) throw new Error('Failed to fetch');
      const data: { schedule: ScheduleItem[] } = await res.json();
      setSchedule(data.schedule);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSchedule();
  }, [fetchSchedule]);

  const handleProcess = async () => {
    setProcessing(true);
    try {
      await fetch('/api/schedule/process', { method: 'POST' });
      await fetchSchedule();
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <NoSignal isLoading />;
  if (error) return <NoSignal title="No Signal" message="Failed to load schedule" onRetry={fetchSchedule} />;

  const grouped = groupByDate(schedule);
  const pending = schedule.filter(p => p.status === 'pending').length;
  const posted  = schedule.filter(p => p.status === 'posted').length;
  const failed  = schedule.filter(p => p.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Scheduled', value: schedule.length, gradient: 'from-purple-500 to-cyan-500', icon: CalendarDays, iconBg: 'bg-purple-500/10', iconColor: 'text-purple-400' },
          { label: 'Pending',  value: pending, gradient: 'from-yellow-500 to-amber-500', icon: Clock,       iconBg: 'bg-yellow-500/10', iconColor: 'text-yellow-400' },
          { label: 'Posted',   value: posted,  gradient: 'from-green-500 to-emerald-500', icon: CheckCircle, iconBg: 'bg-green-500/10',  iconColor: 'text-green-400' },
          { label: 'Failed',   value: failed,  gradient: 'from-red-500 to-red-400', icon: XCircle,     iconBg: 'bg-red-500/10',    iconColor: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="glass-card p-5 group">
            <div className="flex items-center justify-between mb-3">
              <span className="section-label">{s.label}</span>
              <div className={`w-9 h-9 rounded-xl ${s.iconBg} flex items-center justify-center transition-transform duration-200 group-hover:scale-110`}>
                <s.icon className={`w-4 h-4 ${s.iconColor}`} />
              </div>
            </div>
            <div className={`text-2xl font-bold tabular-nums bg-gradient-to-r ${s.gradient} bg-clip-text text-transparent`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <CalendarDays className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Post Timeline</h2>
              <p className="text-[11px] text-text-muted">Scheduled and posted content</p>
            </div>
          </div>
          <button
            onClick={handleProcess}
            disabled={processing || pending === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl btn-primary text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-3 h-3" />
            {processing ? 'Processing...' : 'Process Queue'}
          </button>
        </div>

        <div className="space-y-8">
          {Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dateKey, posts]) => (
              <div key={dateKey}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-border-subtle" />
                  <span className="text-[11px] font-semibold text-text-tertiary px-3 py-1 rounded-lg bg-white/[0.04] border border-border-subtle">
                    {formatDate(posts[0].scheduled_at)}
                  </span>
                  <div className="h-px flex-1 bg-border-subtle" />
                </div>

                {/* Posts for this day */}
                <div className="space-y-2.5 relative">
                  {/* Vertical line */}
                  <div className="absolute left-[18px] top-2 bottom-2 w-px bg-border-subtle" />

                  {posts
                    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
                    .map(post => {
                      const { icon: StatusIcon, color: statusColor, label: statusLabel, dotBg } = STATUS_CONFIG[post.status];
                      const platformClass = PLATFORM_BADGE[post.platform] ?? 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400';
                      return (
                        <div key={post.id} className="flex gap-4 items-start pl-1">
                          {/* Dot */}
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 z-10 ${dotBg}`}>
                            <StatusIcon className={`w-4 h-4 ${statusColor}`} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-border-subtle hover:bg-white/[0.03] hover:border-border-hover transition-all">
                            {/* Time */}
                            <div className="text-sm font-medium text-text-secondary w-14 shrink-0 tabular-nums">
                              {formatTime(post.scheduled_at)}
                            </div>

                            {/* Title */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-text-primary truncate">{post.video_title ?? 'Untitled'}</p>
                              <p className="text-[11px] text-text-muted">{post.account}{post.device_name ? ` · ${post.device_name}` : ''}</p>
                            </div>

                            {/* Platform badge */}
                            <span className={`badge shrink-0 ${platformClass}`}>
                              {post.platform}
                            </span>

                            {/* Status */}
                            <span className={`text-[11px] font-medium shrink-0 ${statusColor}`}>{statusLabel}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
        </div>

        {schedule.length === 0 && (
          <div className="text-center py-12">
            <Send className="w-8 h-8 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted text-sm">No scheduled posts</p>
            <p className="text-text-muted text-xs mt-1">Posts will appear here when you schedule them</p>
          </div>
        )}
      </div>
    </div>
  );
}
