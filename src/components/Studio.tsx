'use client';
import { useState, useRef, useEffect } from 'react';
import { Wand2, Lock, Unlock, ChevronRight, ChevronLeft, Image, RefreshCw, CheckCircle, Film, Layers, User, FileText, Upload, X, Plus, RotateCw } from 'lucide-react';

const STYLES = ['Anime', 'Cyberpunk', 'Realistic', 'Ghibli', 'Seinen', 'Mecha'] as const;
type Style = typeof STYLES[number];

interface Scene {
  id: string;
  prompt: string;
  animationPrompt: string;
  imageUrl: string | null;
  videoUrl: string | null;
  videoTaskId: string | null;
  useMasterChar: boolean;
  status: 'idle' | 'generating' | 'done';
  videoStatus: 'idle' | 'queued' | 'processing' | 'done' | 'failed';
}

function splitIntoScenes(script: string): string[] {
  const lines = script
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 10);
  // Ensure minimum 6 scenes — pad with empty prompts
  while (lines.length < 6) {
    lines.push(`Scene ${lines.length + 1} — describe this scene…`);
  }
  return lines;
}

const STEPS = [
  { id: 1, label: 'Script',      icon: FileText },
  { id: 2, label: 'Character',   icon: User },
  { id: 3, label: 'Storyboard',  icon: Layers },
  { id: 4, label: 'Generate',    icon: Film },
] as const;

