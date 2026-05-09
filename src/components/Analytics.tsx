'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, Users, Eye, Video } from 'lucide-react';
import NoSignal from '@/components/NoSignal';

interface AnalyticsData {
  totalViews: number;
  totalFollowers: number;
  avgEngagement: number;
  videosPublished: number;
  viewsChart: Array<{ date: string; views: number; engagement: number }>;
  platformBreakdown: Array<{ platform: string; views: number }>;
  topVideos: Array<{ id: number; title: string; thumbnail: string | null; platform: string; style: string; views: number }>;
}

const PLATFORM_COLORS: Record<string, string> = {
  TikTok: '#f5e6d3',
  Reels: '#ff3344',
  Shorts: '#88a584',
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function ReelTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0a0a0a', border: '1px solid rgba(245,230,211,0.18)', padding: '10px 14px' }}>
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(245,230,211,0.45)', marginBottom: '6px' }}>{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2" style={{ fontSize: '12px', marginBottom: '2px' }}>
          <span style={{ width: '8px', height: '8px', background: entry.color, display: 'inline-block' }} />
          <span style={{ fontFamily: "'Fraunces', serif", color: 'rgba(245,230,211,0.7)' }}>{entry.name}:</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#f5e6d3', fontWeight: 700 }} className="tabular-nums">
            {entry.name.includes('%') ? `${entry.value}%` : formatNum(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/analytics');
      if (!res.ok) throw new Error('Failed to fetch');
      const json: AnalyticsData = await res.json();
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <NoSignal isLoading />;
  if (error || !data) return <NoSignal title="No Signal" message="Failed to load analytics" onRetry={fetchData} />;

  const { totalViews, totalFollowers, avgEngagement, videosPublished, viewsChart, platformBreakdown, topVideos } = data;

  const platforms = platformBreakdown.map(p => ({
    name: p.platform,
    views: p.views,
    color: PLATFORM_COLORS[p.platform] || 'rgba(245,230,211,0.3)',
  }));

  const kpis = [
    { label: 'Total Views',      value: formatNum(totalViews),     icon: Eye },
    { label: 'Followers',        value: formatNum(totalFollowers), icon: Users },
    { label: 'Avg Engagement',   value: `${avgEngagement}%`,       icon: TrendingUp },
    { label: 'Videos Published', value: String(videosPublished),   icon: Video },
  ];

  const axisTick = { fill: 'rgba(245,230,211,0.45)', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" };

  return (
    <div>
      {/* Header */}
      <div className="mb-10">
        <span className="section-label block mb-3">Production &middot; Analytics</span>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '48px', lineHeight: 0.95, letterSpacing: '-0.03em', color: '#f5e6d3' }}>
          Behind the <em style={{ color: '#ff3344', fontStyle: 'italic' }}>frame</em>.
        </h1>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {kpis.map(kpi => (
          <div key={kpi.label} className="glass-card p-6">
            <span className="section-label block mb-2">{kpi.label}</span>
            <div className="flex items-center justify-between">
              <span style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '38px', color: '#f5e6d3' }} className="tabular-nums">
                {kpi.value}
              </span>
              <kpi.icon className="w-5 h-5" style={{ color: 'rgba(245,230,211,0.18)' }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Views + Engagement area chart */}
        <div className="col-span-2 glass-card p-6">
          <span className="section-label block mb-6">Views &amp; Engagement &middot; Last 7 Days</span>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={viewsChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f5e6d3" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#f5e6d3" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff3344" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#ff3344" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(245,230,211,0.06)" vertical={false} />
              <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={axisTick} axisLine={false} tickLine={false} tickFormatter={formatNum} />
              <YAxis yAxisId="right" orientation="right" tick={axisTick} axisLine={false} tickLine={false} unit="%" />
              <Tooltip content={<ReelTooltip />} />
              <Area yAxisId="left" type="monotone" dataKey="views" stroke="#f5e6d3" fill="url(#viewsGrad)" strokeWidth={2} name="Views" dot={false} activeDot={{ r: 5, fill: '#f5e6d3', stroke: '#f5e6d3', strokeWidth: 2 }} />
              <Area yAxisId="right" type="monotone" dataKey="engagement" stroke="#ff3344" fill="url(#engGrad)" strokeWidth={2} name="Engagement %" dot={false} activeDot={{ r: 5, fill: '#ff3344', stroke: '#ff3344', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Platform breakdown pie */}
        <div className="glass-card p-6">
          <span className="section-label block mb-6">Platforms &middot; Breakdown</span>
          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie data={platforms} cx="50%" cy="50%" innerRadius={50} outerRadius={72} paddingAngle={4} dataKey="views" strokeWidth={0}>
                {platforms.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0];
                  return (
                    <div style={{ background: '#0a0a0a', border: '1px solid rgba(245,230,211,0.18)', padding: '8px 12px' }}>
                      <p style={{ fontFamily: "'Fraunces', serif", fontSize: '13px', color: '#f5e6d3' }}>{d.name}</p>
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'rgba(245,230,211,0.45)' }} className="tabular-nums">{formatNum(Number(d.value ?? 0))} views</p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4">
            {platforms.map(p => {
              const total = platforms.reduce((a, b) => a + b.views, 0);
              const pct = total > 0 ? Math.round((p.views / total) * 100) : 0;
              return (
                <div key={p.name} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid rgba(245,230,211,0.06)' }}>
                  <span style={{ width: '8px', height: '8px', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: '13px', color: 'rgba(245,230,211,0.7)', flex: 1 }}>{p.name}</span>
                  <span className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)' }}>{pct}%</span>
                  <span className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#f5e6d3', fontWeight: 500 }}>{formatNum(p.views)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Videos */}
      <div className="glass-card p-6">
        <span className="section-label block mb-6">Top Performing &middot; Ranked by Views</span>
        {topVideos.map((video, idx) => (
          <div key={video.id} className="flex items-center gap-5 py-4" style={{ borderBottom: '1px solid rgba(245,230,211,0.06)' }}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '20px', color: 'rgba(245,230,211,0.18)', width: '32px', textAlign: 'right', flexShrink: 0 }}>
              {String(idx + 1).padStart(2, '0')}
            </span>
            {video.thumbnail ? (
              <img src={video.thumbnail} alt={video.title} className="w-16 h-9 object-cover" style={{ border: '1px solid rgba(245,230,211,0.08)' }} />
            ) : (
              <div className="w-16 h-9 flex items-center justify-center" style={{ border: '1px solid rgba(245,230,211,0.08)' }}>
                <Video className="w-4 h-4" style={{ color: 'rgba(245,230,211,0.15)' }} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="truncate" style={{ fontFamily: "'Fraunces', serif", fontSize: '14px', color: '#f5e6d3' }}>{video.title}</p>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{video.platform} &middot; {video.style}</p>
            </div>
            <span className="tabular-nums" style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '18px', color: '#f5e6d3' }}>{formatNum(video.views)}</span>
          </div>
        ))}
        {topVideos.length === 0 && (
          <div className="py-12 text-center">
            <Video className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(245,230,211,0.12)' }} />
            <p style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '20px', color: 'rgba(245,230,211,0.45)' }}>
              No data yet. <em style={{ color: '#ff3344' }}>Generate</em> a reel.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
