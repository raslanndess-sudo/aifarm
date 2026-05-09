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

const STATUS_CONFIG: Record<ScheduleItem['status'], { icon: React.FC<{ className?: string; style?: React.CSSProperties }>; color: string; label: string }> = {
  pending: { icon: Clock,       color: '#c9a86a', label: 'Pending' },
  posted:  { icon: CheckCircle, color: '#88a584', label: 'Posted' },
  failed:  { icon: XCircle,     color: '#ff3344', label: 'Failed' },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function isWithinHour(iso: string): boolean {
  const diff = new Date(iso).getTime() - Date.now();
  return diff > 0 && diff < 3600_000;
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
  const [tab, setTab] = useState<'all' | 'pending' | 'posted' | 'failed'>('all');

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

  useEffect(() => { void fetchSchedule(); }, [fetchSchedule]);

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

  const filtered = tab === 'all' ? schedule : schedule.filter(p => p.status === tab);
  const grouped = groupByDate(filtered);
  const pending = schedule.filter(p => p.status === 'pending').length;
  const posted  = schedule.filter(p => p.status === 'posted').length;
  const failed  = schedule.filter(p => p.status === 'failed').length;

  return (
    <div>
      {/* Header */}
      <div className="mb-10">
        <span className="section-label block mb-3">Schedule &middot; Timeline</span>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '48px', lineHeight: 0.95, letterSpacing: '-0.03em', color: '#f5e6d3' }}>
          The <em style={{ color: '#ff3344', fontStyle: 'italic' }}>call sheet</em>.
        </h1>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total', value: schedule.length, icon: CalendarDays },
          { label: 'Pending', value: pending, icon: Clock },
          { label: 'Posted', value: posted, icon: CheckCircle },
          { label: 'Failed', value: failed, icon: XCircle },
        ].map(s => (
          <div key={s.label} className="glass-card p-6">
            <span className="section-label block mb-2">{s.label}</span>
            <div className="flex items-center justify-between">
              <span style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '38px', color: '#f5e6d3' }} className="tabular-nums">
                {s.value}
              </span>
              <s.icon className="w-5 h-5" style={{ color: 'rgba(245,230,211,0.18)' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Tab chips + Process button */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex gap-2">
          {(['all', 'pending', 'posted', 'failed'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`reel-chip ${tab === t ? 'active' : ''}`}>
              {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={handleProcess}
          disabled={processing || pending === 0}
          className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontSize: '13px', padding: '10px 20px' }}
        >
          <Play className="w-3.5 h-3.5" />
          {processing ? 'Processing...' : 'Process Queue'}
        </button>
      </div>

      {/* Timeline — screenplay log style */}
      <div>
        {Array.from(grouped.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([dateKey, posts]) => (
            <div key={dateKey} className="mb-8">
              {/* Date header */}
              <div className="flex items-center gap-4 mb-4">
                <div className="h-px flex-1" style={{ background: 'rgba(245,230,211,0.08)' }} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '0.20em', textTransform: 'uppercase', color: 'rgba(245,230,211,0.3)' }}>
                  {formatDate(posts[0].scheduled_at)}
                </span>
                <div className="h-px flex-1" style={{ background: 'rgba(245,230,211,0.08)' }} />
              </div>

              {/* Rows */}
              {posts
                .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
                .map(post => {
                  const { icon: StatusIcon, color: statusColor, label: statusLabel } = STATUS_CONFIG[post.status];
                  const urgent = post.status === 'pending' && isWithinHour(post.scheduled_at);
                  return (
                    <div
                      key={post.id}
                      className="flex items-center gap-5 px-5 py-4 transition-colors duration-200"
                      style={{ borderBottom: '1px solid rgba(245,230,211,0.08)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,230,211,0.025)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      {/* Timestamp */}
                      <span className="tabular-nums shrink-0 w-16" style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '11px',
                        letterSpacing: '0.15em',
                        textTransform: 'uppercase',
                        color: urgent ? '#ff3344' : 'rgba(245,230,211,0.45)',
                      }}>
                        {formatTime(post.scheduled_at)}
                      </span>

                      {/* Title */}
                      <div className="flex-1 min-w-0">
                        <span className="truncate block" style={{ fontFamily: "'Fraunces', serif", fontSize: '15px', color: '#f5e6d3' }}>
                          {post.video_title ?? 'Untitled'}
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)', letterSpacing: '0.1em' }}>
                          {post.account}{post.device_name ? ` · ${post.device_name}` : ''}
                        </span>
                      </div>

                      {/* Platform badge */}
                      <span className="badge shrink-0">{post.platform}</span>

                      {/* Status */}
                      <div className="flex items-center gap-1.5 shrink-0" style={{ color: statusColor, width: '80px' }}>
                        <StatusIcon className="w-3.5 h-3.5" style={{ color: statusColor }} />
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <Send className="w-12 h-12 mb-4" style={{ color: 'rgba(245,230,211,0.12)' }} />
          <h3 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '24px', color: 'rgba(245,230,211,0.45)', marginBottom: '8px' }}>
            No reels scheduled. <em style={{ color: '#ff3344', fontStyle: 'italic' }}>Take</em> a frame.
          </h3>
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: '14px', color: 'rgba(245,230,211,0.3)' }}>
            Posts will appear here when you schedule them.
          </p>
        </div>
      )}
    </div>
  );
}
