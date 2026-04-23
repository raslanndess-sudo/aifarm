'use client';
import { useState, useEffect, useCallback } from 'react';
import { Key, User, Sliders, Save, Eye, EyeOff, CheckCircle, Server, AlertTriangle } from 'lucide-react';
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

      // Check admin
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

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const patchSetting = async (key: string, value: string) => {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
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

  const saveApiKeys = async () => {
    setSavingKeys(true);
    setSavedKeys(false);
    try {
      await Promise.all([
        patchSetting('kling_api_key', klingApiKey),
        patchSetting('kling_api_secret', klingApiSecret),
        patchSetting('leonardo_api_key', leonardoApiKey),
      ]);
      setSavedKeys(true);
      setTimeout(() => setSavedKeys(false), 2000);
    } finally {
      setSavingKeys(false);
    }
  };

  const savePreferences = async () => {
    setSavingPrefs(true);
    setSavedPrefs(false);
    try {
      await Promise.all([
        patchSetting('default_style', defaultStyle),
        patchSetting('default_aspect', defaultAspect),
        patchSetting('auto_generate', String(autoGenerate)),
      ]);
      setSavedPrefs(true);
      setTimeout(() => setSavedPrefs(false), 2000);
    } finally {
      setSavingPrefs(false);
    }
  };

  if (loading) return <NoSignal isLoading />;
  if (error || !settings) return <NoSignal title="No Signal" message="Failed to load settings" onRetry={fetchSettings} />;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Generation Provider — admin only */}
      {isAdmin && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Server className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Generation Provider</h2>
              <p className="text-[11px] text-text-muted">Select the video generation backend</p>
            </div>
          </div>

          <div>
            <label className="section-label block mb-2">Provider</label>
            <select
              value={providerMode}
              onChange={(e) => handleProviderChange(e.target.value as 'api' | 'higgsfield')}
              className="w-full input-field px-4 py-2.5 text-sm appearance-none cursor-pointer"
            >
              <option value="api">Kling API</option>
              <option value="higgsfield">Higgsfield (Unlimited)</option>
            </select>
          </div>

          {providerMode === 'higgsfield' && (
            <button
              onClick={emergencyStop}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              Emergency Stop
            </button>
          )}
        </div>
      )}

      {/* API Keys */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Key className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">API Keys</h2>
            <p className="text-[11px] text-text-muted">Manage your external service credentials</p>
          </div>
        </div>

        <div className="space-y-4">
          {[
            { label: 'Kling API Key', value: klingApiKey, onChange: setKlingApiKey, show: showKlingKey, setShow: setShowKlingKey, placeholder: 'Enter your Kling API key' },
            { label: 'Kling API Secret', value: klingApiSecret, onChange: setKlingApiSecret, show: showKlingSecret, setShow: setShowKlingSecret, placeholder: 'Enter your Kling API secret' },
            { label: 'Leonardo API Key', value: leonardoApiKey, onChange: setLeonardoApiKey, show: showLeonardoKey, setShow: setShowLeonardoKey, placeholder: 'Enter your Leonardo API key' },
          ].map(field => (
            <div key={field.label}>
              <label className="section-label block mb-2">{field.label}</label>
              <div className="relative">
                <input
                  type={field.show ? 'text' : 'password'}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full input-field px-4 py-2.5 text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => field.setShow(!field.show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {field.show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={saveApiKeys}
            disabled={savingKeys}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-primary text-sm font-medium"
          >
            <Save className="w-4 h-4" />
            {savingKeys ? 'Saving...' : 'Save API Keys'}
          </button>
          {savedKeys && (
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle className="w-3.5 h-3.5" />
              Saved successfully
            </span>
          )}
        </div>
      </div>

      {/* Account */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <User className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Account</h2>
            <p className="text-[11px] text-text-muted">Your plan and billing information</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Current Plan', value: settings.plan ?? 'Free' },
            { label: 'Balance', value: `${Number(settings.balance ?? 0).toLocaleString()} credits` },
            { label: 'Renewal Date', value: settings.renewDate ?? 'N/A' },
          ].map(item => (
            <div key={item.label}>
              <label className="section-label block mb-2">{item.label}</label>
              <div className="bg-white/[0.03] border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-secondary">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preferences */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <Sliders className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Preferences</h2>
            <p className="text-[11px] text-text-muted">Default generation settings</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Default Style */}
          <div>
            <label className="section-label block mb-2">Default Style</label>
            <select
              value={defaultStyle}
              onChange={(e) => setDefaultStyle(e.target.value)}
              className="w-full input-field px-4 py-2.5 text-sm appearance-none cursor-pointer"
            >
              {STYLES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Aspect Ratio Toggle */}
          <div>
            <label className="section-label block mb-2">Default Aspect Ratio</label>
            <div className="flex gap-2">
              {(['16:9', '9:16'] as const).map(ratio => (
                <button
                  key={ratio}
                  onClick={() => setDefaultAspect(ratio)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    defaultAspect === ratio
                      ? 'btn-primary'
                      : 'bg-white/[0.03] border border-border-subtle text-text-muted hover:text-text-secondary hover:border-border-hover'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-generate Toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <label className="text-xs text-text-secondary block font-medium">Auto-generate Video</label>
              <p className="text-[11px] text-text-muted mt-0.5">Automatically generate video after scene images are ready</p>
            </div>
            <button
              onClick={() => setAutoGenerate(!autoGenerate)}
              className={`relative w-11 h-6 rounded-full transition-all duration-200 ${
                autoGenerate ? 'bg-gradient-to-r from-purple-600 to-cyan-600 shadow-md shadow-purple-500/20' : 'bg-white/[0.08]'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  autoGenerate ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={savePreferences}
            disabled={savingPrefs}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-primary text-sm font-medium"
          >
            <Save className="w-4 h-4" />
            {savingPrefs ? 'Saving...' : 'Save Preferences'}
          </button>
          {savedPrefs && (
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle className="w-3.5 h-3.5" />
              Saved successfully
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
