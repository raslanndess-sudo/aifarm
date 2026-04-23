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
  TikTok: '#06b6d4',
  Reels: '#a855f7',
  Shorts: '#10b981',
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card-static px-3 py-2.5 !rounded-xl shadow-2xl !border-border-hover">
      <p className="text-[11px] text-text-tertiary mb-1.5">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-text-secondary">{entry.name}:</span>
          <span className="text-text-primary font-semibold tabular-nums">
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
    color: PLATFORM_COLORS[p.platform] || '#71717a',
  }));

  const kpis = [
    { label: 'Total Views',       value: formatNum(totalViews),       icon: Eye,        gradient: 'from-purple-500 to-cyan-500',   iconBg: 'bg-purple-500/10', iconColor: 'text-purple-400' },
    { label: 'Followers',         value: formatNum(totalFollowers),   icon: Users,      gradient: 'from-cyan-500 to-blue-500',     iconBg: 'bg-cyan-500/10',   iconColor: 'text-cyan-400' },
    { label: 'Avg Engagement',    value: `${avgEngagement}%`,         icon: TrendingUp, gradient: 'from-green-500 to-emerald-500', iconBg: 'bg-green-500/10',  iconColor: 'text-green-400' },
    { label: 'Videos Published',  value: String(videosPublished),     icon: Video,      gradient: 'from-yellow-500 to-orange-500', iconBg: 'bg-yellow-500/10', iconColor: 'text-yellow-400' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map(kpi => (
          <div key={kpi.label} className="glass-card p-5 group">
            <div className="flex items-center justify-between mb-3">
              <span className="section-label">{kpi.label}</span>
              <div className={`w-9 h-9 rounded-xl ${kpi.iconBg} flex items-center justify-center transition-transform duration-200 group-hover:scale-110`}>
                <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
              </div>
            </div>
            <div className={`text-2xl font-bold tabular-nums bg-gradient-to-r ${kpi.gradient} bg-clip-text text-transparent`}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Views + Engagement area chart */}
        <div className="col-span-2 glass-card p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Views & Engagement</h2>
              <p className="text-[11px] text-text-muted">Last 7 days performance</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={viewsChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="#a855f7" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="#06b6d4" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
                {/* Glow filters */}
                <filter id="purpleGlow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="cyanGlow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#52525b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left"  tick={{ fill: '#52525b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatNum} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#52525b', fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip content={<CustomTooltip />} />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="views"
                stroke="#a855f7"
                fill="url(#viewsGrad)"
                strokeWidth={2}
                name="Views"
                dot={false}
                activeDot={{ r: 5, fill: '#a855f7', stroke: '#a855f7', strokeWidth: 2, filter: 'url(#purpleGlow)' }}
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="engagement"
                stroke="#06b6d4"
                fill="url(#engGrad)"
                strokeWidth={2}
                name="Engagement %"
                dot={false}
                activeDot={{ r: 5, fill: '#06b6d4', stroke: '#06b6d4', strokeWidth: 2, filter: 'url(#cyanGlow)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Platform breakdown pie */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Platforms</h2>
              <p className="text-[11px] text-text-muted">Views breakdown</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie
                data={platforms}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={72}
                paddingAngle={4}
                dataKey="views"
                strokeWidth={0}
              >
                {platforms.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0];
                  return (
                    <div className="glass-card-static px-3 py-2 !rounded-xl shadow-2xl !border-border-hover">
                      <p className="text-xs text-text-primary font-medium">{d.name}</p>
                      <p className="text-[11px] text-text-secondary tabular-nums">{formatNum(Number(d.value ?? 0))} views</p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2.5 mt-3">
            {platforms.map(p => {
              const total = platforms.reduce((a, b) => a + b.views, 0);
              const pct = total > 0 ? Math.round((p.views / total) * 100) : 0;
              return (
                <div key={p.name} className="flex items-center gap-3 text-xs">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-text-secondary flex-1">{p.name}</span>
                  <span className="text-text-muted tabular-nums">{pct}%</span>
                  <span className="text-text-primary font-medium tabular-nums">{formatNum(p.views)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Videos */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Video className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Top Performing Videos</h2>
            <p className="text-[11px] text-text-muted">Ranked by views</p>
          </div>
        </div>
        <div className="space-y-2">
          {topVideos.map((video, idx) => (
            <div key={video.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/[0.02] transition-colors group">
              <span className="text-lg font-bold text-text-muted w-6 tabular-nums">#{idx + 1}</span>
              {video.thumbnail ? (
                <img src={video.thumbnail} alt={video.title} className="w-16 h-9 rounded-lg object-cover ring-1 ring-border-subtle" />
              ) : (
                <div className="w-16 h-9 rounded-lg bg-surface-2 flex items-center justify-center ring-1 ring-border-subtle">
                  <Video className="w-4 h-4 text-text-muted" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate group-hover:text-white transition-colors">{video.title}</p>
                <p className="text-[11px] text-text-muted">{video.platform} · {video.style}</p>
              </div>
              <div className="text-sm font-bold gradient-text tabular-nums">{formatNum(video.views)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
