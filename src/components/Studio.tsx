'use client';
import { useState, useRef, useEffect } from 'react';
import { Wand2, Lock, Unlock, ChevronRight, ChevronLeft, Image, RefreshCw, CheckCircle, Film, Layers, User, FileText, Upload, X, Plus, RotateCw, Download, Scissors, Square, PackageOpen } from 'lucide-react';

const STYLES = ['Anime', 'Cyberpunk', 'Realistic', 'Ghibli', 'Seinen', 'Mecha'] as const;
type Style = typeof STYLES[number];

interface Scene {
  id: string;
  prompt: string;
  imageUrl: string | null;
  videoUrl: string | null;
  videoTaskId: string | null;
  useMasterChar: boolean;
  status: 'idle' | 'generating' | 'done';
  videoStatus: 'idle' | 'queued' | 'processing' | 'done' | 'failed';
  dbVideoId: number | null;
}

function splitIntoScenes(script: string): string[] {
  const lines = script
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 10);
  while (lines.length < 6) {
    lines.push(`Scene ${lines.length + 1} — describe this scene…`);
  }
  return lines;
}

/** Derive a cinematic animation prompt from a scene description using keyword heuristics */
function deriveAnimationPrompt(sceneLine: string, aspectRatio: '16:9' | '9:16'): string {
  const t = sceneLine.toLowerCase();

  const ratioPrefix = aspectRatio === '16:9'
    ? 'cinematic widescreen 16:9, '
    : 'vertical portrait 9:16, ';

  const animeBase = 'anime style, hand-drawn 2D animation, vibrant colors, sharp lineart, fluid motion';

  // Action / combat
  if (/leap|jump|dash|clash|fight|strike|slash|attack|explod|spark|burst|impact/.test(t)) {
    return ratioPrefix + `${animeBase}, dynamic action sequence, speed lines, sakuga animation, fast camera whip pan, slow-motion impact frame, motion blur streaks, dramatic sword flash`;
  }
  // Landing / aftermath
  if (/land|turn back|dissolv|vanish|disappear|fade|shadow/.test(t)) {
    return ratioPrefix + `${animeBase}, camera slowly lowers, dust particles settling, hair and coat settle with gravity, dramatic still frame pause, subtle wind effect`;
  }
  // Emotional / internal moment
  if (/clos(e|es|ing) (eye|eyes)|grip|breath|tremble|tears|silence|alone|stand/.test(t)) {
    return ratioPrefix + `${animeBase}, slow emotional zoom in, cherry blossom petals drifting, soft rim lighting on face, eye catch sparkle, gentle cloth and hair sway`;
  }
  // Aerial / wide environment
  if (/rooftop|city|sky|horizon|landscape|overview|vast|crowd|sunset|sunrise/.test(t)) {
    return ratioPrefix + `${animeBase}, epic wide establishing shot, slow aerial dolly forward, golden hour lighting, atmospheric haze, skyline silhouette, dramatic scale`;
  }
  // Mid-air / flight
  if (/mid.air|fly|soar|across|gap|bridge/.test(t)) {
    return ratioPrefix + `${animeBase}, upward tracking shot, dynamic follow cam, wind rushing effect, clothes and hair trailing, speed lines radiating outward`;
  }
  // Appearance / reveal
  if (/appear|emerge|arriv|reveal|step out|figure|eyes glow/.test(t)) {
    return ratioPrefix + `${animeBase}, dramatic slow push in, camera rises to reveal, glowing eyes close-up, shadow dissolves into light, tension build-up`;
  }
  // Default — gentle scene
  return ratioPrefix + `${animeBase}, gentle camera drift, soft parallax background, floating dust particles, ambient wind, calm atmospheric motion`;
}

