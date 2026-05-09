'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Smartphone, AlertCircle, Loader2, Battery, Plus, Trash2, Send, Zap } from 'lucide-react';
import type { Device } from '@/lib/types';
import NoSignal from '@/components/NoSignal';

type Status = Device['status'];
type Platform = Device['platform'];

const STATUS_LABEL: Record<Status, { label: string; color: string }> = {
  idle:     { label: 'Idle',     color: 'rgba(245,230,211,0.45)' },
  posting:  { label: 'Posting',  color: '#88a584' },
  cooldown: { label: 'Cooldown', color: '#c9a86a' },
  error:    { label: 'Error',    color: '#ff3344' },
};

const PLATFORMS: Platform[] = ['TikTok', 'Reels', 'Shorts'];

function BatteryBar({ level }: { level: number }) {
  const color = level > 50 ? '#88a584' : level > 20 ? '#c9a86a' : '#ff3344';
  return (
    <div className="flex items-center gap-2">
      <Battery className="w-3.5 h-3.5" style={{ color }} />
      <div className="flex-1 h-1" style={{ background: 'rgba(245,230,211,0.04)' }}>
        <div className="h-full transition-all duration-500" style={{ width: `${level}%`, background: color }} />
      </div>
      <span className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)', width: '28px', textAlign: 'right' }}>{level}%</span>
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
    <form onSubmit={handleSubmit} className="glass-card p-6">
      <span className="section-label block mb-4">New Device</span>
      <input type="text" placeholder="Device name" value={name} onChange={e => setName(e.target.value)} required className="input-field w-full mb-3" style={{ padding: '10px 16px', fontSize: '13px' }} />
      <select value={platform} onChange={e => setPlatform(e.target.value as Platform)} className="input-inline w-full mb-3 cursor-pointer" style={{ padding: '8px 0', fontSize: '13px' }}>
        {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <input type="text" placeholder="Account (optional)" value={account} onChange={e => setAccount(e.target.value)} className="input-field w-full mb-4" style={{ padding: '10px 16px', fontSize: '13px' }} />
      <div className="flex gap-3">
        <button type="submit" disabled={submitting || !name.trim()} className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed" style={{ fontSize: '13px', padding: '10px 20px' }}>
          {submitting ? 'Adding...' : 'Add Device'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
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

  useEffect(() => { void fetchDevices(); }, [fetchDevices]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(t => clearTimeout(t)); timers.clear(); };
  }, []);

  const addTimer = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => { timersRef.current.delete(id); fn(); }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  const updateDevice = useCallback((id: number, patch: Partial<Device>) => {
    setDevices(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const handlePost = useCallback(async (device: Device) => {
    updateDevice(device.id, { status: 'posting' });
    await fetch(`/api/devices/${device.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'posting' }) });

    addTimer(async () => {
      const newPostsToday = device.posts_today + 1;
      const lastPost = new Date().toISOString();
      updateDevice(device.id, { status: 'cooldown', posts_today: newPostsToday, last_post: lastPost });
      await fetch(`/api/devices/${device.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cooldown', posts_today: newPostsToday, last_post: lastPost }) });
      addTimer(async () => {
        updateDevice(device.id, { status: 'idle' });
        await fetch(`/api/devices/${device.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'idle' }) });
      }, 30_000);
    }, 10_000);

    await fetch('/api/billing/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: `Post via ${device.name} to ${device.platform}`, amount: 50, type: 'debit' }) });

    const today = new Date().toISOString().slice(0, 10);
    const randomViews = Math.floor(Math.random() * 5000) + 500;
    await fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: today, platform: device.platform, views: randomViews, followers: Math.floor(Math.random() * 50), engagement: Math.round((Math.random() * 8 + 1) * 100) / 100 }) }).catch(() => {});

    try {
      const vRes = await fetch('/api/videos?status=complete');
      const vData: { videos: { id: number }[] } = await vRes.json();
      if (vData.videos?.length > 0) {
        const pick = vData.videos[Math.floor(Math.random() * vData.videos.length)];
        await fetch(`/api/videos/${pick.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ views: randomViews }) });
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
    <div>
      {/* Header */}
      <div className="mb-10">
        <span className="section-label block mb-3">Operations &middot; Devices</span>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '48px', lineHeight: 0.95, letterSpacing: '-0.03em', color: '#f5e6d3' }}>
          Phone <em style={{ color: '#ff3344', fontStyle: 'italic' }}>farm</em>.
        </h1>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Devices', value: devices.length, icon: Smartphone },
          { label: 'Active Now',    value: activeCount,     icon: Zap },
          { label: 'Posts Today',   value: postsToday,      icon: Send },
          { label: 'Errors',        value: errorCount,      icon: AlertCircle },
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

      {/* Add device button */}
      <button
        onClick={() => setShowAddForm(prev => !prev)}
        className="btn-ghost mb-6"
      >
        <Plus className="w-4 h-4" /> Add Device
      </button>

      {/* Add form */}
      {showAddForm && (
        <div className="mb-6 max-w-md">
          <AddDeviceForm onAdd={handleAddDevice} onCancel={() => setShowAddForm(false)} />
        </div>
      )}

      {/* Device list — horizontal strip cards */}
      <div className="flex flex-col gap-1">
        {devices.map(device => {
          const { label, color } = STATUS_LABEL[device.status];
          const isBusy = device.status === 'posting' || device.status === 'cooldown';
          const isActive = device.status === 'posting';
          return (
            <div
              key={device.id}
              className="glass-card group flex items-center gap-5 px-6 py-4 transition-all duration-200"
              style={isActive ? { borderLeft: '2px solid #ff3344', background: 'rgba(255,51,68,0.04)' } : {}}
            >
              {/* Device name + platform */}
              <div className="flex-1 min-w-0 flex items-center gap-4">
                <Smartphone className="w-5 h-5 shrink-0" style={{ color: 'rgba(245,230,211,0.18)' }} />
                <div className="min-w-0">
                  <span style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '18px', color: '#f5e6d3', display: 'block' }} className="truncate">{device.name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(245,230,211,0.3)' }}>
                    {device.platform} {device.account ? `· ${device.account}` : ''}
                  </span>
                </div>
              </div>

              {/* Status badge */}
              <span className="badge shrink-0" style={{ borderColor: color, color }}>
                {device.status === 'posting' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                {label}
              </span>

              {/* Battery */}
              <div className="w-32 shrink-0">
                <BatteryBar level={device.battery} />
              </div>

              {/* Posts today */}
              <span className="tabular-nums shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)', letterSpacing: '0.1em', width: '80px', textAlign: 'right' }}>
                {device.posts_today} posts
              </span>

              {/* Actions */}
              <div className="flex gap-2 shrink-0">
                {device.status === 'idle' && (
                  <button onClick={() => void handlePost(device)} className="btn-primary" style={{ fontSize: '11px', padding: '8px 16px' }}>
                    <Send className="w-3 h-3" /> Post
                  </button>
                )}
                {isBusy && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {device.status === 'posting' ? 'Posting...' : 'Cooldown'}
                  </span>
                )}
                <button
                  onClick={() => void handleDelete(device.id)}
                  className="w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                  style={{ border: '1px solid rgba(245,230,211,0.12)', background: 'transparent' }}
                  title="Delete device"
                  aria-label={`Delete ${device.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" style={{ color: 'rgba(245,230,211,0.3)' }} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {devices.length === 0 && !showAddForm && (
        <div className="flex flex-col items-center justify-center py-20">
          <Smartphone className="w-12 h-12 mb-4" style={{ color: 'rgba(245,230,211,0.12)' }} />
          <h3 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '24px', color: 'rgba(245,230,211,0.45)' }}>
            No devices. <em style={{ color: '#ff3344', fontStyle: 'italic' }}>Add</em> one.
          </h3>
        </div>
      )}
    </div>
  );
}