export default function Studio() {
  const [step, setStep] = useState(1);
  const [script, setScript] = useState('');
  const [style, setStyle] = useState<Style>('Anime');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [masterCharDesc, setMasterCharDesc] = useState('');
  const [masterCharLocked, setMasterCharLocked] = useState(false);
  const [masterCharImage, setMasterCharImage] = useState<string | null>(null);
  const [isGeneratingHero, setIsGeneratingHero] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [klingModel, setKlingModel] = useState<'kling-v1' | 'kling-v1-5' | 'kling-v2'>('kling-v1');
  const [klingDuration, setKlingDuration] = useState<'5' | '10'>('5');
  const [autoGenerateVideo, setAutoGenerateVideo] = useState(true);
  const [refPhotos, setRefPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [isFusingPhotos, setIsFusingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newPhotos = Array.from(files).slice(0, 10 - refPhotos.length).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setRefPhotos(prev => [...prev, ...newPhotos].slice(0, 10));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (idx: number) => {
    setRefPhotos(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[idx].preview);
      updated.splice(idx, 1);
      return updated;
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:image/...;base64, prefix
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const fusePhotosIntoCharacter = async () => {
    if (refPhotos.length === 0) return;
    setIsFusingPhotos(true);
    try {
      // Convert all photos to base64
      const photos = await Promise.all(
        refPhotos.map(async (p) => ({
          base64: await fileToBase64(p.file),
          name: p.file.name,
        }))
      );

      const res = await fetch('/api/cref/fuse-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photos,
          description: masterCharDesc.trim(),
          style: style.toLowerCase(),
        }),
      });
      const data = await res.json();
      if (data.imageUrl) {
        setMasterCharImage(data.imageUrl);
      }
    } finally {
      setIsFusingPhotos(false);
    }
  };

  const parseScenes = () => {
    const lines = splitIntoScenes(script);
    if (!lines.length) return;
    setScenes(lines.map((p, i) => ({
      id: `scene_${i}`,
      prompt: p,
      animationPrompt: '',
      imageUrl: null,
      videoUrl: null,
      videoTaskId: null,
      useMasterChar: masterCharLocked,
      status: 'idle',
      videoStatus: 'idle',
    })));
    setStep(3);
  };

  const toggleUseMasterChar = (id: string) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, useMasterChar: !s.useMasterChar } : s));
  };

  const updateScenePrompt = (id: string, prompt: string) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, prompt } : s));
  };

  const updateAnimationPrompt = (id: string, animationPrompt: string) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, animationPrompt } : s));
  };

  /** Generate Kling video for a single scene */
  const generateKlingVideo = async (scene: Scene) => {
    if (!scene.imageUrl) return;
    setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, videoStatus: 'queued' } : s));
    try {
      const res = await fetch('/api/kling/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: scene.imageUrl,
          animationPrompt: scene.animationPrompt,
          modelName: klingModel,
          duration: klingDuration,
          mode: 'std',
          waitForResult: false, // get taskId immediately, poll separately
        }),
      });
      const data = await res.json();
      if (data.taskId) {
        setScenes(prev => prev.map(s =>
          s.id === scene.id ? { ...s, videoTaskId: data.taskId, videoStatus: 'processing' } : s
        ));
        // Poll for result
        pollVideoTask(scene.id, data.taskId);
      } else {
        setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, videoStatus: 'failed' } : s));
      }
    } catch {
      setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, videoStatus: 'failed' } : s));
    }
  };

  /** Poll Kling task status */
  const pollVideoTask = (sceneId: string, taskId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 5 min max (5s interval)
    const timer = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(timer);
        setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, videoStatus: 'failed' } : s));
        return;
      }
      try {
        const res = await fetch(`/api/kling/task-status?taskId=${taskId}`);
        const data = await res.json();
        if (data.status === 'succeed' && data.videoUrl) {
          clearInterval(timer);
          setScenes(prev => prev.map(s =>
            s.id === sceneId ? { ...s, videoUrl: data.videoUrl, videoStatus: 'done' } : s
          ));
        } else if (data.status === 'failed') {
          clearInterval(timer);
          setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, videoStatus: 'failed' } : s));
        }
      } catch { /* continue polling */ }
    }, 5000);
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
      const imageUrl = data.imageUrl ?? null;
      setScenes(prev => prev.map(s =>
        s.id === scene.id ? { ...s, imageUrl, status: 'done' } : s
      ));

      // Auto-generate Kling video if enabled
      if (autoGenerateVideo && imageUrl) {
        // Get latest scene state (with animationPrompt)
        const updatedScene = { ...scene, imageUrl };
        generateKlingVideo(updatedScene);
      }
    } catch {
      setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: 'idle' } : s));
    }
  };

  const generateAllScenes = async () => {
    setIsGeneratingAll(true);
    for (const scene of scenes) {
      if (scene.status !== 'done') {
        await generateScene(scene);
      }
    }
    setIsGeneratingAll(false);
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

  const canGoNext = () => {
    if (step === 1) return script.trim().length > 0;
    if (step === 2) return true; // character is optional
    if (step === 3) return scenes.length > 0;
    return false;
  };

  // Auto-parse scenes when entering step 3 with no scenes
  useEffect(() => {
    if (step === 3 && scenes.length === 0) {
      parseScenes();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const doneCount = scenes.filter(s => s.status === 'done').length;

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col">
      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-5">
        {STEPS.map(({ id, label, icon: Icon }) => (
          <div key={id} className="flex items-center">
            <button
              onClick={() => setStep(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                step === id
                  ? 'bg-gradient-to-r from-purple-500/20 to-cyan-500/10 text-white border border-purple-500/30'
                  : id < step
                    ? 'text-purple-400 hover:text-purple-300'
                    : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                step === id ? 'bg-purple-500 text-white' : id < step ? 'bg-purple-500/30 text-purple-400' : 'bg-zinc-800 text-zinc-600'
              }`}>
                {id < step ? '✓' : id}
              </div>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
            {id < 4 && <ChevronRight className="w-4 h-4 text-zinc-700 mx-1" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden">
        {/* STEP 1: Script */}
        {step === 1 && (
          <div className="h-full flex flex-col">
            <div className="glass-card p-6 flex-1 flex flex-col">
              <h2 className="text-lg font-semibold text-zinc-200 mb-1">Write Your Script</h2>
              <p className="text-xs text-zinc-500 mb-4">Each line will become a separate scene. Write a story, paste a script, or describe your video idea.</p>
              <textarea
                value={script}
                onChange={e => setScript(e.target.value)}
                placeholder={"A young samurai stands on a cliff overlooking a burning city\nHe unsheathes his katana as cherry blossoms fall around him\nA massive dragon emerges from the smoke below\nThe samurai leaps off the cliff toward the dragon\nExplosion of fire and petals as they clash mid-air"}
                className="flex-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 resize-none transition-all"
              />

              <div className="flex items-center justify-between mt-4">
                <div className="flex flex-wrap gap-2">
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
                  onClick={() => { parseScenes(); setStep(2); }}
                  disabled={!script.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Next: Character
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Master Character */}
        {step === 2 && (
          <div className="h-full flex gap-6">
            <div className="flex-1 glass-card p-6 flex flex-col">
              <h2 className="text-lg font-semibold text-zinc-200 mb-1">Master Character</h2>
              <p className="text-xs text-zinc-500 mb-4">Upload 10 reference photos of your character. The AI will fuse them into one unified Master Character image.</p>

              {/* Photo upload grid */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-400">Reference Photos ({refPhotos.length}/10)</span>
                  {refPhotos.length > 0 && (
                    <button onClick={() => { refPhotos.forEach(p => URL.revokeObjectURL(p.preview)); setRefPhotos([]); }} className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
                      Clear all
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <div className="flex flex-wrap gap-2">
                  {refPhotos.map((photo, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden bg-zinc-800 group">
                      <img src={photo.preview} alt={`Ref ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                      <div className="absolute bottom-1 left-1 text-[9px] text-white/70 bg-black/40 px-1 rounded">{idx + 1}</div>
                    </div>
                  ))}
                  {refPhotos.length < 10 && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-20 h-20 rounded-xl border-2 border-dashed border-zinc-700 hover:border-purple-500/50 flex flex-col items-center justify-center gap-1 transition-all hover:bg-zinc-800/50 cursor-pointer"
                    >
                      <Plus className="w-5 h-5 text-zinc-600" />
                      <span className="text-[9px] text-zinc-600">Upload</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Optional text description */}
              <textarea
                value={masterCharDesc}
                onChange={e => setMasterCharDesc(e.target.value)}
                disabled={masterCharLocked}
                placeholder={"Optional: describe your character (the AI will combine this with the photos)…"}
                className="w-full h-20 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-purple-500/50 resize-none transition-all disabled:opacity-50"
              />

              <div className="flex gap-3 mt-4">
                <button
                  onClick={fusePhotosIntoCharacter}
                  disabled={refPhotos.length === 0 || masterCharLocked || isFusingPhotos}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 text-sm font-medium hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isFusingPhotos ? <><RefreshCw className="w-4 h-4 animate-spin" /> Fusing {refPhotos.length} photos…</> : <><Upload className="w-4 h-4" /> Fuse into Character ({refPhotos.length} photos)</>}
                </button>

                <button
                  onClick={generateHero}
                  disabled={!masterCharDesc.trim() || masterCharLocked || isGeneratingHero}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-zinc-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isGeneratingHero ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</> : <><Wand2 className="w-4 h-4" /> Generate from Text</>}
                </button>

                <button
                  onClick={() => setMasterCharLocked(l => !l)}
                  disabled={!masterCharImage}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    masterCharLocked
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
                      : 'bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30'
                  }`}
                >
                  {masterCharLocked ? <><Unlock className="w-4 h-4" /> Unlock</> : <><Lock className="w-4 h-4" /> Lock</>}
                </button>
              </div>

              <div className="flex-1" />

              <div className="flex items-center justify-between mt-4">
                <button onClick={() => setStep(1)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-400 transition-all">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 text-sm font-medium hover:opacity-90 transition-all"
                >
                  Next: Storyboard
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Character preview */}
            <div className="w-80 shrink-0">
              <div className={`glass-card p-5 h-full flex flex-col ${masterCharLocked ? 'border-purple-500/40 shadow-[0_0_30px_rgba(139,92,246,0.1)]' : ''}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-300">Master Character</h3>
                  {masterCharLocked
                    ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Locked</span>
                    : <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500 flex items-center gap-1"><Unlock className="w-2.5 h-2.5" /> Unlocked</span>
                  }
                </div>
                <div className="w-full aspect-square rounded-xl bg-zinc-800 overflow-hidden flex items-center justify-center">
                  {masterCharImage ? (
                    <img src={masterCharImage} alt="Master Character" className="w-full h-full object-cover" />
                  ) : isFusingPhotos || isGeneratingHero ? (
                    <div className="text-center">
                      <RefreshCw className="w-10 h-10 text-purple-400 animate-spin mx-auto mb-3" />
                      <p className="text-xs text-zinc-500">{isFusingPhotos ? `Fusing ${refPhotos.length} photos…` : 'Generating hero…'}</p>
                    </div>
                  ) : refPhotos.length > 0 ? (
                    <div className="text-center p-4">
                      <Upload className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
                      <p className="text-xs text-zinc-500">{refPhotos.length} photos ready</p>
                      <p className="text-[10px] text-zinc-600 mt-1">Click &quot;Fuse into Character&quot;</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <User className="w-12 h-12 text-zinc-700 mx-auto mb-2" />
                      <p className="text-xs text-zinc-600">Upload photos or generate</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Storyboard */}
        {step === 3 && (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-200">Storyboard</h2>
                <p className="text-xs text-zinc-500">{scenes.length} scenes · Photo prompt + Video animation prompt per scene</p>
              </div>
              <div className="flex gap-3 items-center">
                {/* Aspect ratio toggle */}
                <button
                  onClick={() => setAspectRatio(r => r === '16:9' ? '9:16' : '16:9')}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 transition-all"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  {aspectRatio}
                </button>

                <button onClick={() => setStep(2)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-400 transition-all">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={scenes.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-all"
                >
                  Next: Generate
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                {scenes.map((scene, idx) => (
                  <div key={scene.id} className="glass-card p-4 flex flex-col">
                    {/* Scene header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-zinc-800 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-zinc-500">{idx + 1}</span>
                        </div>
                        <span className="text-xs font-medium text-zinc-400">Scene {idx + 1}</span>
                      </div>
                      <label className="flex items-center gap-1.5 text-[10px] text-zinc-500 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={scene.useMasterChar}
                          onChange={() => toggleUseMasterChar(scene.id)}
                          disabled={!masterCharLocked}
                          className="rounded border-zinc-600 accent-purple-500 w-3 h-3"
                        />
                        Cref
                      </label>
                    </div>

                    {/* Preview thumbnail */}
                    <div className={`${aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'} rounded-xl bg-zinc-800/50 border border-zinc-800 flex items-center justify-center mb-3 overflow-hidden transition-all`}>
                      {scene.imageUrl ? (
                        <img src={scene.imageUrl} alt={`Scene ${idx + 1}`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center">
                          <Image className="w-6 h-6 text-zinc-700 mx-auto mb-1" />
                          <p className="text-[10px] text-zinc-700">Preview</p>
                        </div>
                      )}
                    </div>

                    {/* Photo prompt */}
                    <div className="mb-2">
                      <span className="text-[10px] text-zinc-500 font-medium mb-1 flex items-center gap-1">
                        <Image className="w-3 h-3" /> Image Prompt
                      </span>
                      <textarea
                        value={scene.prompt}
                        onChange={e => updateScenePrompt(scene.id, e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-purple-500/50 resize-none transition-all"
                        rows={2}
                      />
                    </div>

                    {/* Video animation prompt */}
                    <div>
                      <span className="text-[10px] text-zinc-500 font-medium mb-1 flex items-center gap-1">
                        <Film className="w-3 h-3" /> Animation Prompt
                      </span>
                      <textarea
                        value={scene.animationPrompt}
                        onChange={e => updateAnimationPrompt(scene.id, e.target.value)}
                        placeholder="Camera slowly zooms in, character turns head…"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-purple-500/50 resize-none transition-all"
                        rows={2}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Generate Video */}
        {step === 4 && (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-200">Generate Video</h2>
                <p className="text-xs text-zinc-500">{doneCount}/{scenes.length} photos · {scenes.filter(s => s.videoStatus === 'done').length}/{scenes.length} videos · Style: {style}</p>
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                {/* Kling settings */}
                <select
                  value={klingModel}
                  onChange={e => setKlingModel(e.target.value as typeof klingModel)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none"
                >
                  <option value="kling-v1">Kling v1</option>
                  <option value="kling-v1-5">Kling v1.5</option>
                  <option value="kling-v2">Kling v2</option>
                </select>
                <select
                  value={klingDuration}
                  onChange={e => setKlingDuration(e.target.value as typeof klingDuration)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none"
                >
                  <option value="5">5 sec</option>
                  <option value="10">10 sec</option>
                </select>
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoGenerateVideo}
                    onChange={e => setAutoGenerateVideo(e.target.checked)}
                    className="rounded border-zinc-600 accent-purple-500 w-3 h-3"
                  />
                  Auto-video
                </label>
                <button onClick={() => setStep(3)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-400 transition-all">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={generateAllScenes}
                  disabled={isGeneratingAll || scenes.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-all"
                >
                  {isGeneratingAll ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</> : <><Wand2 className="w-4 h-4" /> Generate All</>}
                </button>
              </div>
            </div>

            {/* Photo progress */}
            {scenes.length > 0 && (
              <div className="mb-1">
                <div className="flex justify-between text-[10px] text-zinc-600 mb-1">
                  <span>📷 Photos</span>
                  <span>{doneCount}/{scenes.length}</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-2">
                  <div className="progress-bar h-full transition-all duration-500" style={{ width: `${(doneCount / scenes.length) * 100}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-600 mb-1">
                  <span>🎬 Videos (Kling AI)</span>
                  <span>{scenes.filter(s => s.videoStatus === 'done').length}/{scenes.length}</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500" style={{ width: `${(scenes.filter(s => s.videoStatus === 'done').length / scenes.length) * 100}%` }} />
                </div>
              </div>
            )}

            {doneCount === 0 && !isGeneratingAll ? (
              <div className="flex-1 glass-card rounded-2xl flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4">
                  <Film className="w-10 h-10 text-zinc-700" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-500 mb-1">Ready to Generate</h3>
                <p className="text-xs text-zinc-600 max-w-sm text-center">
                  Click &quot;Generate All&quot; — each scene photo will be created by Leonardo.ai,
                  then automatically sent to Kling AI for video animation.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                  {scenes.map((scene, idx) => (
                    <div key={scene.id} className="glass-card p-3 flex flex-col">
                      {/* Photo / Video preview */}
                      <div className="aspect-video rounded-xl bg-zinc-800 overflow-hidden flex items-center justify-center mb-2 relative">
                        {scene.videoUrl ? (
                          <video
                            src={scene.videoUrl}
                            controls
                            loop
                            className="w-full h-full object-cover"
                          />
                        ) : scene.imageUrl ? (
                          <>
                            <img src={scene.imageUrl} alt={`Scene ${idx + 1}`} className="w-full h-full object-cover" />
                            {/* Video overlay status */}
                            {scene.videoStatus === 'processing' || scene.videoStatus === 'queued' ? (
                              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
                                <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
                                <span className="text-[10px] text-cyan-400">Kling AI…</span>
                              </div>
                            ) : scene.videoStatus === 'failed' ? (
                              <div className="absolute bottom-1 right-1 text-[9px] bg-red-500/80 text-white px-1.5 py-0.5 rounded">video failed</div>
                            ) : null}
                          </>
                        ) : scene.status === 'generating' ? (
                          <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
                        ) : (
                          <Image className="w-8 h-8 text-zinc-700" />
                        )}
                      </div>

                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-zinc-400">Scene {idx + 1}</span>
                        {scene.status === 'done' && <CheckCircle className="w-3 h-3 text-green-400" />}
                        {scene.status === 'generating' && <RefreshCw className="w-3 h-3 text-purple-400 animate-spin" />}
                        {scene.videoStatus === 'done' && <Film className="w-3 h-3 text-cyan-400" />}
                        {(scene.videoStatus === 'processing' || scene.videoStatus === 'queued') && <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />}
                        {scene.useMasterChar && masterCharLocked && <Lock className="w-3 h-3 text-purple-400/50" />}
                      </div>
                      <p className="text-[11px] text-zinc-500 line-clamp-2 mb-2">{scene.prompt}</p>

                      {/* Action buttons */}
                      <div className="flex gap-1 mt-auto">
                        {scene.status !== 'generating' && scene.status !== 'done' && (
                          <button
                            onClick={() => generateScene(scene)}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-400 transition-all"
                          >
                            <Wand2 className="w-3 h-3" /> Photo
                          </button>
                        )}
                        {scene.status === 'done' && scene.videoStatus === 'idle' && (
                          <button
                            onClick={() => generateKlingVideo(scene)}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 text-[11px] text-cyan-400 transition-all"
                          >
                            <Film className="w-3 h-3" /> Video
                          </button>
                        )}
                        {scene.videoStatus === 'failed' && (
                          <button
                            onClick={() => generateKlingVideo(scene)}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-[11px] text-red-400 transition-all"
                          >
                            <RefreshCw className="w-3 h-3" /> Retry Video
                          </button>
                        )}
                        {scene.videoUrl && (
                          <a
                            href={scene.videoUrl}
                            download={`scene_${idx + 1}.mp4`}
                            className="flex items-center justify-center px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-400 transition-all"
                            title="Download video"
                          >
                            ↓
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