const ASPECT_TEMPLATES: Record<'16:9' | '9:16', { imagePrefix: string }> = {
  '16:9': {
    imagePrefix: '16:9 widescreen cinematic video frame, ',
  },
  '9:16': {
    imagePrefix: '9:16 vertical video frame, portrait orientation, ',
  },
};

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
  const [isGeneratingFromScript, setIsGeneratingFromScript] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [klingModel, setKlingModel] = useState<'kling-v1' | 'kling-v1-5' | 'kling-v2'>('kling-v1');
  const [klingDuration, setKlingDuration] = useState<'5' | '10'>('5');
  const [autoGenerateVideo, setAutoGenerateVideo] = useState(true);
  const [isMerging, setIsMerging] = useState(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [showFinalModal, setShowFinalModal] = useState(false);
  const [refPhotos, setRefPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [isFusingPhotos, setIsFusingPhotos] = useState(false);
  const [providerMode, setProviderMode] = useState<'api' | 'higgsfield'>('api');
  const [generationProgress, setGenerationProgress] = useState<{
    currentScene: number;
    totalScenes: number;
    completedItems: Array<{ type: 'image' | 'video'; url: string; sceneIdx: number }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch provider_mode on mount
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => { if (d.provider_mode) setProviderMode(d.provider_mode); })
      .catch(() => {});
  }, []);

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
      imageUrl: null,
      videoUrl: null,
      videoTaskId: null,
      useMasterChar: masterCharLocked,
      status: 'idle',
      videoStatus: 'idle',
      dbVideoId: null,
    })));
    setStep(3);
  };

  const toggleUseMasterChar = (id: string) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, useMasterChar: !s.useMasterChar } : s));
  };

  const updateScenePrompt = (id: string, prompt: string) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, prompt } : s));
  };

  const addScene = () => {
    setScenes(prev => [...prev, {
      id: `scene_${Date.now()}`,
      prompt: '',
      imageUrl: null,
      videoUrl: null,
      videoTaskId: null,
      useMasterChar: masterCharLocked,
      status: 'idle',
      videoStatus: 'idle',
      dbVideoId: null,
    }]);
  };

  const removeScene = (sceneId: string) => {
    setScenes(prev => prev.filter(s => s.id !== sceneId));
  };

  /** Switch aspect ratio and inject template prefixes into all scene prompts */
  const switchAspectRatio = (next: '16:9' | '9:16') => {
    const prev = aspectRatio;
    const prevTpl = ASPECT_TEMPLATES[prev];
    const nextTpl = ASPECT_TEMPLATES[next];

    setAspectRatio(next);

    if (scenes.length === 0) return;

    setScenes(old => old.map(s => {
      // Strip old prefix if present, then prepend new one
      const cleanPrompt = s.prompt.startsWith(prevTpl.imagePrefix)
        ? s.prompt.slice(prevTpl.imagePrefix.length)
        : s.prompt.startsWith(ASPECT_TEMPLATES['16:9'].imagePrefix)
          ? s.prompt.slice(ASPECT_TEMPLATES['16:9'].imagePrefix.length)
          : s.prompt.startsWith(ASPECT_TEMPLATES['9:16'].imagePrefix)
            ? s.prompt.slice(ASPECT_TEMPLATES['9:16'].imagePrefix.length)
            : s.prompt;

      return {
        ...s,
        prompt: nextTpl.imagePrefix + cleanPrompt,
      };
    }));
  };

  /** Merge all done videos via ffmpeg on server */
  const mergeAllVideos = async () => {
    const videoUrls = scenes
      .filter(s => s.videoStatus === 'done' && s.videoUrl)
      .map(s => s.videoUrl!);

    if (videoUrls.length === 0) return;
    setIsMerging(true);
    setMergedVideoUrl(null);
    try {
      const res = await fetch('/api/kling/merge-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrls }),
      });
      const data = await res.json();
      if (data.videoBase64) {
        const blob = new Blob(
          [Uint8Array.from(atob(data.videoBase64), c => c.charCodeAt(0))],
          { type: 'video/mp4' }
        );
        setMergedVideoUrl(URL.createObjectURL(blob));
        setShowFinalModal(true);

        // Create final merged video record in DB
        try {
          const doneCount = scenes.filter(s => s.videoStatus === 'done').length;
          await fetch('/api/videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `${style} — Final Cut (${scenes.length} scenes)`,
              status: 'complete',
              style: style,
              duration: `${doneCount * parseInt(klingDuration)}s`,
              video_url: data.videoUrl ?? null,
            }),
          });
        } catch { /* DB save non-critical */ }
      }
    } finally {
      setIsMerging(false);
    }
  };

  /** Generate Kling video for a scene paired with the next scene */
  const generateKlingVideoForPair = async (scene: Scene, nextScene: Scene | null) => {
    if (!scene.imageUrl) return;
    setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, videoStatus: 'queued' } : s));
    try {
      // Combine scene description + auto-derived animation tags for Kling
      const combinedPrompt = `${scene.prompt}, ${deriveAnimationPrompt(scene.prompt, aspectRatio)}`;
      const body: Record<string, unknown> = {
        imageUrl: scene.imageUrl,
        animationPrompt: combinedPrompt,
        modelName: klingModel,
        duration: klingDuration,
        mode: 'std',
        waitForResult: false,
      };
      if (nextScene?.imageUrl) {
        body.endImageUrl = nextScene.imageUrl;
      }

      const res = await fetch('/api/kling/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.taskId) {
        // Create video record in DB
        let dbVideoId: number | null = null;
        try {
          const dbRes = await fetch('/api/videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: scene.prompt.slice(0, 60),
              status: 'processing',
              platform: null,
              style: style,
            }),
          });
          const dbData = await dbRes.json();
          if (dbData.id) dbVideoId = dbData.id;
        } catch { /* DB save non-critical */ }

        // Debit credits
        try {
          await fetch('/api/billing/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              description: `Video render: ${scene.prompt.slice(0, 40)}`,
              amount: 50,
              type: 'debit',
            }),
          });
        } catch { /* billing non-critical */ }

        setScenes(prev => prev.map(s =>
          s.id === scene.id ? { ...s, videoTaskId: data.taskId, videoStatus: 'processing', dbVideoId } : s
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
        setScenes(prev => {
          const scene = prev.find(s => s.id === sceneId);
          if (scene?.dbVideoId) {
            fetch(`/api/videos/${scene.dbVideoId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'failed' }),
            }).catch(() => {});
          }
          return prev.map(s => s.id === sceneId ? { ...s, videoStatus: 'failed' } : s);
        });
        return;
      }
      try {
        const res = await fetch(`/api/kling/task-status?taskId=${taskId}`);
        const data = await res.json();
        if (data.status === 'succeed' && data.videoUrl) {
          clearInterval(timer);
          setScenes(prev => {
            const scene = prev.find(s => s.id === sceneId);
            if (scene?.dbVideoId) {
              fetch(`/api/videos/${scene.dbVideoId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  status: 'complete',
                  thumbnail: data.videoUrl,
                  duration: klingDuration === '5' ? '0:05' : '0:10',
                }),
              }).catch(() => {});
            }
            return prev.map(s =>
              s.id === sceneId ? { ...s, videoUrl: data.videoUrl, videoStatus: 'done' } : s
            );
          });
        } else if (data.status === 'failed') {
          clearInterval(timer);
          setScenes(prev => {
            const scene = prev.find(s => s.id === sceneId);
            if (scene?.dbVideoId) {
              fetch(`/api/videos/${scene.dbVideoId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'failed' }),
              }).catch(() => {});
            }
            return prev.map(s => s.id === sceneId ? { ...s, videoStatus: 'failed' } : s);
          });
        }
      } catch { /* continue polling */ }
    }, 5000);
  };

  const generateScene = async (scene: Scene) => {
    setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: 'generating' } : s));
    try {
      const useChar = masterCharLocked && masterCharImage;
      const res = await fetch('/api/cref/generate-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenePrompt: scene.prompt,
          style: style.toLowerCase(),
          aspectRatio,
          ...(useChar ? {
            characterDescription: masterCharDesc,
            characterRefImageUrl: masterCharImage,
          } : {}),
        }),
      });
      const data = await res.json();
      const imageUrl = data.imageUrl ?? null;
      setScenes(prev => prev.map(s =>
        s.id === scene.id ? { ...s, imageUrl, status: 'done' } : s
      ));

      // Auto-generate Kling video if enabled
      if (autoGenerateVideo && imageUrl) {
        setScenes(prev => {
          const fresh = prev.find(s => s.id === scene.id);
          if (fresh) {
            const idx = prev.indexOf(fresh);
            const nextScene = idx < prev.length - 1 ? prev[idx + 1] : null;
            generateKlingVideoForPair({ ...fresh, imageUrl }, nextScene);
          }
          return prev;
        });
      }
    } catch {
      setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: 'idle' } : s));
    }
  };

  const generateAllScenes = async () => {
    setIsGeneratingAll(true);
    const pending = scenes.filter(s => s.status !== 'done');
    const total = scenes.length;
    setGenerationProgress({ currentScene: 0, totalScenes: total, completedItems: [] });

    for (let i = 0; i < pending.length; i++) {
      setGenerationProgress(prev => prev ? { ...prev, currentScene: scenes.indexOf(pending[i]) + 1 } : prev);
      await generateScene(pending[i]);
      // After scene done, add completed image to progress
      setScenes(current => {
        const updated = current.find(s => s.id === pending[i].id);
        if (updated?.imageUrl) {
          setGenerationProgress(prev => prev ? {
            ...prev,
            completedItems: [...prev.completedItems, { type: 'image', url: updated.imageUrl!, sceneIdx: scenes.indexOf(pending[i]) }],
          } : prev);
        }
        return current;
      });
    }

    setIsGeneratingAll(false);
    setGenerationProgress(null);
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

  /** Generate master character automatically from the script text */
  const generateCharacterFromScript = async () => {
    if (!script.trim()) return;
    setIsGeneratingFromScript(true);
    try {
      const res = await fetch('/api/cref/character-from-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, style: style.toLowerCase() }),
      });
      const data = await res.json();
      if (data.imageUrl) {
        setMasterCharImage(data.imageUrl);
        // Auto-fill description from derived prompt if field is empty
        if (!masterCharDesc.trim() && data.description) {
          setMasterCharDesc(data.description);
        }
      }
    } finally {
      setIsGeneratingFromScript(false);
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

  // Auto-trigger merge when all videos are done
  useEffect(() => {
    const allVideosDone =
      scenes.length > 0 &&
      scenes.every(s => s.videoStatus === 'done' && s.videoUrl);
    if (allVideosDone && !mergedVideoUrl && !isMerging) {
      void mergeAllVideos();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes, mergedVideoUrl, isMerging]);

  const doneCount = scenes.filter(s => s.status === 'done').length;
  const videoDoneCount = scenes.filter(s => s.videoStatus === 'done').length;
  const clipCount = Math.max(0, scenes.length - 1);
  const dur = parseInt(klingDuration);

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col">
      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-5">
        {STEPS.map(({ id, label, icon: Icon }) => (
          <div key={id} className="flex items-center">
            <button
              onClick={() => setStep(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                step === id
                  ? 'bg-white/[0.06] text-text-primary border border-purple-500/30 shadow-[0_0_20px_-6px_rgba(139,92,246,0.2)]'
                  : id < step
                    ? 'text-purple-400 hover:text-purple-300 hover:bg-white/[0.03]'
                    : 'text-text-muted hover:text-text-tertiary hover:bg-white/[0.02]'
              }`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                step === id ? 'bg-gradient-to-br from-purple-500 to-cyan-500 text-white' : id < step ? 'bg-purple-500/20 text-purple-400' : 'bg-white/[0.06] text-text-muted'
              }`}>
                {id < step ? '\u2713' : id}
              </div>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
            {id < 4 && <ChevronRight className="w-4 h-4 text-text-muted mx-1" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden">
        {/* STEP 1: Script */}
        {step === 1 && (
          <div className="h-full flex flex-col">
            <div className="glass-card p-6 flex-1 flex flex-col">
              <h2 className="text-lg font-semibold text-text-primary mb-1">Write Your Script</h2>
              <p className="text-xs text-text-muted mb-4">Each line will become a separate scene. Write a story, paste a script, or describe your video idea.</p>
              <textarea
                value={script}
                onChange={e => setScript(e.target.value)}
                placeholder={"A young samurai stands on a cliff overlooking a burning city\nHe unsheathes his katana as cherry blossoms fall around him\nA massive dragon emerges from the smoke below\nThe samurai leaps off the cliff toward the dragon\nExplosion of fire and petals as they clash mid-air"}
                className="flex-1 w-full input-field px-4 py-3 text-sm resize-none"
              />

              <div className="flex items-center justify-between mt-4">
                <div className="flex flex-wrap gap-2">
                  {STYLES.map(s => (
                    <button
                      key={s}
                      onClick={() => setStyle(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        style === s
                          ? 'btn-primary'
                          : 'bg-white/[0.04] border border-border-subtle text-text-muted hover:bg-white/[0.06] hover:text-text-secondary hover:border-border-hover'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => { parseScenes(); setStep(2); }}
                  disabled={!script.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-primary text-sm font-medium"
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
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-lg font-semibold text-text-primary">Master Character</h2>
                <button
                  onClick={generateCharacterFromScript}
                  disabled={!script.trim() || masterCharLocked || isGeneratingFromScript}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 text-xs font-medium text-purple-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isGeneratingFromScript
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analysing script...</>
                    : <><Wand2 className="w-3.5 h-3.5" /> Generate from Script</>}
                </button>
              </div>
              <p className="text-xs text-text-muted mb-4">Upload 10 reference photos of your character. The AI will fuse them into one unified Master Character image.</p>

              {/* Photo upload grid */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-text-secondary">Reference Photos ({refPhotos.length}/10)</span>
                  {refPhotos.length > 0 && (
                    <button onClick={() => { refPhotos.forEach(p => URL.revokeObjectURL(p.preview)); setRefPhotos([]); }} className="text-[10px] text-text-muted hover:text-text-secondary transition-colors">
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
                    <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden bg-surface-2 ring-1 ring-border-subtle group">
                      <img src={photo.preview} alt={`Ref ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                      <div className="absolute bottom-1 left-1 text-[9px] text-white/70 bg-black/40 backdrop-blur-sm px-1 rounded">{idx + 1}</div>
                    </div>
                  ))}
                  {refPhotos.length < 10 && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-20 h-20 rounded-xl border-2 border-dashed border-border-subtle hover:border-purple-500/30 flex flex-col items-center justify-center gap-1 transition-all hover:bg-white/[0.02] cursor-pointer"
                    >
                      <Plus className="w-5 h-5 text-text-muted" />
                      <span className="text-[9px] text-text-muted">Upload</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Optional text description */}
              <textarea
                value={masterCharDesc}
                onChange={e => setMasterCharDesc(e.target.value)}
                disabled={masterCharLocked}
                placeholder={"Optional: describe your character (the AI will combine this with the photos)..."}
                className="w-full h-20 input-field px-4 py-3 text-sm resize-none disabled:opacity-50"
              />

              <div className="flex gap-3 mt-4">
                <button
                  onClick={fusePhotosIntoCharacter}
                  disabled={refPhotos.length === 0 || masterCharLocked || isFusingPhotos}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl btn-primary text-sm font-medium"
                >
                  {isFusingPhotos ? <><RefreshCw className="w-4 h-4 animate-spin" /> Fusing {refPhotos.length} photos...</> : <><Upload className="w-4 h-4" /> Fuse into Character ({refPhotos.length} photos)</>}
                </button>

                <button
                  onClick={generateHero}
                  disabled={!masterCharDesc.trim() || masterCharLocked || isGeneratingHero}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-sm font-medium"
                >
                  {isGeneratingHero ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</> : <><Wand2 className="w-4 h-4" /> Generate from Text</>}
                </button>

                <button
                  onClick={() => setMasterCharLocked(l => !l)}
                  disabled={!masterCharImage}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    masterCharLocked
                      ? 'btn-ghost'
                      : 'bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20'
                  }`}
                >
                  {masterCharLocked ? <><Unlock className="w-4 h-4" /> Unlock</> : <><Lock className="w-4 h-4" /> Lock</>}
                </button>
              </div>

              <div className="flex-1" />

              <div className="flex items-center justify-between mt-4">
                <button onClick={() => setStep(1)} className="flex items-center gap-2 px-4 py-2 rounded-xl btn-ghost text-sm">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-primary text-sm font-medium"
                >
                  Next: Storyboard
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Character preview */}
            <div className="w-80 shrink-0">
              <div className={`glass-card p-5 h-full flex flex-col transition-all duration-300 ${masterCharLocked ? 'border-purple-500/30 shadow-[0_0_40px_-8px_rgba(139,92,246,0.15)]' : ''}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-text-primary">Master Character</h3>
                  {masterCharLocked
                    ? <span className="badge bg-purple-500/15 text-purple-400 border-purple-500/25"><Lock className="w-2.5 h-2.5" /> Locked</span>
                    : <span className="badge bg-white/[0.04] text-text-muted border-border-subtle"><Unlock className="w-2.5 h-2.5" /> Unlocked</span>
                  }
                </div>
                <div className="w-full aspect-square rounded-xl bg-surface-2 ring-1 ring-border-subtle overflow-hidden flex items-center justify-center">
                  {masterCharImage ? (
                    <img src={masterCharImage} alt="Master Character" className="w-full h-full object-cover" />
                  ) : isFusingPhotos || isGeneratingHero ? (
                    <div className="text-center">
                      <RefreshCw className="w-10 h-10 text-purple-400 animate-spin mx-auto mb-3" />
                      <p className="text-xs text-text-muted">{isFusingPhotos ? `Fusing ${refPhotos.length} photos...` : 'Generating hero...'}</p>
                    </div>
                  ) : refPhotos.length > 0 ? (
                    <div className="text-center p-4">
                      <Upload className="w-10 h-10 text-text-muted mx-auto mb-2" />
                      <p className="text-xs text-text-muted">{refPhotos.length} photos ready</p>
                      <p className="text-[10px] text-text-muted mt-1">Click &quot;Fuse into Character&quot;</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <User className="w-12 h-12 text-text-muted mx-auto mb-2" />
                      <p className="text-xs text-text-muted">Upload photos or generate</p>
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
                <h2 className="text-lg font-semibold text-text-primary">Storyboard</h2>
                <p className="text-xs text-text-muted">
                  {scenes.length} scenes → {clipCount} clip{clipCount !== 1 ? 's' : ''} × {dur}s = {clipCount * dur}s
                </p>
              </div>
              <div className="flex gap-3 items-center">
                <button
                  onClick={() => switchAspectRatio(aspectRatio === '16:9' ? '9:16' : '16:9')}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl btn-ghost text-xs"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  {aspectRatio}
                </button>

                <button onClick={() => setStep(2)} className="flex items-center gap-2 px-4 py-2 rounded-xl btn-ghost text-sm">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={scenes.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-primary text-sm font-medium"
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
                        <div className="w-6 h-6 rounded-md bg-white/[0.04] border border-border-subtle flex items-center justify-center">
                          <span className="text-[10px] font-bold text-text-muted">{idx + 1}</span>
                        </div>
                        <span className="text-xs font-medium text-text-secondary">Scene {idx + 1}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-[10px] text-text-muted cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={scene.useMasterChar}
                            onChange={() => toggleUseMasterChar(scene.id)}
                            disabled={!masterCharLocked}
                            className="rounded border-zinc-600 accent-purple-500 w-3 h-3"
                          />
                          Cref
                        </label>
                        {scenes.length > 1 && (
                          <button
                            onClick={() => removeScene(scene.id)}
                            className="w-5 h-5 rounded-md flex items-center justify-center text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                            title="Remove scene"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Preview thumbnail */}
                    <div className={`${aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'} rounded-xl bg-surface-2 ring-1 ring-border-subtle flex items-center justify-center mb-3 overflow-hidden transition-all`}>
                      {scene.imageUrl ? (
                        <img src={scene.imageUrl} alt={`Scene ${idx + 1}`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center">
                          <Image className="w-6 h-6 text-text-muted mx-auto mb-1" />
                          <p className="text-[10px] text-text-muted">Preview</p>
                        </div>
                      )}
                    </div>

                    {/* Scene prompt */}
                    <div>
                      <span className="text-[10px] text-text-muted font-medium mb-1 flex items-center gap-1">
                        <Film className="w-3 h-3" /> Scene Prompt
                      </span>
                      <textarea
                        value={scene.prompt}
                        onChange={e => updateScenePrompt(scene.id, e.target.value)}
                        placeholder="Describe what happens in this scene..."
                        className="w-full input-field px-3 py-2 text-xs resize-none"
                        rows={3}
                      />
                    </div>
                  </div>
                ))}

                {/* Add Scene card */}
                <button
                  onClick={addScene}
                  className="glass-card p-4 flex flex-col items-center justify-center border-2 border-dashed border-border-subtle hover:border-purple-500/30 transition-all min-h-[200px]"
                >
                  <Plus className="w-8 h-8 text-text-muted mb-2" />
                  <span className="text-xs text-text-muted">Add Scene</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Generate Video */}
        {step === 4 && (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Generate Video</h2>
                <p className="text-xs text-text-muted tabular-nums">{doneCount}/{scenes.length} photos · {videoDoneCount}/{scenes.length} videos · Style: {style}</p>
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                <select
                  value={klingModel}
                  onChange={e => setKlingModel(e.target.value as typeof klingModel)}
                  className="input-field px-2.5 py-1.5 text-xs appearance-none cursor-pointer"
                >
                  <option value="kling-v1">Kling v1</option>
                  <option value="kling-v1-5">Kling v1.5</option>
                  <option value="kling-v2">Kling v2</option>
                </select>
                <select
                  value={klingDuration}
                  onChange={e => setKlingDuration(e.target.value as typeof klingDuration)}
                  className="input-field px-2.5 py-1.5 text-xs appearance-none cursor-pointer"
                >
                  <option value="5">5 sec</option>
                  <option value="10">10 sec</option>
                </select>
                <label className="flex items-center gap-1.5 text-[11px] text-text-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoGenerateVideo}
                    onChange={e => setAutoGenerateVideo(e.target.checked)}
                    className="rounded border-zinc-600 accent-purple-500 w-3 h-3"
                  />
                  Auto-video
                </label>
                <button onClick={() => setStep(3)} className="flex items-center gap-2 px-4 py-2 rounded-xl btn-ghost text-sm">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={generateAllScenes}
                  disabled={isGeneratingAll || scenes.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-primary text-sm font-medium"
                >
                  {isGeneratingAll ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</> : <><Wand2 className="w-4 h-4" /> Generate All</>}
                </button>
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium ${
                  providerMode === 'higgsfield'
                    ? 'bg-green-500/15 text-green-400 border border-green-500/25'
                    : 'bg-white/[0.06] text-text-muted border border-border-subtle'
                }`}>
                  {providerMode === 'higgsfield' && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                  )}
                  {providerMode === 'higgsfield' ? 'via Higgsfield \u221E' : 'via Kling API'}
                </span>
                {providerMode === 'higgsfield' && (
                  <button
                    onClick={async () => {
                      await fetch('/api/emergency-stop', { method: 'POST' });
                      setProviderMode('api');
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/25 text-[10px] font-medium hover:bg-red-500/25 transition-colors"
                  >
                    <Square className="w-2.5 h-2.5" />
                    Stop
                  </button>
                )}
                {scenes.length > 0 && scenes.every(s => s.videoStatus === 'done') && (
                  <button
                    onClick={mergeAllVideos}
                    disabled={isMerging}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-sm font-medium text-white hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-40 transition-all"
                  >
                    {isMerging ? <><RefreshCw className="w-4 h-4 animate-spin" /> Merging...</> : <><Scissors className="w-4 h-4" /> Merge Final Video</>}
                  </button>
                )}
              </div>
            </div>

            {/* Merged video player */}
            {mergedVideoUrl && (
              <div className="mb-4 glass-card p-5 flex items-center gap-5">
                <video src={mergedVideoUrl} controls className="h-32 rounded-xl ring-1 ring-border-subtle" />
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-medium text-text-primary">Final video ready — {scenes.length} scenes merged</p>
                  <a
                    href={mergedVideoUrl}
                    download="final_video.mp4"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-sm font-medium text-white hover:shadow-lg hover:shadow-cyan-500/20 transition-all w-fit"
                  >
                    <Download className="w-4 h-4" /> Download MP4
                  </a>
                </div>
              </div>
            )}

            {isMerging && (
              <div className="mb-3 flex items-center gap-3 px-4 py-3 glass-card rounded-xl">
                <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                <span className="text-sm text-text-secondary">Downloading and merging {scenes.length} clips with ffmpeg...</span>
              </div>
            )}

            {/* Photo progress */}
            {scenes.length > 0 && (
              <div className="mb-1">
                <div className="flex justify-between text-[10px] text-text-muted mb-1">
                  <span>Photos</span>
                  <span className="tabular-nums">{doneCount}/{scenes.length}</span>
                </div>
                <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden mb-2">
                  <div className="progress-bar h-full" style={{ width: `${scenes.length ? (doneCount / scenes.length) * 100 : 0}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-text-muted mb-1">
                  <span>Videos (Kling AI)</span>
                  <span className="tabular-nums">{videoDoneCount}/{scenes.length}</span>
                </div>
                <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500" style={{ width: `${scenes.length ? (videoDoneCount / scenes.length) * 100 : 0}%` }} />
                </div>
              </div>
            )}

            {/* Generation progress indicator */}
            {isGeneratingAll && generationProgress && (
              <div className="mb-3 glass-card p-4 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-text-primary">
                    Generating scene {generationProgress.currentScene} of {generationProgress.totalScenes}
                  </span>
                  <span className="text-xs text-text-muted tabular-nums">
                    {generationProgress.completedItems.length}/{generationProgress.totalScenes} done
                  </span>
                </div>
                <div className="w-full h-2 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full transition-all duration-500"
                    style={{ width: `${(generationProgress.completedItems.length / generationProgress.totalScenes) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Completed items preview strip */}
            {generationProgress && generationProgress.completedItems.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] text-text-muted mb-2">Completed</p>
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                  {generationProgress.completedItems.map((item, i) => (
                    <div key={i} className="shrink-0 w-24 rounded-lg overflow-hidden ring-1 ring-border-subtle bg-surface-2">
                      {item.type === 'video' ? (
                        <video src={item.url} className="w-full aspect-video object-cover" muted />
                      ) : (
                        <img src={item.url} alt={`Scene ${item.sceneIdx + 1}`} className="w-full aspect-video object-cover" />
                      )}
                      <p className="text-[9px] text-text-muted text-center py-1">Scene {item.sceneIdx + 1}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Download All button */}
            {doneCount > 0 && !isGeneratingAll && (
              <div className="mb-3 flex gap-2">
                <button
                  onClick={() => {
                    scenes.forEach((s, idx) => {
                      if (s.imageUrl) {
                        const a = document.createElement('a');
                        a.href = s.imageUrl;
                        a.download = `scene_${idx + 1}_image.png`;
                        a.click();
                      }
                      if (s.videoUrl) {
                        const a = document.createElement('a');
                        a.href = s.videoUrl;
                        a.download = `scene_${idx + 1}_video.mp4`;
                        a.click();
                      }
                    });
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download All ({doneCount} scenes)
                </button>
              </div>
            )}

            {doneCount === 0 && !isGeneratingAll ? (
              <div className="flex-1 glass-card rounded-2xl flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-border-subtle flex items-center justify-center mb-4">
                  <Film className="w-10 h-10 text-text-muted" />
                </div>
                <h3 className="text-lg font-semibold text-text-tertiary mb-1">Ready to Generate</h3>
                <p className="text-xs text-text-muted max-w-sm text-center">
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
                      <div className="aspect-video rounded-xl bg-surface-2 ring-1 ring-border-subtle overflow-hidden flex items-center justify-center mb-2 relative">
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
                            {scene.videoStatus === 'processing' || scene.videoStatus === 'queued' ? (
                              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-1">
                                <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
                                <span className="text-[10px] text-cyan-400">Kling AI...</span>
                              </div>
                            ) : scene.videoStatus === 'failed' ? (
                              <div className="absolute bottom-1 right-1 badge bg-red-500/80 text-white border-transparent">video failed</div>
                            ) : null}
                          </>
                        ) : scene.status === 'generating' ? (
                          <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
                        ) : (
                          <Image className="w-8 h-8 text-text-muted" />
                        )}
                      </div>

                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-text-secondary">Scene {idx + 1}</span>
                        {scene.status === 'done' && <CheckCircle className="w-3 h-3 text-green-400" />}
                        {scene.status === 'generating' && <RefreshCw className="w-3 h-3 text-purple-400 animate-spin" />}
                        {scene.videoStatus === 'done' && <Film className="w-3 h-3 text-cyan-400" />}
                        {(scene.videoStatus === 'processing' || scene.videoStatus === 'queued') && <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />}
                        {scene.useMasterChar && masterCharLocked && <Lock className="w-3 h-3 text-purple-400/50" />}
                      </div>
                      <p className="text-[11px] text-text-muted line-clamp-2 mb-2">{scene.prompt}</p>

                      {/* Action buttons */}
                      <div className="flex gap-1 mt-auto">
                        {scene.status !== 'generating' && scene.status !== 'done' && (
                          <button
                            onClick={() => generateScene(scene)}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg btn-ghost text-[11px]"
                          >
                            <Wand2 className="w-3 h-3" /> Photo
                          </button>
                        )}
                        {scene.status === 'done' && scene.videoStatus === 'idle' && (
                          <button
                            onClick={() => {
                              const nextScene = idx < scenes.length - 1 ? scenes[idx + 1] : null;
                              generateKlingVideoForPair(scene, nextScene);
                            }}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 text-[11px] text-cyan-400 transition-all"
                          >
                            <Film className="w-3 h-3" /> Video
                          </button>
                        )}
                        {scene.videoStatus === 'failed' && (
                          <button
                            onClick={() => {
                              const nextScene = idx < scenes.length - 1 ? scenes[idx + 1] : null;
                              generateKlingVideoForPair(scene, nextScene);
                            }}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-[11px] text-red-400 transition-all"
                          >
                            <RefreshCw className="w-3 h-3" /> Retry Video
                          </button>
                        )}
                        {scene.videoUrl && (
                          <a
                            href={scene.videoUrl}
                            download={`scene_${idx + 1}.mp4`}
                            className="flex items-center justify-center px-2 py-1.5 rounded-lg btn-ghost text-[11px]"
                            title="Download video"
                          >
                            <Download className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Final video modal */}
            {showFinalModal && mergedVideoUrl && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <div className="glass-card p-8 max-w-md text-center">
                  <div className="text-lg font-semibold text-text-primary mb-2">Final video ready</div>
                  <p className="text-sm text-text-muted mb-5">
                    Merge complete — saved to Library.
                  </p>
                  <video src={mergedVideoUrl} controls className="w-full rounded-lg mb-5" />
                  <div className="flex gap-2 justify-center">
                    <a href={mergedVideoUrl} download="final.mp4" className="btn-primary px-4 py-2 rounded-lg text-sm">Download</a>
                    <button onClick={() => setShowFinalModal(false)} className="px-4 py-2 rounded-lg text-sm bg-white/[0.06] text-text-primary">Close</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
