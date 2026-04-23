'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Smartphone, Wifi, AlertCircle, Loader2, Battery, Plus, Trash2, Send, Zap } from 'lucide-react';
import type { Device } from '@/lib/types';
import NoSignal from '@/components/NoSignal';

type Status = Device['status'];
type Platform = Device['platform'];

const STATUS_CONFIG: Record<Status, { label: string; dotClass: string; textColor: string; glowClass: string }> = {
  idle:     { label: 'Idle',     dotClass: 'bg-zinc-500',   textColor: 'text-text-muted',     glowClass: '' },
  posting:  { label: 'Posting',  dotClass: 'bg-green-400',  textColor: 'text-green-400',  glowClass: 'pulse-glow-green' },
  cooldown: { label: 'Cooldown', dotClass: 'bg-yellow-400', textColor: 'text-yellow-400', glowClass: 'pulse-glow-yellow' },
  error:    { label: 'Error',    dotClass: 'bg-red-400',    textColor: 'text-red-400',    glowClass: 'pulse-glow-red' },
};

const PLATFORM_BADGE: Record<string, string> = {
  TikTok: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  Reels:  'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Shorts: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const PLATFORMS: Platform[] = ['TikTok', 'Reels', 'Shorts'];

function BatteryBar({ level }: { level: number }) {
  const color = level > 50
    ? 'from-green-500 to-emerald-400'
    : level > 20
      ? 'from-yellow-500 to-amber-400'
      : 'from-red-500 to-red-400';
  return (
    <div className="flex items-center gap-2">
      <Battery className={`w-3.5 h-3.5 ${level > 50 ? 'text-green-500' : level > 20 ? 'text-yellow-500' : 'text-red-500'}`} />
      <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`}
          style={{ width: `${level}%` }}
        />
      </div>
      <span className="text-[10px] text-text-muted w-7 text-right tabular-nums">{level}%</span>
    </div>
  );
}

function AddDeviceForm({ onAdd, onCancel }: { onAdd: (d: Device) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<Platform>('TikTok');
  const [account, setAccount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), platform, account: account.trim() || null }),
      });
      if (!res.ok) throw new Error('Failed to create device');
      const device: Device = await res.json();
      onAdd(device);
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-5 space-y-3">
      <div className="text-xs font-semibold text-text-primary">New Device</div>
      <input
        type="text"
        placeholder="Device name"
        value={name}
        onChange={e => setName(e.target.value)}
        required
        className="w-full input-field px-3 py-2 text-xs"
      />
      <select
        value={platform}
        onChange={e => setPlatform(e.target.value as Platform)}
        className="w-full input-field px-3 py-2 text-xs appearance-none cursor-pointer"
      >
        {PLATFORMS.map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Account (optional)"
        value={account}
        onChange={e => setAccount(e.target.value)}
        className="w-full input-field px-3 py-2 text-xs"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="flex-1 py-2 rounded-xl btn-primary text-xs font-medium"
        >
          {submitting ? 'Adding...' : 'Add Device'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl btn-ghost text-xs"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function PhoneFarm() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/devices');
      if (!res.ok) throw new Error('Failed to fetch');
      const data: Device[] = await res.json();
      setDevices(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(t => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const addTimer = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  const updateDevice = useCallback((id: number, patch: Partial<Device>) => {
    setDevices(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const handlePost = useCallback(async (device: Device) => {
    updateDevice(device.id, { status: 'posting' });
    await fetch(`/api/devices/${device.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'posting' }),
    });

    addTimer(async () => {
      const newPostsToday = device.posts_today + 1;
      const lastPost = new Date().toISOString();
      updateDevice(device.id, { status: 'cooldown', posts_today: newPostsToday, last_post: lastPost });
      await fetch(`/api/devices/${device.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cooldown', posts_today: newPostsToday, last_post: lastPost }),
      });

      addTimer(async () => {
        updateDevice(device.id, { status: 'idle' });
        await fetch(`/api/devices/${device.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'idle' }),
        });
      }, 30_000);
    }, 10_000);

    await fetch('/api/billing/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: `Post via ${device.name} to ${device.platform}`,
        amount: 50,
        type: 'debit',
      }),
    });

    const today = new Date().toISOString().slice(0, 10);
    const randomViews = Math.floor(Math.random() * 5000) + 500;
    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: today,
        platform: device.platform,
        views: randomViews,
        followers: Math.floor(Math.random() * 50),
        engagement: Math.round((Math.random() * 8 + 1) * 100) / 100,
      }),
    }).catch(() => {});

    try {
      const vRes = await fetch('/api/videos?status=complete');
      const vData: { videos: { id: number }[] } = await vRes.json();
      if (vData.videos?.length > 0) {
        const pick = vData.videos[Math.floor(Math.random() * vData.videos.length)];
        await fetch(`/api/videos/${pick.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ views: randomViews }),
        });
      }
    } catch { /* non-critical */ }
  }, [updateDevice, addTimer]);

  const handleDelete = useCallback(async (id: number) => {
    setDevices(prev => prev.filter(d => d.id !== id));
    await fetch(`/api/devices/${id}`, { method: 'DELETE' });
  }, []);

  const handleAddDevice = useCallback((device: Device) => {
    setDevices(prev => [...prev, device]);
    setShowAddForm(false);
  }, []);

  if (loading) return <NoSignal isLoading />;
  if (error) return <NoSignal title="No Signal" message="Failed to load phone farm" onRetry={fetchDevices} />;

  const activeCount = devices.filter(d => d.status === 'posting').length;
  const errorCount = devices.filter(d => d.status === 'error').length;
  const postsToday = devices.reduce((a, d) => a + d.posts_today, 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Devices', value: devices.length, icon: Smartphone, iconBg: 'bg-purple-500/10', iconColor: 'text-purple-400' },
          { label: 'Active Now',    value: activeCount,     icon: Zap,       iconBg: 'bg-green-500/10',  iconColor: 'text-green-400' },
          { label: 'Posts Today',   value: postsToday,      icon: Send,      iconBg: 'bg-cyan-500/10',   iconColor: 'text-cyan-400' },
          { label: 'Errors',        value: errorCount,      icon: AlertCircle, iconBg: 'bg-red-500/10',  iconColor: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="glass-card p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center`}>
              <s.icon className={`w-5 h-5 ${s.iconColor}`} />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary tabular-nums">{s.value}</div>
              <div className="section-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Add device button */}
      <button
        onClick={() => setShowAddForm(prev => !prev)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-sm"
      >
        <Plus className="w-4 h-4" />
        Add Device
      </button>

      {/* Device grid */}
      <div className="grid grid-cols-4 gap-4">
        {showAddForm && (
          <AddDeviceForm onAdd={handleAddDevice} onCancel={() => setShowAddForm(false)} />
        )}

        {devices.map(device => {
          const { label, dotClass, textColor, glowClass } = STATUS_CONFIG[device.status];
          const isBusy = device.status === 'posting' || device.status === 'cooldown';
          const platformBadge = PLATFORM_BADGE[device.platform] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';

          return (
            <div key={device.id} className="glass-card overflow-hidden group relative">
              {/* Phone frame notch */}
              <div className="h-1 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent mx-8 rounded-b-full" />

              <div className="p-5 space-y-3">
                {/* Delete button */}
                <button
                  onClick={() => void handleDelete(device.id)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-all"
                  title="Delete device"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-border-subtle flex items-center justify-center">
                      <Smartphone className="w-5 h-5 text-text-tertiary" />
                    </div>
                    {/* Status LED */}
                    <span className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-0 ${dotClass} ${glowClass}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{device.name}</div>
                    <span className={`badge text-[10px] mt-0.5 ${platformBadge}`}>{device.platform}</span>
                  </div>
                </div>

                {/* Account */}
                <div className="text-xs text-text-muted truncate">{device.account}</div>

                {/* Status */}
                <div className={`flex items-center gap-2 text-xs font-medium ${textColor}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                  {label}
                  {device.status === 'posting' && (
                    <Loader2 className="w-3 h-3 animate-spin ml-auto" />
                  )}
                </div>

                {/* Battery */}
                <BatteryBar level={device.battery} />

                {/* Posts info */}
                <div className="flex justify-between text-[10px] text-text-muted">
                  <span className="tabular-nums">{device.posts_today} posts today</span>
                  <span>{device.last_post ?? ''}</span>
                </div>

                {/* Post Now button */}
                {device.status === 'idle' ? (
                  <button
                    onClick={() => void handlePost(device)}
                    className="w-full py-2 rounded-xl btn-primary text-xs font-medium flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3 h-3" />
                    Post Now
                  </button>
                ) : isBusy ? (
                  <button
                    disabled
                    className="w-full py-2 rounded-xl bg-white/[0.03] border border-border-subtle text-xs font-medium text-text-muted flex items-center justify-center gap-1.5 cursor-not-allowed"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {device.status === 'posting' ? 'Posting...' : 'Cooldown...'}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
