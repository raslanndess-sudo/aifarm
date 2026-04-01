'use client';
import { useState } from 'react';
import { Wand2, Lock, Unlock, ChevronRight, Image, RefreshCw, CheckCircle } from 'lucide-react';

const STYLES = ['Anime', 'Cyberpunk', 'Realistic', 'Ghibli', 'Seinen', 'Mecha'] as const;
type Style = typeof STYLES[number];

interface Scene {
  id: string;
  prompt: string;
  imageUrl: string | null;
  useMasterChar: boolean;
  status: 'idle' | 'generating' | 'done';
}

function splitIntoScenes(script: string): string[] {
  return script
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export default function Studio() {
  const [script, setScript] = useState('');
  const [style, setStyle] = useState<Style>('Anime');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [masterCharDesc, setMasterCharDesc] = useState('');
  const [masterCharLocked, setMasterCharLocked] = useState(false);
  const [masterCharImage, setMasterCharImage] = useState<string | null>(null);
  const [isGeneratingHero, setIsGeneratingHero] = useState(false);

  const parseScenes = () => {
    const lines = splitIntoScenes(script);
    if (!lines.length) return;
    setScenes(lines.map((p, i) => ({
      id: `scene_${i}`,
      prompt: p,
      imageUrl: null,
      useMasterChar: masterCharLocked,
      status: 'idle',
    })));
  };

  const toggleUseMasterChar = (id: string) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, useMasterChar: !s.useMasterChar } : s));
  };

  const generateScene = async (scene: Scene) => {
    setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: 'generating' } : s));

    try {
      const res = await fetch('/api/cref/generate-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenePrompt: scene.prompt,
          style: style.toLowerCase(),
          ...(scene.useMasterChar && masterCharLocked && masterCharDesc
            ? { characterDescription: masterCharDesc, characterRefImageUrl: masterCharImage }
            : {}),
        }),
      });
      const data = await res.json();
      setScenes(prev => prev.map(s =>
        s.id === scene.id
          ? { ...s, imageUrl: data.imageUrl ?? null, status: 'done' }
          : s
      ));
    } catch {
      setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: 'idle' } : s));
    }
  };

  const generateHero = async () => {
    if (!masterCharDesc.trim()) return;
    setIsGeneratingHero(true);
    try {
      const res = await fetch('/api/cref/generate-hero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterDescription: masterCharDesc, style: style.toLowerCase(), name: 'Master Character' }),
      });
      const data = await res.json();
      if (data.imageUrl) setMasterCharImage(data.imageUrl);
    } finally {
      setIsGeneratingHero(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Script input */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-purple-400" />
          Script / Story
        </h2>
        <textarea
          value={script}
          onChange={e => setScript(e.target.value)}
          placeholder="Write your story here. Each line becomes a scene…&#10;&#10;Example:&#10;A young girl wakes up in a mysterious forest&#10;She discovers a glowing portal between ancient trees&#10;A spirit guardian appears to guide her path"
          className="w-full h-40 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 resize-none transition-all"
        />

        {/* Style selector */}
        <div className="flex flex-wrap gap-2 mt-4">
          {STYLES.map(s => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                style === s
                  ? 'bg-gradient-to-r from-purple-600 to-cyan-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={parseScenes}
          disabled={!script.trim()}
          className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <ChevronRight className="w-4 h-4" />
          Parse into Scenes
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Scene cards */}
        <div className="col-span-2 space-y-4">
          {scenes.length === 0 ? (
            <div className="glass-card p-12 flex flex-col items-center justify-center text-center">
              <Image className="w-12 h-12 text-zinc-700 mb-3" />
              <p className="text-zinc-600 text-sm">Write a script above and click "Parse into Scenes"</p>
            </div>
          ) : (
            scenes.map((scene, idx) => (
              <div key={scene.id} className="glass-card p-5 flex gap-4">
                {/* Thumbnail */}
                <div className="w-32 h-20 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
                  {scene.imageUrl ? (
                    <img src={scene.imageUrl} alt={`Scene ${idx + 1}`} className="w-full h-full object-cover" />
                  ) : scene.status === 'generating' ? (
                    <RefreshCw className="w-6 h-6 text-purple-400 animate-spin" />
                  ) : (
                    <Image className="w-6 h-6 text-zinc-600" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-zinc-500">Scene {idx + 1}</span>
                    {scene.status === 'done' && <CheckCircle className="w-3 h-3 text-green-400" />}
                  </div>
                  <p className="text-sm text-zinc-300 line-clamp-2">{scene.prompt}</p>

                  <div className="flex items-center gap-3 mt-3">
                    <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={scene.useMasterChar}
                        onChange={() => toggleUseMasterChar(scene.id)}
                        disabled={!masterCharLocked}
                        className="rounded border-zinc-600 accent-purple-500"
                      />
                      Use Master Character
                    </label>
                    <button
                      onClick={() => generateScene(scene)}
                      disabled={scene.status === 'generating'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 transition-all disabled:opacity-50"
                    >
                      {scene.status === 'generating' ? (
                        <><RefreshCw className="w-3 h-3 animate-spin" /> Generating…</>
                      ) : (
                        <><Wand2 className="w-3 h-3" /> Generate</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Master Character Panel */}
        <div className="space-y-4">
          <div className={`glass-card p-5 ${masterCharLocked ? 'border-purple-500/40 shadow-[0_0_30px_rgba(139,92,246,0.1)]' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-zinc-300">Master Character</h3>
              {masterCharLocked
                ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Locked</span>
                : <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500 flex items-center gap-1"><Unlock className="w-2.5 h-2.5" /> Unlocked</span>
              }
            </div>

            {/* Master char image preview */}
            <div className="w-full aspect-square rounded-xl bg-zinc-800 mb-4 overflow-hidden flex items-center justify-center">
              {masterCharImage ? (
                <img src={masterCharImage} alt="Master Character" className="w-full h-full object-cover" />
              ) : isGeneratingHero ? (
                <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
              ) : (
                <div className="text-center">
                  <Image className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-xs text-zinc-600">No hero yet</p>
                </div>
              )}
            </div>

            <textarea
              value={masterCharDesc}
              onChange={e => setMasterCharDesc(e.target.value)}
              disabled={masterCharLocked}
              placeholder="Describe your character…&#10;e.g. Young girl with silver hair, blue eyes, wearing a traditional shrine maiden outfit"
              className="w-full h-24 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 resize-none transition-all disabled:opacity-50"
            />

            <div className="flex flex-col gap-2 mt-3">
              <button
                onClick={generateHero}
                disabled={!masterCharDesc.trim() || masterCharLocked || isGeneratingHero}
                className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {isGeneratingHero ? <><RefreshCw className="w-3 h-3 animate-spin" /> Generating…</> : <><Wand2 className="w-3 h-3" /> Generate Hero</>}
              </button>

              <button
                onClick={() => setMasterCharLocked(l => !l)}
                disabled={!masterCharImage}
                className={`w-full py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 ${
                  masterCharLocked
                    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
                    : 'bg-gradient-to-r from-purple-600 to-cyan-600 hover:opacity-90 text-white'
                }`}
              >
                {masterCharLocked
                  ? <><Unlock className="w-3 h-3" /> Unlock Character</>
                  : <><Lock className="w-3 h-3" /> Lock Character</>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
