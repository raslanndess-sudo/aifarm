'use client';
import { useState, useEffect, useCallback } from 'react';
import { Save, Eye, EyeOff, CheckCircle, AlertTriangle } from 'lucide-react';
import NoSignal from '@/components/NoSignal';

const STYLES = ['Anime', 'Cyberpunk', 'Realistic', 'Ghibli', 'Seinen', 'Mecha'] as const;

interface SettingsData {
  [key: string]: string;
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [klingApiKey, setKlingApiKey] = useState('');
  const [klingApiSecret, setKlingApiSecret] = useState('');
  const [leonardoApiKey, setLeonardoApiKey] = useState('');
  const [defaultStyle, setDefaultStyle] = useState('Anime');
  const [defaultAspect, setDefaultAspect] = useState('16:9');
  const [autoGenerate, setAutoGenerate] = useState(false);

  const [showKlingKey, setShowKlingKey] = useState(false);
  const [showKlingSecret, setShowKlingSecret] = useState(false);
  const [showLeonardoKey, setShowLeonardoKey] = useState(false);

  const [savingKeys, setSavingKeys] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savedKeys, setSavedKeys] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [providerMode, setProviderMode] = useState<'api' | 'higgsfield'>('api');
  const [imageProvider, setImageProviderState] = useState('leonardo');
  const [videoProvider, setVideoProviderState] = useState('kling-direct');

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to fetch');
      const data: SettingsData = await res.json();
      setSettings(data);
      setKlingApiKey(data.kling_api_key ?? '');
      setKlingApiSecret(data.kling_api_secret ?? '');
      setLeonardoApiKey(data.leonardo_api_key ?? '');
      setDefaultStyle(data.default_style ?? 'Anime');
      setDefaultAspect(data.default_aspect ?? '16:9');
      setAutoGenerate(data.auto_generate === 'true');
      setProviderMode((data.provider_mode as 'api' | 'higgsfield') ?? 'api');
      if (data.image_provider) setImageProviderState(data.image_provider);
      if (data.video_provider) setVideoProviderState(data.video_provider);
      try {
        const authRes = await fetch('/api/auth/check');
        const authData = await authRes.json();
        setIsAdmin(authData.authenticated === true);
      } catch { /* not admin */ }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const patchSetting = async (key: string, value: string) => {
    await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
  };

  const handleProviderChange = async (value: 'api' | 'higgsfield') => {
    setProviderMode(value);
    await patchSetting('provider_mode', value);
  };

  const emergencyStop = async () => {
    if (!confirm('Stop all Higgsfield operations?')) return;
    await fetch('/api/emergency-stop', { method: 'POST' });
    setProviderMode('api');
  };

  const PROVIDER_META: Record<string, { name: string; desc: string; price: string }> = {
    'leonardo':      { name: 'Leonardo',       desc: 'Phoenix / Flux / Anime — character refs',  price: '4 tokens / img' },
    'nano-banana':   { name: 'Nano Banana',    desc: 'Gemini Flash Image (preview)',             price: '4 tokens / img' },
    'nano-banana-2': { name: 'Nano Banana 2',  desc: 'Gemini Flash Image (latest)',              price: '4 tokens / img' },
    'imagen-3-fast': { name: 'Imagen 3 Fast',  desc: 'Google fast/cheap',                        price: '2 tokens / img' },
    'imagen-3':      { name: 'Imagen 3',       desc: 'Google standard quality',                  price: '4 tokens / img' },
  };

  const updateImageProvider = async (value: string) => {
    setImageProviderState(value);
    await patchSetting('image_provider', value);
  };

  // Verified May 2026 against fal.ai live pages. 100 tokens = $1.
  const VIDEO_PROVIDER_META: Record<string, { name: string; desc: string; price: string }> = {
    'kling-direct':              { name: 'Kling Direct',          desc: 'Direct REST API — your existing balance',          price: '20 tokens / 5s' },
    'fal-kling-3-0':             { name: 'Kling 3.0 Standard',    desc: '$0.084/s · cinematic, audio off',                  price: '42 tokens / 5s' },
    'fal-kling-3-0-audio':       { name: 'Kling 3.0 + audio',     desc: '$0.126/s · with native audio',                     price: '63 tokens / 5s' },
    'fal-kling-2-6-pro':         { name: 'Kling 2.6 Pro',         desc: '$0.07/s · pro quality, no audio',                  price: '35 tokens / 5s' },
    'fal-kling-2-6-pro-audio':   { name: 'Kling 2.6 Pro + audio', desc: '$0.14/s · with native audio',                      price: '70 tokens / 5s' },
    'fal-kling-2-5-pro':         { name: 'Kling 2.5 Turbo Pro',   desc: '$0.07/s · fast, balanced',                         price: '35 tokens / 5s' },
    'fal-luma-ray-2':            { name: 'Luma Ray-2',            desc: '$0.10/s · photoreal physics, 540p',                price: '50 tokens / 5s' },
    'fal-minimax-hailuo':        { name: 'Hailuo 02 Fast',        desc: '$0.017/s · cheapest, 512P stylized',               price: '9 tokens / 5s' },
  };

  const updateVideoProvider = async (value: string) => {
    setVideoProviderState(value);
    await patchSetting('video_provider', value);
  };

  const saveApiKeys = async () => {
    setSavingKeys(true); setSavedKeys(false);
    try {
      await Promise.all([patchSetting('kling_api_key', klingApiKey), patchSetting('kling_api_secret', klingApiSecret), patchSetting('leonardo_api_key', leonardoApiKey)]);
      setSavedKeys(true); setTimeout(() => setSavedKeys(false), 2000);
    } finally { setSavingKeys(false); }
  };

  const savePreferences = async () => {
    setSavingPrefs(true); setSavedPrefs(false);
    try {
      await Promise.all([patchSetting('default_style', defaultStyle), patchSetting('default_aspect', defaultAspect), patchSetting('auto_generate', String(autoGenerate))]);
      setSavedPrefs(true); setTimeout(() => setSavedPrefs(false), 2000);
    } finally { setSavingPrefs(false); }
  };

  if (loading) return <NoSignal isLoading />;
  if (error || !settings) return <NoSignal title="No Signal" message="Failed to load settings" onRetry={fetchSettings} />;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <span className="section-label block mb-3">Studio &middot; Configuration</span>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '48px', lineHeight: 0.95, letterSpacing: '-0.03em', color: '#f5e6d3' }}>
          The <em style={{ color: '#ff3344', fontStyle: 'italic' }}>configuration</em>.
        </h1>
      </div>

      {/* Section 01: Provider (admin only) */}
      {isAdmin && (
        <section className="pb-10 mb-10" style={{ borderBottom: '1px solid rgba(245,230,211,0.08)' }}>
          <span className="section-label block mb-2">01 &middot; Provider</span>
          <h2 className="mb-6" style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '28px', color: '#f5e6d3' }}>
            Generation <em style={{ color: '#ff3344', fontStyle: 'italic' }}>backend</em>
          </h2>
          <div className="mb-4">
            <label className="section-label block mb-2">Provider</label>
            <select value={providerMode} onChange={(e) => handleProviderChange(e.target.value as 'api' | 'higgsfield')} className="input-inline cursor-pointer" style={{ width: '100%', maxWidth: '300px', padding: '10px 0', fontSize: '14px' }}>
              <option value="api">Kling API</option>
              <option value="higgsfield">Higgsfield (Unlimited)</option>
            </select>
          </div>
          {providerMode === 'higgsfield' && (
            <button onClick={emergencyStop} className="btn-ghost mt-2" style={{ borderColor: 'rgba(255,51,68,0.3)', color: '#ff3344' }}>
              <AlertTriangle className="w-4 h-4" /> Emergency Stop
            </button>
          )}
        </section>
      )}

      {/* Section: Image Generation */}
      {isAdmin && (
        <section className="pb-10 mb-10" style={{ borderBottom: '1px solid rgba(245,230,211,0.08)' }}>
          <span className="section-label block mb-2">02 &middot; Image Generation</span>
          <h2 className="mb-2" style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '28px', color: '#f5e6d3' }}>
            Default image <em style={{ color: '#ff3344', fontStyle: 'italic' }}>generator</em>
          </h2>
          <p className="mb-1" style={{ fontFamily: "'Fraunces', serif", fontSize: '13px', fontStyle: 'italic', color: 'rgba(245,230,211,0.45)' }}>
            Provider for AI image generation. Higgsfield mode ignores this.
          </p>
          <p className="mb-6" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(245,230,211,0.3)' }}>
            Default for new generations &middot; Override per-run in Studio
          </p>

          <div className="reel-provider-grid">
            {(['leonardo', 'nano-banana', 'nano-banana-2', 'imagen-3-fast', 'imagen-3'] as const).map(p => {
              const meta = PROVIDER_META[p];
              const active = imageProvider === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => updateImageProvider(p)}
                  aria-pressed={active}
                  className={`reel-provider-card ${active ? 'active' : ''}`}
                >
                  <div className="reel-provider-name">{meta.name}</div>
                  <div className="reel-provider-desc">{meta.desc}</div>
                  <div className="reel-provider-price">{meta.price}</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Section: Video Generation */}
      {isAdmin && (
        <section className="pb-10 mb-10" style={{ borderBottom: '1px solid rgba(245,230,211,0.08)' }}>
          <span className="section-label block mb-2">03 &middot; Video Generation</span>
          <h2 className="mb-2" style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '28px', color: '#f5e6d3' }}>
            Default video <em style={{ color: '#ff3344', fontStyle: 'italic' }}>engine</em>
          </h2>
          <p className="mb-1" style={{ fontFamily: "'Fraunces', serif", fontSize: '13px', fontStyle: 'italic', color: 'rgba(245,230,211,0.45)' }}>
            Provider for image-to-video animation. Higgsfield mode ignores this.
          </p>
          <p className="mb-6" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(245,230,211,0.3)' }}>
            Default for new generations &middot; Override per-run in Studio
          </p>

          <div className="reel-provider-grid">
            {(['kling-direct', 'fal-kling-3-0', 'fal-kling-3-0-audio', 'fal-kling-2-6-pro', 'fal-kling-2-6-pro-audio', 'fal-kling-2-5-pro', 'fal-luma-ray-2', 'fal-minimax-hailuo'] as const).map(p => {
              const meta = VIDEO_PROVIDER_META[p];
              const active = videoProvider === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => updateVideoProvider(p)}
                  aria-pressed={active}
                  className={`reel-provider-card ${active ? 'active' : ''}`}
                >
                  <div className="reel-provider-name">{meta.name}</div>
                  <div className="reel-provider-desc">{meta.desc}</div>
                  <div className="reel-provider-price">{meta.price}</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Section: API Keys */}
      <section className="pb-10 mb-10" style={{ borderBottom: '1px solid rgba(245,230,211,0.08)' }}>
        <span className="section-label block mb-2">{isAdmin ? '04' : '01'} &middot; API Keys</span>
        <h2 className="mb-6" style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '28px', color: '#f5e6d3' }}>
          Your <em style={{ color: '#ff3344', fontStyle: 'italic' }}>credentials</em>
        </h2>

        <div className="flex flex-col gap-5">
          {[
            { label: 'Kling API Key', value: klingApiKey, onChange: setKlingApiKey, show: showKlingKey, setShow: setShowKlingKey, placeholder: 'Enter Kling API key' },
            { label: 'Kling API Secret', value: klingApiSecret, onChange: setKlingApiSecret, show: showKlingSecret, setShow: setShowKlingSecret, placeholder: 'Enter Kling API secret' },
            { label: 'Leonardo API Key', value: leonardoApiKey, onChange: setLeonardoApiKey, show: showLeonardoKey, setShow: setShowLeonardoKey, placeholder: 'Enter Leonardo API key' },
          ].map(field => (
            <div key={field.label}>
              <label className="section-label block mb-2">{field.label}</label>
              <div className="relative">
                <input
                  type={field.show ? 'text' : 'password'}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder={field.placeholder}
                  className="input-inline w-full"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => field.setShow(!field.show)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center cursor-pointer transition-colors duration-200"
                  style={{ background: 'transparent', border: 'none', color: 'rgba(245,230,211,0.3)' }}
                  aria-label={field.show ? `Hide ${field.label}` : `Show ${field.label}`}
                >
                  {field.show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button onClick={saveApiKeys} disabled={savingKeys} className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed" style={{ fontSize: '14px', padding: '12px 24px' }}>
            <Save className="w-4 h-4" /> {savingKeys ? 'Saving...' : 'Save Keys'}
          </button>
          {savedKeys && (
            <span className="flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', serif", fontSize: '12px', fontStyle: 'italic', color: '#88a584' }}>
              <CheckCircle className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </section>

      {/* Section 03: Account */}
      <section className="pb-10 mb-10" style={{ borderBottom: '1px solid rgba(245,230,211,0.08)' }}>
        <span className="section-label block mb-2">{isAdmin ? '05' : '02'} &middot; Account</span>
        <h2 className="mb-6" style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '28px', color: '#f5e6d3' }}>
          Your <em style={{ color: '#ff3344', fontStyle: 'italic' }}>account</em>
        </h2>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Current Plan', value: settings.plan ?? 'Free' },
            { label: 'Balance', value: `${Number(settings.balance ?? 0).toLocaleString()} credits` },
            { label: 'Renewal Date', value: settings.renewDate ?? 'N/A' },
          ].map(item => (
            <div key={item.label}>
              <label className="section-label block mb-2">{item.label}</label>
              <div className="glass-card px-5 py-3">
                <span style={{ fontFamily: "'Fraunces', serif", fontSize: '14px', color: 'rgba(245,230,211,0.7)' }}>{item.value}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 04: Preferences */}
      <section className="pb-10 mb-10" style={{ borderBottom: '1px solid rgba(245,230,211,0.08)' }}>
        <span className="section-label block mb-2">{isAdmin ? '06' : '03'} &middot; Preferences</span>
        <h2 className="mb-6" style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '28px', color: '#f5e6d3' }}>
          Default <em style={{ color: '#ff3344', fontStyle: 'italic' }}>settings</em>
        </h2>

        <div className="flex flex-col gap-6">
          {/* Default Style */}
          <div>
            <label className="section-label block mb-2">Default Style</label>
            <div className="flex gap-2 flex-wrap">
              {STYLES.map(s => (
                <button key={s} onClick={() => setDefaultStyle(s)} className={`reel-chip ${defaultStyle === s ? 'active' : ''}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="section-label block mb-2">Default Aspect Ratio</label>
            <div className="flex gap-2">
              {(['16:9', '9:16'] as const).map(ratio => (
                <button key={ratio} onClick={() => setDefaultAspect(ratio)} className={`reel-chip ${defaultAspect === ratio ? 'active' : ''}`}>
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-generate */}
          <div className="flex items-center justify-between py-2">
            <div>
              <label className="section-label block">Auto-generate Video</label>
              <p style={{ fontFamily: "'Fraunces', serif", fontSize: '12px', fontStyle: 'italic', color: 'rgba(245,230,211,0.45)', marginTop: '4px' }}>
                Automatically generate video after scene images are ready
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoGenerate}
              aria-label={`Auto-generate ${autoGenerate ? 'on' : 'off'}`}
              onClick={() => setAutoGenerate(!autoGenerate)}
              className={`reel-toggle ${autoGenerate ? 'on' : 'off'}`}
            >
              <span className="reel-toggle-knob" />
              <span className="reel-toggle-state">{autoGenerate ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button onClick={savePreferences} disabled={savingPrefs} className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed" style={{ fontSize: '14px', padding: '12px 24px' }}>
            <Save className="w-4 h-4" /> {savingPrefs ? 'Saving...' : 'Save Preferences'}
          </button>
          {savedPrefs && (
            <span className="flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', serif", fontSize: '12px', fontStyle: 'italic', color: '#88a584' }}>
              <CheckCircle className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
