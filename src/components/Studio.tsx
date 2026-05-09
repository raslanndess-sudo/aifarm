'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { Wand2, Lock, Unlock, ChevronRight, ChevronLeft, Image, RefreshCw, CheckCircle, Film, Layers, User, FileText, Upload, X, Plus, RotateCw, Download, Scissors, Square, PackageOpen, Mic, Play, Volume2, Loader } from 'lucide-react';
import HiggsfieldStatusIndicator from '@/components/HiggsfieldStatusIndicator';
import TrimAudioModal from '@/components/TrimAudioModal';
import { IMAGE_MODEL_PRICING, VIDEO_MODEL_PRICING, estimateRunCost, formatTokens } from '@/lib/pricing';

const STYLES = ['Anime', 'Cyberpunk', 'Realistic', 'Ghibli', 'Seinen', 'Mecha'] as const;
type Style = typeof STYLES[number];

type VoiceLibEntry = {
  id: string;
  label: string;
  description: string;
  voiceId: string;
  gender: 'M' | 'F';
  category: string;
};

interface Scene {
  id: string;
  prompt: string;
  animationPrompt: string;
  imageUrl: string | null;
  videoUrl: string | null;
  videoTaskId: string | null;
  videoSubmitTime?: number;
  useMasterChar: boolean;
  status: 'idle' | 'generating' | 'done';
  videoStatus: 'idle' | 'queued' | 'processing' | 'done' | 'failed';
  dbVideoId: number | null;
}

interface AISceneSuggestion {
  description: string;
  image_prompt: string;
  animation_prompt: string;
  duration_s: number;
}

// Mirror of MAX_CONSECUTIVE_MODERATION_FAILS in higgsfield-web.ts. Used in the
// content-policy banner shown to the user when the whole prompt is flagged.
const MAX_CONSECUTIVE_FAIL_SCENES_LABEL = 2;

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
  { id: 1, label: 'Script',     roman: 'I' },
  { id: 2, label: 'Character',  roman: 'II' },
  { id: 3, label: 'Storyboard', roman: 'III' },
  { id: 4, label: 'Voiceover',  roman: 'IV' },
  { id: 5, label: 'Generate',   roman: 'V' },
] as const;

export default function Studio() {
  const [step, setStep] = useState(1);
  const [script, setScript] = useState('');
  const [style, setStyle] = useState<Style>('Anime');
  const [sceneCount, setSceneCount] = useState<number>(6);
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
  const [addingSubs, setAddingSubs] = useState(false);
  const [addSubsError, setAddSubsError] = useState<string | null>(null);
  const [refPhotos, setRefPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [isFusingPhotos, setIsFusingPhotos] = useState(false);
  const [providerMode, setProviderMode] = useState<'api' | 'higgsfield'>('api');
  const [imageProvider, setImageProvider] = useState('leonardo');
  const [videoProvider, setVideoProvider] = useState('kling-direct');
  const [tokenBalance, setTokenBalance] = useState(0);
  const [autoEnhance, setAutoEnhance] = useState(true);
  const [isAIPlanning, setIsAIPlanning] = useState(false);
  const [aiPlanError, setAIPlanError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<'idle' | 'generating' | 'ready' | 'failed'>('idle');
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [voiceMeta, setVoiceMeta] = useState<{ narration?: string; voiceTone?: string } | null>(null);
  const [voiceProvider] = useState<'api' | 'higgsfield'>('api');
  const [selectedVoice, setSelectedVoice] = useState<string>('rachel');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const [voiceLibrary, setVoiceLibrary] = useState<VoiceLibEntry[]>([]);
  const [voiceLibLoading, setVoiceLibLoading] = useState(true);
  const [customVoiceText, setCustomVoiceText] = useState('');
  const [voiceFormat, setVoiceFormat] = useState<'narrator' | 'marketing' | 'dialogue' | 'tutorial'>('narrator');
  const [generatingText, setGeneratingText] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [musicLibrary, setMusicLibrary] = useState<{ categories: { name: string; trackCount: number; tracks: { id: string; name: string; subfolder: string | null; durationS: number | null; sizeBytes: number }[] }[]; totalTracks: number } | null>(null);
  const [musicLoading, setMusicLoading] = useState(false);
  const [selectedMusicCategory, setSelectedMusicCategory] = useState<string | null>(null);
  const [selectedMusicId, setSelectedMusicId] = useState<string | null>(null);
  const [musicVolume, setMusicVolume] = useState(0.3);
  const [musicDucking, setMusicDucking] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionsStyle, setCaptionsStyle] = useState<'default' | 'karaoke' | 'minimal' | 'bouncy'>('default');
  const [captionsPosition, setCaptionsPosition] = useState<'bottom' | 'center' | 'top'>('bottom');
  const [captionsLang, setCaptionsLang] = useState<'auto' | 'en' | 'ru' | 'kk'>('auto');
  const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
  const [musicStart, setMusicStart] = useState(0);
  const [musicTrimDuration, setMusicTrimDuration] = useState<number | null>(null);
  const [trimModalOpen, setTrimModalOpen] = useState(false);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceCacheRef = useRef<Map<string, string>>(new Map());
  // Tracks the script that produced the current `scenes` so we can re-plan
  // automatically when the user edits the script and returns to Step 3.
  const [lastPlannedScript, setLastPlannedScript] = useState<string>('');
  const [generationProgress, setGenerationProgress] = useState<{
    currentScene: number;
    totalScenes: number;
    completedItems: Array<{ type: 'image' | 'video'; url: string; sceneIdx: number }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  // ── Persist Studio state in localStorage ──
  const STUDIO_STATE_KEY = 'studio-state-v1';

  // Rehydrate on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STUDIO_STATE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.script !== undefined) setScript(s.script);
      if (s.scenes) setScenes(s.scenes);
      if (s.step !== undefined) setStep(s.step);
      if (s.style) setStyle(s.style);
      if (s.aspectRatio) setAspectRatio(s.aspectRatio);
      if (s.sceneCount !== undefined) setSceneCount(s.sceneCount);
      if (s.masterCharLocked !== undefined) setMasterCharLocked(s.masterCharLocked);
      if (s.masterCharImage !== undefined) setMasterCharImage(s.masterCharImage);
      if (s.masterCharDesc !== undefined) setMasterCharDesc(s.masterCharDesc);
      if (s.selectedVoice) setSelectedVoice(s.selectedVoice);
      if (s.voiceFormat) setVoiceFormat(s.voiceFormat);
      if (s.customVoiceText !== undefined) setCustomVoiceText(s.customVoiceText);
      if (s.voiceUrl !== undefined) setVoiceUrl(s.voiceUrl);
      if (s.voiceMeta !== undefined) setVoiceMeta(s.voiceMeta);
      if (s.selectedMusicCategory !== undefined) setSelectedMusicCategory(s.selectedMusicCategory);
      if (s.selectedMusicId !== undefined) setSelectedMusicId(s.selectedMusicId);
      if (s.musicVolume !== undefined) setMusicVolume(s.musicVolume);
      if (s.musicDucking !== undefined) setMusicDucking(s.musicDucking);
      if (s.musicStart !== undefined) setMusicStart(s.musicStart);
      if (s.musicTrimDuration !== undefined) setMusicTrimDuration(s.musicTrimDuration);
      if (s.captionsEnabled !== undefined) setCaptionsEnabled(s.captionsEnabled);
      if (s.captionsStyle) setCaptionsStyle(s.captionsStyle);
      if (s.captionsPosition) setCaptionsPosition(s.captionsPosition);
      if (s.captionsLang) setCaptionsLang(s.captionsLang);
      if (s.imageProvider) setImageProvider(s.imageProvider);
      if (s.videoProvider) setVideoProvider(s.videoProvider);
      if (s.klingDuration) setKlingDuration(s.klingDuration);
      if (s.autoEnhance !== undefined) setAutoEnhance(s.autoEnhance);
      if (s.autoGenerateVideo !== undefined) setAutoGenerateVideo(s.autoGenerateVideo);
      if (s.mergedVideoUrl !== undefined) setMergedVideoUrl(s.mergedVideoUrl);
      if (s.lastPlannedScript !== undefined) setLastPlannedScript(s.lastPlannedScript);
    } catch (err) {
      console.warn('[studio] rehydrate failed:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on every change
  useEffect(() => {
    try {
      localStorage.setItem(STUDIO_STATE_KEY, JSON.stringify({
        script, scenes, step, style, aspectRatio, sceneCount,
        masterCharLocked, masterCharImage, masterCharDesc,
        selectedVoice, voiceFormat, customVoiceText, voiceUrl, voiceMeta,
        selectedMusicCategory, selectedMusicId, musicVolume, musicDucking, musicStart, musicTrimDuration,
        captionsEnabled, captionsStyle, captionsPosition, captionsLang,
        imageProvider, videoProvider, klingDuration,
        autoEnhance, autoGenerateVideo, mergedVideoUrl, lastPlannedScript,
      }));
    } catch { /* quota exceeded — non-critical */ }
  }, [
    script, scenes, step, style, aspectRatio, sceneCount,
    masterCharLocked, masterCharImage, masterCharDesc,
    selectedVoice, voiceFormat, customVoiceText, voiceUrl, voiceMeta,
    selectedMusicCategory, selectedMusicId, musicVolume, musicDucking, musicStart, musicTrimDuration,
    captionsEnabled, captionsStyle, captionsPosition, captionsLang,
    imageProvider, videoProvider, klingDuration,
    autoEnhance, autoGenerateVideo, mergedVideoUrl, lastPlannedScript,
  ]);

  // Fetch provider_mode on mount
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d.provider_mode) setProviderMode(d.provider_mode);
        if (d.image_provider) setImageProvider(d.image_provider);
        if (d.video_provider) setVideoProvider(d.video_provider);
        if (d.balance) setTokenBalance(parseInt(d.balance, 10) || 0);
      })
      .catch(() => {});
  }, []);

  // Fetch voice library on mount
  useEffect(() => {
    fetch('/api/voice-library')
      .then(r => r.json())
      .then(d => {
        const voices: VoiceLibEntry[] = d.voices ?? [];
        setVoiceLibrary(voices);
        if (voices.length > 0 && !voices.find(v => v.id === selectedVoice)) {
          setSelectedVoice(voices[0].id);
        }
      })
      .catch(() => setVoiceLibrary([]))
      .finally(() => setVoiceLibLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy-fetch music library when Step 4 opens
  useEffect(() => {
    if (step === 4 && !musicLibrary && !musicLoading) {
      setMusicLoading(true);
      fetch('/api/music/library')
        .then(r => r.json())
        .then(d => {
          setMusicLibrary(d);
          if (d.categories?.[0]) setSelectedMusicCategory(d.categories[0].name);
        })
        .catch(err => console.warn('[music] library fetch failed:', err))
        .finally(() => setMusicLoading(false));
    }
  }, [step, musicLibrary, musicLoading]);

  const toggleMusicPlay = (trackId: string) => {
    if (musicAudioRef.current && playingMusicId === trackId) {
      musicAudioRef.current.pause();
      setPlayingMusicId(null);
      return;
    }
    if (musicAudioRef.current) musicAudioRef.current.pause();
    const audio = new Audio(`/api/music/file?id=${encodeURIComponent(trackId)}`);
    audio.addEventListener('ended', () => setPlayingMusicId(null));
    audio.volume = 0.7;
    audio.play();
    musicAudioRef.current = audio;
    setPlayingMusicId(trackId);
  };

  const stopMusic = () => {
    if (musicAudioRef.current) { musicAudioRef.current.pause(); musicAudioRef.current = null; }
    setPlayingMusicId(null);
  };

  // Reset trim when music selection changes
  useEffect(() => {
    setMusicStart(0);
    setMusicTrimDuration(null);
  }, [selectedMusicId]);

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

  const planScenesWithAI = async (opts?: { advanceToStep?: number; sceneCount?: number }) => {
    if (!script.trim()) return false;
    setIsAIPlanning(true);
    setAIPlanError(null);
    try {
      const res = await fetch('/api/scenes/plan-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script,
          sceneCount: opts?.sceneCount ?? sceneCount,
          style: style.toLowerCase(),
        }),
      });
      if (!res.ok) throw new Error('API error');
      const data: { scenes: AISceneSuggestion[] } = await res.json();
      if (!data.scenes || data.scenes.length < 1) {
        throw new Error('Не удалось получить сцены');
      }
      const prefix = ASPECT_TEMPLATES[aspectRatio].imagePrefix;
      setScenes(data.scenes.map((s, i) => ({
        id: `scene_ai_${i}`,
        prompt: prefix + s.image_prompt,
        imageUrl: null,
        videoUrl: null,
        videoTaskId: null,
        useMasterChar: masterCharLocked,
        status: 'idle',
        videoStatus: 'idle',
        dbVideoId: null,
        animationPrompt: s.animation_prompt,
      })));
      setLastPlannedScript(script);
      if (opts?.advanceToStep) setStep(opts.advanceToStep);
      return true;
    } catch (err) {
      setAIPlanError(err instanceof Error ? err.message : 'Не удалось сгенерировать сцены');
      return false;
    } finally {
      setIsAIPlanning(false);
    }
  };

  const parseScenes = () => {
    const lines = splitIntoScenes(script);
    if (!lines.length) return;
    const prefix = ASPECT_TEMPLATES[aspectRatio].imagePrefix;
    setScenes(lines.map((p, i) => ({
      id: `scene_${i}`,
      prompt: prefix + p,
      imageUrl: null,
      videoUrl: null,
      videoTaskId: null,
      useMasterChar: masterCharLocked,
      status: 'idle',
      videoStatus: 'idle',
      dbVideoId: null,
      animationPrompt: deriveAnimationPrompt(p, aspectRatio),
    })));
    setLastPlannedScript(script);
  };

  const toggleUseMasterChar = (id: string) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, useMasterChar: !s.useMasterChar } : s));
  };

  const updateScenePrompt = (id: string, prompt: string) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, prompt } : s));
  };

  const updateAnimationPrompt = (id: string, animationPrompt: string) => {
    setScenes(prev => prev.map(s =>
      s.id === id ? { ...s, animationPrompt: animationPrompt } : s
    ));
  };

  const addScene = () => {
    setScenes(prev => [...prev, {
      id: `scene_${Date.now()}`,
      prompt: '',
      animationPrompt: deriveAnimationPrompt('', aspectRatio),
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

  /** Merge all done videos with voice + music via /api/scenario/finalize */
  const mergeAllVideos = async () => {
    const videoUrls = scenes
      .filter(s => s.videoStatus === 'done' && s.videoUrl)
      .map(s => s.videoUrl!);

    if (videoUrls.length === 0) return;
    setIsMerging(true);
    setMergedVideoUrl(null);
    try {
      // If voice not yet generated and not currently in flight, fire it now.
      let resolvedVoiceUrl = voiceUrl;
      if (!resolvedVoiceUrl && voiceState !== 'generating') {
        setVoiceState('generating');
        try {
          const totalDurationS = scenes.length * parseInt(klingDuration);
          const vRes = await fetch('/api/scenario/voiceover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scenes: scenes.map(s => ({
                description: s.prompt.slice(0, 200),
                animation_prompt: s.animationPrompt,
              })),
              totalDurationS,
              provider: 'api',
              voice: selectedVoice,
              customText: customVoiceText.trim() || undefined,
            }),
          });
          if (vRes.ok) {
            const vData = await vRes.json();
            resolvedVoiceUrl = vData.voiceUrl;
            setVoiceUrl(vData.voiceUrl);
            setVoiceMeta({ narration: vData.narration, voiceTone: vData.voiceTone });
            setVoiceState('ready');
          } else {
            setVoiceState('failed');
          }
        } catch {
          setVoiceState('failed');
        }
      }

      // Generate captions for merge path
      let mergeCaptionsPath: string | undefined;
      if (captionsEnabled && resolvedVoiceUrl) {
        try {
          const capRes = await fetch('/api/scenario/captions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voiceUrl: resolvedVoiceUrl, language: captionsLang, aspectRatio, position: captionsPosition }),
          });
          const capData = await capRes.json();
          mergeCaptionsPath = capData.captionsUrl ?? undefined;
        } catch (err) { console.warn('[captions] merge path failed:', err); }
      }

      const res = await fetch('/api/scenario/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingVideoUrls: videoUrls,
          voiceUrl: resolvedVoiceUrl ?? undefined,
          musicId: selectedMusicId ?? undefined,
          musicVolume: selectedMusicId ? musicVolume : undefined,
          ducking: selectedMusicId ? musicDucking : undefined,
          musicStart: selectedMusicId && musicStart > 0 ? musicStart : undefined,
          musicDuration: selectedMusicId && musicTrimDuration ? musicTrimDuration : undefined,
          captionsAssPath: mergeCaptionsPath,
          captionsEnabled,
        }),
      });
      const data = await res.json();
      if (data.finalUrl) {
        setMergedVideoUrl(data.finalUrl);
        setShowFinalModal(true);
        // DB row already created by finalize endpoint, no second insert
      } else {
        console.error('[mergeAllVideos] finalize failed', data);
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
      // AI-planned animation prompt describes motion only — start frame is already supplied via imageUrl.
      // Falls back to keyword-derived motion if no AI prompt was provided.
      const animPrompt = (scene.animationPrompt && scene.animationPrompt.trim().length > 0)
        ? scene.animationPrompt
        : deriveAnimationPrompt(scene.prompt, aspectRatio);
      const body: Record<string, unknown> = {
        imageUrl: scene.imageUrl,
        animationPrompt: animPrompt,
        modelName: klingModel,
        duration: klingDuration,
        mode: 'std',
        waitForResult: false,
        videoProvider,
        aspectRatio,
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
        // Accept both Kling-direct ('succeed') and fal.ai-mapped ('completed')
        if ((data.status === 'succeed' || data.status === 'completed') && data.videoUrl) {
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
          imageProvider,
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
    // If we have stale results from a previous run (final video saved or any scene already has a
    // finished clip), ask whether to regenerate everything. Otherwise the pendingHF filter would
    // skip those scenes and leave the user stuck with old clips they wanted thrown out.
    const hasStaleFinal = !!mergedVideoUrl;
    const hasFinishedClips = scenes.some(s => s.videoStatus === 'done');
    if (hasStaleFinal || hasFinishedClips) {
      const ok = window.confirm('Перегенерировать ВСЕ видео заново? Старые клипы будут заменены.');
      if (!ok) return;
      setScenes(prev => prev.map(s => ({
        ...s,
        videoStatus: 'idle' as const,
        videoUrl: null,
        videoTaskId: null,
        videoSubmitTime: undefined,
      })));
      setMergedVideoUrl(null);
      // Wait one tick so the state update lands before we read scenes below.
      await new Promise(r => setTimeout(r, 50));
    }

    abortRef.current = false;
    setIsGeneratingAll(true);
    const pending = scenes.filter(s => s.status !== 'done');
    const total = scenes.length;
    setGenerationProgress({ currentScene: 0, totalScenes: total, completedItems: [] });

    // ── Higgsfield mode: optimised submit-only pipeline ─────────────────────────
    // Per scene sequentially: image (await full) → video (submit only, ~3s) → next scene's image.
    // After ALL submits done: hit /api/scenario/finalize which batch-collects all mp4s + ffmpeg-merges.
    // This keeps the Higgsfield browser singleton busy with image-gen while video clips bake in the cloud.
    if (providerMode === 'higgsfield') {
      const submittedJobs: Array<{ jobId: string; submitTime: number; sceneId: string }> = [];
      // pending = needs image OR auto-video enabled + video not done yet (covers retry after partial failure)
      const pendingHF = scenes.filter(s =>
        s.status !== 'done' || (autoGenerateVideo && s.videoStatus !== 'done')
      );

      // Fire voiceover generation in parallel with video pipeline.
      // We'll await the result inside the finalize call.
      setVoiceState('generating');
      const totalDurationS = pendingHF.length * parseInt(klingDuration);
      const voicePromise = fetch('/api/scenario/voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: pendingHF.map(s => ({
            description: s.prompt.slice(0, 200),
            animation_prompt: s.animationPrompt,
          })),
          totalDurationS,
          provider: 'api',
          voice: selectedVoice,
          customText: customVoiceText.trim() || undefined,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          setVoiceState('failed');
          return null;
        }
        const data = await res.json();
        setVoiceUrl(data.voiceUrl);
        setVoiceMeta({ narration: data.narration, voiceTone: data.voiceTone });
        setVoiceState('ready');
        return data;
      }).catch(() => {
        setVoiceState('failed');
        return null;
      });

      for (let i = 0; i < pendingHF.length; i++) {
        if (abortRef.current) {
          console.log('[Studio] abort requested, breaking scene loop');
          break;
        }
        const scene = pendingHF[i];
        const sceneIdx = scenes.indexOf(scene);
        setGenerationProgress(prev => prev ? { ...prev, currentScene: sceneIdx + 1 } : prev);

        // 1. Image — only run if not already done.
        let imageUrl: string | null = scene.imageUrl;
        if (scene.status !== 'done' || !imageUrl) {
          setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: 'generating' } : s));
          try {
            const useChar = masterCharLocked && masterCharImage;
            const imgRes = await fetch('/api/cref/generate-scene', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                scenePrompt: scene.prompt,
                style: style.toLowerCase(),
                aspectRatio,
                imageProvider,
                ...(useChar ? {
                  characterDescription: masterCharDesc,
                  characterRefImageUrl: masterCharImage,
                } : {}),
              }),
            });
            if (imgRes.ok) {
              const imgData = await imgRes.json();
              imageUrl = imgData.imageUrl ?? null;
            } else {
              const err = await imgRes.json().catch(() => ({}));
              console.error(`[scene ${sceneIdx + 1}] image generation HTTP ${imgRes.status}:`, err.error);
              // Higgsfield content policy fired N consecutive scenes — the whole
              // script is flagged. Stop the run so we don't burn credits on the
              // remaining scenes that will hit the same wall.
              if (imgRes.status === 451 || err?.abortAll) {
                abortRef.current = true;
                setAIPlanError(
                  `Higgsfield заблокировал ${MAX_CONSECUTIVE_FAIL_SCENES_LABEL} сцен подряд по content policy. Скорее всего весь промпт триггерит модерацию (athletic, blonde, anatomy, поза). Перепиши сценарий — убери триггеры и попробуй снова.`,
                );
                setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: 'idle' } : s));
                break;
              }
            }
          } catch (err) {
            console.error(`[scene ${sceneIdx + 1}] image fetch threw:`, err);
          }

          if (!imageUrl) {
            setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: 'idle' } : s));
            continue;
          }
          setScenes(prev => prev.map(s =>
            s.id === scene.id ? { ...s, imageUrl, status: 'done' } : s
          ));
          setGenerationProgress(prev => prev ? {
            ...prev,
            completedItems: [...prev.completedItems, { type: 'image', url: imageUrl!, sceneIdx }],
          } : prev);
        }

        // 2. Video submit-only — Higgsfield UI clicks submit, returns ~3s later. Cloud bakes the clip in background.
        if (autoGenerateVideo && scene.videoStatus !== 'done') {
          setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, videoStatus: 'processing' } : s));
          try {
            const animPrompt = (scene.animationPrompt && scene.animationPrompt.trim().length > 0)
              ? scene.animationPrompt
              : deriveAnimationPrompt(scene.prompt, aspectRatio);
            const vidRes = await fetch('/api/kling/generate-video', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageUrl,
                animationPrompt: animPrompt,
                modelName: klingModel,
                duration: klingDuration,
                mode: 'std',
                submitOnly: true,
                videoProvider,
              }),
            });
            if (!vidRes.ok) {
              const err = await vidRes.json().catch(() => ({}));
              console.error(`[scene ${sceneIdx + 1}] video submit HTTP ${vidRes.status}:`, err.error);
              setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, videoStatus: 'failed' } : s));
              continue;
            }
            const vidData = await vidRes.json();
            if (vidData.taskId && vidData.submitTime) {
              submittedJobs.push({ jobId: vidData.taskId, submitTime: vidData.submitTime, sceneId: scene.id });
              setScenes(prev => prev.map(s =>
                s.id === scene.id
                  ? { ...s, videoTaskId: vidData.taskId, videoSubmitTime: vidData.submitTime }
                  : s,
              ));
            } else {
              setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, videoStatus: 'failed' } : s));
            }
          } catch (err) {
            console.error(`[scene ${sceneIdx + 1}] video fetch threw:`, err);
            setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, videoStatus: 'failed' } : s));
          }
        }
      }

      // 3. All N videos submitted to Higgsfield cloud queue. Now batch-collect & merge.
      if (abortRef.current) {
        setAIPlanError('Прогон остановлен. Все промежуточные файлы удалены.');
        setIsGeneratingAll(false);
        setGenerationProgress(null);
        setVoiceState('idle');
        setVoiceUrl(null);
        setVoiceMeta(null);
        setScenes(prev => prev.map(s => ({
          ...s,
          imageUrl: null,
          videoUrl: null,
          videoTaskId: null,
          videoSubmitTime: undefined,
          status: 'idle' as const,
          videoStatus: 'idle' as const,
        })));
        try {
          await fetch('/api/admin/higgsfield/resume', { method: 'POST' });
        } catch { /* non-critical */ }
        try {
          await fetch('/api/scenario/cleanup', { method: 'POST' });
        } catch { /* non-critical */ }
        return;
      }
      if (submittedJobs.length > 0) {
        try {
          // Wait for voiceover (parallel) before finalize — at this point video bake usually
          // already done so voice should be ready in <1s of additional wait.
          const voiceData = await voicePromise;

          // Generate captions if enabled and voice is ready
          let captionsAssPath: string | undefined;
          if (captionsEnabled && voiceData?.voiceUrl) {
            try {
              const capRes = await fetch('/api/scenario/captions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  voiceUrl: voiceData.voiceUrl,
                  language: captionsLang,
                  aspectRatio,
                  position: captionsPosition,
                }),
              });
              const capData = await capRes.json();
              captionsAssPath = capData.captionsUrl ?? undefined;
            } catch (err) {
              console.warn('[captions] failed:', err);
            }
          }

          const finRes = await fetch('/api/scenario/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              submittedJobs: submittedJobs.map(j => ({ jobId: j.jobId, submitTime: j.submitTime })),
              voiceUrl: voiceData?.voiceUrl ?? undefined,
              musicId: selectedMusicId ?? undefined,
              musicVolume: selectedMusicId ? musicVolume : undefined,
              ducking: selectedMusicId ? musicDucking : undefined,
              musicStart: selectedMusicId && musicStart > 0 ? musicStart : undefined,
              musicDuration: selectedMusicId && musicTrimDuration ? musicTrimDuration : undefined,
              captionsAssPath,
              captionsEnabled,
            }),
          });
          const finData = await finRes.json();
          if (finData.finalUrl) {
            // Map clipUrls back to scenes by submit order
            setScenes(prev => prev.map(s => {
              const submitIdx = submittedJobs.findIndex(j => j.sceneId === s.id);
              if (submitIdx < 0) return s;
              const clipUrl = (finData.clipUrls as string[])?.[submitIdx];
              return clipUrl ? { ...s, videoUrl: clipUrl, videoStatus: 'done' } : { ...s, videoStatus: 'failed' };
            }));
            setMergedVideoUrl(finData.finalUrl);
            setShowFinalModal(true);

            // Auto-trigger browser download of final.mp4
            try {
              const a = document.createElement('a');
              a.href = finData.finalUrl;
              a.download = `final_${style.toLowerCase()}_${scenes.length}scenes.mp4`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            } catch { /* download non-critical */ }

            // NOTE: Library DB record is created atomically by /api/scenario/finalize
            // (INSERT INTO videos with title 'Final Cut (N clips)'). No second POST here —
            // it would create a duplicate row pointing at the same final.mp4.
          }
        } catch (err) {
          console.error('[scenario/finalize] failed:', err);
        }
      }

      setIsGeneratingAll(false);
      setGenerationProgress(null);
      return;
    }

    // ── Kling API mode: all images first, then videos in pairs ─────────────
    // Phase 1: generate all images
    for (let i = 0; i < pending.length; i++) {
      const sceneIdx = scenes.indexOf(pending[i]);
      setGenerationProgress(prev => prev ? { ...prev, currentScene: sceneIdx + 1 } : prev);
      setScenes(prev => prev.map(s => s.id === pending[i].id ? { ...s, status: 'generating' } : s));
      try {
        const useChar = masterCharLocked && masterCharImage;
        const res = await fetch('/api/cref/generate-scene', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenePrompt: pending[i].prompt,
            style: style.toLowerCase(),
            aspectRatio,
            imageProvider,
            ...(useChar ? { characterDescription: masterCharDesc, characterRefImageUrl: masterCharImage } : {}),
          }),
        });
        const data = await res.json();
        const imageUrl = data.imageUrl ?? null;
        setScenes(prev => prev.map(s => s.id === pending[i].id ? { ...s, imageUrl, status: imageUrl ? 'done' : 'idle' } : s));
        if (imageUrl) {
          setGenerationProgress(prev => prev ? {
            ...prev,
            completedItems: [...prev.completedItems, { type: 'image', url: imageUrl, sceneIdx }],
          } : prev);
        }
      } catch {
        setScenes(prev => prev.map(s => s.id === pending[i].id ? { ...s, status: 'idle' } : s));
      }
    }

    // Fire voiceover generation in parallel with video pipeline (api-branch).
    let freshAfterImage: Scene[] = [];
    setScenes(prev => { freshAfterImage = prev; return prev; });
    setVoiceState('generating');
    const totalDurationS = freshAfterImage.length * parseInt(klingDuration);
    const voicePromise = fetch('/api/scenario/voiceover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenes: freshAfterImage.map(s => ({
          description: s.prompt.slice(0, 200),
          animation_prompt: s.animationPrompt,
        })),
        totalDurationS,
        provider: 'api',
        voice: selectedVoice,
        customText: customVoiceText.trim() || undefined,
      }),
    }).then(async (res) => {
      if (!res.ok) { setVoiceState('failed'); return null; }
      const data = await res.json();
      setVoiceUrl(data.voiceUrl);
      setVoiceMeta({ narration: data.narration, voiceTone: data.voiceTone });
      setVoiceState('ready');
      return data;
    }).catch(() => { setVoiceState('failed'); return null; });

    // Phase 2: generate videos between pairs of adjacent scenes
    if (autoGenerateVideo) {
      let freshScenes: Scene[] = [];
      setScenes(prev => { freshScenes = prev; return prev; });
      for (let i = 0; i < freshScenes.length; i++) {
        const scene = freshScenes[i];
        if (!scene.imageUrl || scene.videoStatus === 'done') continue;
        const nextScene = i < freshScenes.length - 1 ? freshScenes[i + 1] : null;
        await generateKlingVideoForPair(scene, nextScene);
      }

      // Wait until all polled videos complete (or 10 min max) before finalize.
      const waitStart = Date.now();
      const WAIT_MAX_MS = 10 * 60_000;
      while (Date.now() - waitStart < WAIT_MAX_MS) {
        let snapshot: Scene[] = [];
        setScenes(prev => { snapshot = prev; return prev; });
        const stillRunning = snapshot.some(s => s.imageUrl && (s.videoStatus === 'processing' || s.videoStatus === 'queued'));
        if (!stillRunning) break;
        await new Promise(r => setTimeout(r, 3000));
      }

      // Phase 3: finalize — concat clips + merge voice + merge music.
      let finalScenes: Scene[] = [];
      setScenes(prev => { finalScenes = prev; return prev; });
      const videoUrls = finalScenes
        .map(s => s.videoUrl)
        .filter((u): u is string => !!u);

      if (videoUrls.length > 0) {
        try {
          const voiceData = await voicePromise;

          // Captions for api-branch finalize
          let apiBranchCaptionsPath: string | undefined;
          if (captionsEnabled && voiceData?.voiceUrl) {
            try {
              const capRes = await fetch('/api/scenario/captions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voiceUrl: voiceData.voiceUrl, language: captionsLang, aspectRatio, position: captionsPosition }),
              });
              const capData = await capRes.json();
              apiBranchCaptionsPath = capData.captionsUrl ?? undefined;
            } catch (err) { console.warn('[captions] api-branch failed:', err); }
          }

          const finRes = await fetch('/api/scenario/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              existingVideoUrls: videoUrls,
              voiceUrl: voiceData?.voiceUrl ?? undefined,
              musicId: selectedMusicId ?? undefined,
              musicVolume: selectedMusicId ? musicVolume : undefined,
              ducking: selectedMusicId ? musicDucking : undefined,
              musicStart: selectedMusicId && musicStart > 0 ? musicStart : undefined,
              musicDuration: selectedMusicId && musicTrimDuration ? musicTrimDuration : undefined,
              captionsAssPath: apiBranchCaptionsPath,
              captionsEnabled,
            }),
          });
          if (finRes.ok) {
            const finData = await finRes.json();
            if (finData.finalUrl) setMergedVideoUrl(finData.finalUrl);
          } else {
            console.error('[scenario/finalize] api-branch HTTP', finRes.status);
          }
        } catch (err) {
          console.error('[scenario/finalize] api-branch failed:', err);
        }
      }
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

  // Auto-plan scenes via AI on every entry to Step 3 where the current scenes
  // don't match the current script. Triggers when:
  //   - scenes are empty (first time), OR
  //   - script was edited since the last successful plan (lastPlannedScript !== script)
  // Falls back to naive split if Claude CLI fails.
  useEffect(() => {
    const scriptChanged = lastPlannedScript !== script;
    const needsPlanning = scenes.length === 0 || scriptChanged;
    if (step === 3 && needsPlanning && script.trim() && !isAIPlanning) {
      if (autoEnhance) {
        void (async () => {
          const ok = await planScenesWithAI();
          if (!ok) parseScenes();
        })();
      } else {
        // Create empty scenes for manual editing
        setScenes(Array.from({ length: sceneCount }, (_, i) => ({
          id: `scene_manual_${i}`,
          prompt: '',
          animationPrompt: '',
          imageUrl: null,
          videoUrl: null,
          videoTaskId: null,
          useMasterChar: masterCharLocked,
          status: 'idle' as const,
          videoStatus: 'idle' as const,
          dbVideoId: null,
        })));
        setLastPlannedScript(script);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, script, autoEnhance]);

  // Re-trigger planScenesWithAI when toggling OFF→ON with empty prompts
  useEffect(() => {
    if (autoEnhance && step === 3 && script.trim() && !isAIPlanning) {
      const hasEmptyPrompts = scenes.some(s => !s.prompt?.trim());
      if (hasEmptyPrompts) {
        void planScenesWithAI();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEnhance]);

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
  const estimatedCost = useMemo(() => estimateRunCost(imageProvider, videoProvider, sceneCount, parseInt(klingDuration, 10)), [imageProvider, videoProvider, sceneCount, klingDuration]);
  const insufficientBalance = estimatedCost.tokens > tokenBalance;

  return (
    <div className="h-[calc(100vh-12rem)] flex flex-col">
      {/* Model pickers + estimated cost */}
      <div className="reel-studio-models">
        <div className="reel-studio-model-row">
          <div className="reel-model-block">
            <span className="section-label">Image</span>
            <select value={imageProvider} onChange={e => setImageProvider(e.target.value)} className="reel-model-select" aria-label="Image provider">
              {Object.entries(IMAGE_MODEL_PRICING).map(([k, v]) => (
                <option key={k} value={k}>{v.label} &middot; {v.tokens} tk/img</option>
              ))}
            </select>
          </div>
          <div className="reel-model-block">
            <span className="section-label">Video</span>
            <select value={videoProvider} onChange={e => setVideoProvider(e.target.value)} className="reel-model-select" aria-label="Video provider">
              {Object.entries(VIDEO_MODEL_PRICING).map(([k, v]) => (
                <option key={k} value={k}>{v.label} &middot; {v.tokens} tk/5s</option>
              ))}
            </select>
          </div>
          <div className="reel-model-block">
            <span className="section-label">Duration</span>
            <select value={klingDuration} onChange={e => setKlingDuration(e.target.value as '5' | '10')} className="reel-model-select" aria-label="Clip duration">
              <option value="5">5 seconds</option>
              <option value="10">10 seconds</option>
            </select>
          </div>
          <div className="reel-model-cost">
            <span className="section-label">Estimated cost</span>
            <div className="reel-model-cost-value">
              <span className="reel-cost-tokens tabular-nums">{formatTokens(estimatedCost.tokens)}</span>
              <span className="reel-cost-suffix">tokens</span>
            </div>
            <span className="reel-cost-usd tabular-nums">&asymp; ${estimatedCost.usd.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Reel Stepper — Roman numerals */}
      <div className="flex items-center justify-center gap-0 mb-12">
        {STEPS.map(({ id, label, roman }) => {
          const isActive = step === id;
          const isDone = id < step;
          return (
            <div key={id} className="flex items-center">
              <button
                onClick={() => setStep(id)}
                className="flex flex-col items-center px-7 py-2 cursor-pointer transition-colors duration-200"
                style={{ background: 'transparent', border: 'none' }}
              >
                <span
                  style={{
                    fontFamily: "'DM Serif Display', serif",
                    fontStyle: 'italic',
                    fontSize: '38px',
                    lineHeight: 1,
                    color: isActive ? '#ff3344' : isDone ? 'rgba(245,230,211,0.45)' : 'rgba(245,230,211,0.18)',
                    transition: 'color 0.2s',
                  }}
                >
                  {roman}
                </span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '10px',
                    letterSpacing: '0.20em',
                    textTransform: 'uppercase',
                    color: isActive ? '#f5e6d3' : 'rgba(245,230,211,0.3)',
                    marginTop: '8px',
                    transition: 'color 0.2s',
                  }}
                >
                  {label}
                </span>
              </button>
              {id < 5 && (
                <div
                  style={{
                    width: '40px',
                    height: '1px',
                    background: 'rgba(245,230,211,0.12)',
                    marginTop: '-8px',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden">
        {/* STEP 1: Script */}
        {step === 1 && (
          <div className="h-full flex flex-col">
            {/* Hero heading + Auto Enhance toggle */}
            <div className="flex items-start justify-between mb-8">
              <h1 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '52px', lineHeight: 0.95, letterSpacing: '-0.03em', color: '#f5e6d3' }}>
                Write your <em style={{ color: '#ff3344', fontStyle: 'italic' }}>screenplay</em>.
              </h1>
              <div className="flex items-center gap-4 shrink-0 mt-2">
                <div className="reel-toggle-group">
                  <span className="reel-toggle-label">Auto Enhance</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoEnhance}
                    aria-label={`Auto Enhance ${autoEnhance ? 'on' : 'off'}`}
                    onClick={() => setAutoEnhance(v => !v)}
                    className={`reel-toggle ${autoEnhance ? 'on' : 'off'}`}
                  >
                    <span className="reel-toggle-knob" />
                    <span className="reel-toggle-state">{autoEnhance ? 'ON' : 'OFF'}</span>
                  </button>
                  <span className="reel-toggle-hint">
                    {autoEnhance ? 'Claude writes scene prompts' : 'You write scene prompts'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!script.trim() && scenes.length === 0) return;
                    if (!confirm('Start a new reel? Current script and generated scenes will be cleared.')) return;
                    setScript('');
                    setScenes([]);
                    setStep(1);
                    setSceneCount(6);
                    setMasterCharLocked(false);
                    setMasterCharImage(null);
                    setMasterCharDesc('');
                    setVoiceUrl(null);
                    setVoiceMeta(null);
                    setCustomVoiceText('');
                    setSelectedMusicId(null);
                    setMusicStart(0);
                    setMusicTrimDuration(null);
                    setMergedVideoUrl(null);
                    setVoiceState('idle');
                    setLastPlannedScript('');
                    try { localStorage.removeItem(STUDIO_STATE_KEY); } catch {}
                  }}
                  className="btn-ghost reel-new-reel-btn"
                  aria-label="Start a new reel"
                  title="Clear and start over"
                >
                  <RotateCw className="w-3 h-3" /> New Reel
                </button>
              </div>
            </div>

            {/* 3-column layout */}
            <div className="flex-1 flex gap-0 min-h-0" style={{ display: 'grid', gridTemplateColumns: '80px 1fr 280px', gap: 0 }}>
              {/* Left margin — scene numbers */}
              <div style={{ borderRight: '1px solid rgba(245,230,211,0.08)', paddingRight: '24px' }} className="flex flex-col">
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '9px',
                  letterSpacing: '0.20em',
                  textTransform: 'uppercase',
                  color: 'rgba(245,230,211,0.3)',
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  marginBottom: '24px',
                }}>Scene No.</span>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', lineHeight: '1.9', color: 'rgba(245,230,211,0.3)' }}>
                  {Array.from({ length: sceneCount }, (_, i) => (
                    <div key={i} style={{ color: i === 0 ? '#ff3344' : undefined }}>
                      {String(i + 1).padStart(3, '0')}
                    </div>
                  ))}
                </div>
              </div>

              {/* Center — script textarea */}
              <div className="flex flex-col px-8">
                <textarea
                  value={script}
                  onChange={e => setScript(e.target.value)}
                  placeholder={"A young samurai stands on a cliff overlooking a burning city\nHe unsheathes his katana as cherry blossoms fall around him\nA massive dragon emerges from the smoke below\nThe samurai leaps off the cliff toward the dragon\nExplosion of fire and petals as they clash mid-air"}
                  className="flex-1 w-full input-field resize-none"
                />

                {/* Style chips */}
                <div className="flex flex-wrap gap-2 mt-6">
                  {STYLES.map(s => (
                    <button
                      key={s}
                      onClick={() => setStyle(s)}
                      className={`reel-chip ${style === s ? 'active' : ''}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {aiPlanError && (
                  <div className="mt-4 flex items-center gap-2 px-4 py-3 border text-sm" style={{ borderColor: 'rgba(255,51,68,0.3)', color: '#ff3344', background: 'rgba(255,51,68,0.05)' }}>
                    <X className="w-4 h-4 shrink-0" />
                    {aiPlanError} — попробуй ещё раз.
                    <button onClick={() => setAIPlanError(null)} className="ml-auto opacity-60 hover:opacity-100 transition-opacity">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Right — filmstrip + scene counter */}
              <div style={{ borderLeft: '1px solid rgba(245,230,211,0.08)', paddingLeft: '24px' }} className="flex flex-col">
                <span className="section-label mb-4">Reference Frames</span>
                <div className="flex flex-col gap-3 mb-6">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-full aspect-video" style={{ border: '1px solid rgba(245,230,211,0.08)', background: 'radial-gradient(circle at 50% 50%, rgba(245,230,211,0.03), transparent)' }} />
                  ))}
                </div>

                {/* Scene counter */}
                <div className="flex items-center gap-3 mt-auto">
                  <button
                    onClick={() => setSceneCount(c => Math.max(1, c - 1))}
                    disabled={sceneCount <= 1 || isAIPlanning}
                    className="btn-ghost !px-2 !py-1 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ fontSize: '14px', letterSpacing: 0 }}
                  >&minus;</button>
                  <span style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '32px', color: '#f5e6d3' }}>
                    {String(sceneCount).padStart(2, '0')}
                  </span>
                  <button
                    onClick={() => setSceneCount(c => Math.min(10, c + 1))}
                    disabled={sceneCount >= 10 || isAIPlanning}
                    className="btn-ghost !px-2 !py-1 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ fontSize: '14px', letterSpacing: 0 }}
                  >+</button>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                    Total {sceneCount * parseInt(klingDuration)}s
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom CTA */}
            <div className="flex items-center justify-between mt-8">
              <div />
              <button
                onClick={() => setStep(2)}
                disabled={!script.trim()}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cast the Characters <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Master Character */}
        {step === 2 && (
          <div className="h-full flex flex-col">
            <h1 className="mb-2" style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '42px', lineHeight: 0.95, letterSpacing: '-0.03em', color: '#f5e6d3' }}>
              Cast your <em style={{ color: '#ff3344', fontStyle: 'italic' }}>character</em>.
            </h1>
            <p className="text-sm mb-8" style={{ fontFamily: "'Fraunces', serif", color: 'rgba(245,230,211,0.7)' }}>
              Upload reference photos and the AI will fuse them into one unified Master Character.
            </p>

            <div className="flex-1 flex gap-8 min-h-0">
              {/* Left — upload + controls */}
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <span className="section-label">Reference Photos ({refPhotos.length}/10)</span>
                  <div className="flex gap-2">
                    {refPhotos.length > 0 && (
                      <button onClick={() => { refPhotos.forEach(p => URL.revokeObjectURL(p.preview)); setRefPhotos([]); }} className="btn-ghost !px-2 !py-1" style={{ fontSize: '10px' }}>
                        Clear all
                      </button>
                    )}
                    <button
                      onClick={generateCharacterFromScript}
                      disabled={!script.trim() || masterCharLocked || isGeneratingFromScript}
                      className="btn-ghost disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isGeneratingFromScript
                        ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analysing...</>
                        : <><Wand2 className="w-3.5 h-3.5" /> From Script</>}
                    </button>
                  </div>
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoUpload} className="hidden" />
                <div className="flex flex-wrap gap-2 mb-6">
                  {refPhotos.map((photo, idx) => (
                    <div key={idx} className="relative w-20 h-20 overflow-hidden group" style={{ border: '1px solid rgba(245,230,211,0.08)' }}>
                      <img src={photo.preview} alt={`Ref ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                      <div className="absolute bottom-1 left-1 text-[9px]" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(245,230,211,0.5)' }}>{String(idx + 1).padStart(2, '0')}</div>
                    </div>
                  ))}
                  {refPhotos.length < 10 && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-20 h-20 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors duration-200"
                      style={{ border: '2px dashed rgba(245,230,211,0.12)' }}
                    >
                      <Plus className="w-5 h-5" style={{ color: 'rgba(245,230,211,0.3)' }} />
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'rgba(245,230,211,0.3)' }}>Upload</span>
                    </button>
                  )}
                </div>

                <textarea
                  value={masterCharDesc}
                  onChange={e => setMasterCharDesc(e.target.value)}
                  disabled={masterCharLocked}
                  placeholder="Optional: describe your character..."
                  className="w-full input-field resize-none disabled:opacity-50"
                  style={{ height: '80px' }}
                />

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={fusePhotosIntoCharacter}
                    disabled={refPhotos.length === 0 || masterCharLocked || isFusingPhotos}
                    className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ fontSize: '14px', padding: '12px 24px' }}
                  >
                    {isFusingPhotos ? <><RefreshCw className="w-4 h-4 animate-spin" /> Fusing...</> : <><Upload className="w-4 h-4" /> Fuse ({refPhotos.length} photos)</>}
                  </button>

                  <button
                    onClick={generateHero}
                    disabled={!masterCharDesc.trim() || masterCharLocked || isGeneratingHero}
                    className="btn-ghost disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isGeneratingHero ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating...</> : <><Wand2 className="w-3.5 h-3.5" /> From Text</>}
                  </button>

                  <button
                    onClick={() => setMasterCharLocked(l => !l)}
                    disabled={!masterCharImage}
                    className="btn-ghost disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {masterCharLocked ? <><Unlock className="w-3.5 h-3.5" /> Unlock</> : <><Lock className="w-3.5 h-3.5" /> Lock</>}
                  </button>
                </div>
              </div>

              {/* Right — character preview */}
              <div className="w-80 shrink-0">
                <div className={`glass-card p-6 h-full flex flex-col transition-all duration-300 ${masterCharLocked ? 'border-l-2' : ''}`} style={masterCharLocked ? { borderLeftColor: '#ff3344' } : {}}>
                  <div className="flex items-center justify-between mb-4">
                    <span className="section-label">Master Character</span>
                    {masterCharLocked
                      ? <span className="badge badge--accent"><Lock className="w-2.5 h-2.5" /> Locked</span>
                      : <span className="badge"><Unlock className="w-2.5 h-2.5" /> Unlocked</span>
                    }
                  </div>
                  <div className="w-full aspect-square overflow-hidden flex items-center justify-center" style={{ border: '1px solid rgba(245,230,211,0.08)' }}>
                    {masterCharImage ? (
                      <img src={masterCharImage} alt="Master Character" className="w-full h-full object-cover" />
                    ) : isFusingPhotos || isGeneratingHero ? (
                      <div className="text-center">
                        <RefreshCw className="w-10 h-10 animate-spin mx-auto mb-3" style={{ color: '#ff3344' }} />
                        <p className="text-xs" style={{ color: 'rgba(245,230,211,0.45)' }}>{isFusingPhotos ? `Fusing ${refPhotos.length} photos...` : 'Generating...'}</p>
                      </div>
                    ) : refPhotos.length > 0 ? (
                      <div className="text-center p-4">
                        <Upload className="w-10 h-10 mx-auto mb-2" style={{ color: 'rgba(245,230,211,0.3)' }} />
                        <p className="text-xs" style={{ color: 'rgba(245,230,211,0.45)' }}>{refPhotos.length} photos ready</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <User className="w-12 h-12 mx-auto mb-2" style={{ color: 'rgba(245,230,211,0.18)' }} />
                        <p className="text-xs" style={{ color: 'rgba(245,230,211,0.3)' }}>Upload photos or generate</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom nav */}
            <div className="flex items-center justify-between mt-8">
              <button onClick={() => setStep(1)} className="btn-ghost">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button onClick={() => setStep(3)} className="btn-primary">
                Next: Storyboard <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Storyboard */}
        {step === 3 && (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '42px', lineHeight: 0.95, letterSpacing: '-0.03em', color: '#f5e6d3' }}>
                  The <em style={{ color: '#ff3344', fontStyle: 'italic' }}>storyboard</em>.
                </h1>
                <p className="mt-2" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(245,230,211,0.45)' }}>
                  {scenes.length} scenes &middot; {clipCount} clip{clipCount !== 1 ? 's' : ''} &times; {dur}s = {clipCount * dur}s
                </p>
              </div>
              <div className="flex gap-3 items-center">
                {autoEnhance && (
                  <button
                    type="button"
                    onClick={() => void planScenesWithAI()}
                    disabled={isAIPlanning || !script.trim()}
                    className="btn-ghost disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Regenerate scene prompts with Claude"
                    title={!script.trim() ? 'Write script first' : undefined}
                  >
                    {isAIPlanning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    {isAIPlanning ? 'Enhancing\u2026' : 'Enhance now'}
                  </button>
                )}
                <button
                  onClick={() => switchAspectRatio(aspectRatio === '16:9' ? '9:16' : '16:9')}
                  className="btn-ghost"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  {aspectRatio}
                </button>
                <button onClick={() => setStep(2)} className="btn-ghost">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={scenes.length === 0}
                  className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ fontSize: '14px', padding: '12px 24px' }}
                >
                  Next: Voiceover <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {isAIPlanning && (
              <div className="mb-4 flex items-center gap-3 px-5 py-4" style={{ border: '1px solid rgba(255,51,68,0.2)', background: 'rgba(255,51,68,0.04)', color: '#ff3344' }}>
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>AI раскадровывает сценарий — ~20 сек...</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto pr-2">
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                {scenes.map((scene, idx) => (
                  <div key={scene.id} className="glass-card p-5 flex flex-col">
                    {/* Scene header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: idx === 0 ? '#ff3344' : 'rgba(245,230,211,0.3)' }}>
                          {String(idx + 1).padStart(3, '0')}
                        </span>
                        <span className="section-label">Scene {idx + 1}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 cursor-pointer select-none" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)' }}>
                          <input
                            type="checkbox"
                            checked={scene.useMasterChar}
                            onChange={() => toggleUseMasterChar(scene.id)}
                            disabled={!masterCharLocked}
                            className="w-3 h-3"
                            style={{ accentColor: '#ff3344' }}
                          />
                          Cref
                        </label>
                        {scenes.length > 1 && (
                          <button
                            onClick={() => removeScene(scene.id)}
                            className="w-5 h-5 flex items-center justify-center transition-colors duration-200"
                            style={{ color: 'rgba(245,230,211,0.3)' }}
                            title="Remove scene"
                            aria-label={`Remove scene ${idx + 1}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Preview thumbnail */}
                    <div className={`${aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'} flex items-center justify-center mb-3 overflow-hidden transition-all`} style={{ border: '1px solid rgba(245,230,211,0.08)' }}>
                      {scene.imageUrl ? (
                        <img src={scene.imageUrl} alt={`Scene ${idx + 1}`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center">
                          <Image className="w-6 h-6 mx-auto mb-1" style={{ color: 'rgba(245,230,211,0.18)' }} />
                          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)' }}>Preview</p>
                        </div>
                      )}
                    </div>

                    {/* Image prompt */}
                    <div className="mb-2">
                      <span className="section-label flex items-center gap-1 mb-1" style={{ fontSize: '10px', color: '#ff3344' }}>
                        <Image className="w-3 h-3" /> Image Prompt
                      </span>
                      <textarea
                        value={scene.prompt}
                        onChange={e => updateScenePrompt(scene.id, e.target.value)}
                        placeholder="What's in this frame..."
                        className="w-full input-field resize-none"
                        style={{ padding: '10px 16px', fontSize: '12px', lineHeight: 1.6 }}
                        rows={3}
                      />
                    </div>

                    {/* Animation prompt */}
                    <div>
                      <span className="section-label flex items-center gap-1 mb-1" style={{ fontSize: '10px', color: 'rgba(245,230,211,0.45)' }}>
                        <Film className="w-3 h-3" /> Animation Prompt
                      </span>
                      <textarea
                        value={scene.animationPrompt}
                        onChange={e => updateAnimationPrompt(scene.id, e.target.value)}
                        placeholder="Camera/subject motion..."
                        className="w-full input-field resize-none"
                        style={{ padding: '10px 16px', fontSize: '12px', lineHeight: 1.6 }}
                        rows={2}
                      />
                    </div>
                  </div>
                ))}

                {/* Add Scene card */}
                <button
                  onClick={addScene}
                  disabled={isAIPlanning}
                  title={isAIPlanning ? 'AI раскадровывает сценарий — подожди…' : 'Add empty scene'}
                  className="flex flex-col items-center justify-center min-h-[200px] cursor-pointer transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ border: '2px dashed rgba(245,230,211,0.12)' }}
                >
                  <Plus className="w-8 h-8 mb-2" style={{ color: 'rgba(245,230,211,0.2)' }} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Add Scene</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Voiceover */}
        {step === 4 && (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '42px', lineHeight: 0.95, letterSpacing: '-0.03em', color: '#f5e6d3' }}>
                  Choose a <em style={{ color: '#ff3344', fontStyle: 'italic' }}>voice</em>.
                </h1>
                <p className="mt-2" style={{ fontFamily: "'Fraunces', serif", fontSize: '14px', color: 'rgba(245,230,211,0.7)' }}>
                  Click a card to select, click play to preview. {voiceLibrary.length > 0 && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)' }}>{voiceLibrary.length} voices via ElevenLabs</span>}
                </p>
              </div>
              <div className="flex gap-3 items-center">
                <button onClick={() => setStep(3)} className="btn-ghost">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button onClick={() => setStep(5)} className="btn-primary" style={{ fontSize: '14px', padding: '12px 24px' }}>
                  Next: Generate <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Voice grid — 2 columns on md+, dynamic from /api/voice-library */}
            <div className="overflow-y-auto flex-1">
              {voiceLibLoading ? (
                /* Shimmer skeleton — 10 cards */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="reel-voice-card shimmer" style={{ minHeight: '56px' }} />
                  ))}
                </div>
              ) : voiceLibrary.length === 0 ? (
                /* Empty state */
                <div className="glass-card p-8 flex flex-col items-center justify-center" style={{ minHeight: '200px' }}>
                  <Mic className="w-10 h-10 mb-3" style={{ color: 'rgba(245,230,211,0.15)' }} />
                  <p style={{ fontFamily: "'Fraunces', serif", fontSize: '15px', color: 'rgba(245,230,211,0.45)', textAlign: 'center', maxWidth: '400px' }}>
                    Voice library not loaded. Check <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>/api/voice-library</span> and <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>.env.local</span>.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                  {voiceLibrary.map(v => {
                    const voiceKey = `api:${v.id}`;
                    const isSelected = selectedVoice === v.id;
                    const isPlaying = playingVoice === voiceKey;
                    const isVoiceLoading = loadingVoice === voiceKey;
                    const isPending = v.voiceId.startsWith('PENDING_');
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => { if (!isPending) setSelectedVoice(v.id); }}
                        className={`reel-voice-card ${isSelected ? 'selected' : ''}`}
                        style={isPending ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                        aria-pressed={isSelected}
                        aria-disabled={isPending || undefined}
                        aria-label={`${v.label} — ${v.description}${isPending ? ' (pending)' : ''}`}
                        title={isPending ? 'Voice ID pending — ask admin' : undefined}
                      >
                        <span style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: '14px', color: 'rgba(245,230,211,0.45)', width: '24px', textAlign: 'center', flexShrink: 0 }}>
                          {v.gender === 'F' ? 'F' : 'M'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '22px', color: '#f5e6d3', display: 'block' }}>{v.label}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(245,230,211,0.3)', display: 'block' }}>
                            {v.category} &middot; {v.description}
                          </span>
                        </div>
                        {isPending ? (
                          <span className="shrink-0 w-7 h-7 flex items-center justify-center" style={{ border: '1px solid rgba(245,230,211,0.1)' }}>
                            <Play className="w-3.5 h-3.5" style={{ color: 'rgba(245,230,211,0.15)' }} />
                          </span>
                        ) : (
                          <button
                            type="button"
                            aria-label={isPlaying ? `Stop ${v.label}` : `Play ${v.label}`}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (isPlaying) {
                                audioRef.current?.pause();
                                audioRef.current = null;
                                setPlayingVoice(null);
                                return;
                              }
                              if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
                              setPlayingVoice(null);

                              const cached = voiceCacheRef.current.get(voiceKey);
                              if (cached) {
                                const audio = new Audio(cached);
                                audioRef.current = audio;
                                setPlayingVoice(voiceKey);
                                audio.onended = () => { setPlayingVoice(null); audioRef.current = null; };
                                audio.play();
                                return;
                              }

                              setLoadingVoice(voiceKey);
                              try {
                                const res = await fetch('/api/voice-preview', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ provider: 'api', voice: v.id }),
                                });
                                const data = await res.json();
                                if (res.ok && data.url) {
                                  voiceCacheRef.current.set(voiceKey, data.url);
                                  const audio = new Audio(data.url);
                                  audioRef.current = audio;
                                  setPlayingVoice(voiceKey);
                                  setLoadingVoice(null);
                                  audio.onended = () => { setPlayingVoice(null); audioRef.current = null; };
                                  audio.play();
                                } else {
                                  setLoadingVoice(null);
                                }
                              } catch {
                                setLoadingVoice(null);
                              }
                            }}
                            className="shrink-0 w-7 h-7 flex items-center justify-center transition-colors duration-200 cursor-pointer"
                            style={{ border: `1px solid ${isSelected ? '#ff3344' : 'rgba(245,230,211,0.2)'}`, background: 'transparent' }}
                          >
                            {isVoiceLoading ? <Loader className="w-3.5 h-3.5 animate-spin" style={{ color: '#ff3344' }} /> :
                             isPlaying ? <Volume2 className="w-3.5 h-3.5" style={{ color: '#ff3344' }} /> :
                             <Play className="w-3.5 h-3.5" style={{ color: 'rgba(245,230,211,0.3)' }} />}
                          </button>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Custom TTS textarea */}
              <div className="glass-card p-6 mt-6">
                <span className="section-label block mb-2">Custom voiceover (optional)</span>
                <h3 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '28px', color: '#f5e6d3', marginBottom: '8px' }}>
                  Write what to <em style={{ color: '#ff3344', fontStyle: 'italic' }}>say</em>.
                </h3>
                <p style={{ fontFamily: "'Fraunces', serif", fontSize: '14px', color: 'rgba(245,230,211,0.45)', marginBottom: '16px' }}>
                  Leave empty and Claude will write narration from your scenes. Or pick a format and generate.
                </p>

                {/* Format chips + Generate button */}
                <div className="reel-voiceover-controls">
                  <div className="reel-format-group">
                    <span className="reel-format-label">Format</span>
                    <div className="reel-format-chips">
                      {(['narrator', 'marketing', 'dialogue', 'tutorial'] as const).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setVoiceFormat(f)}
                          aria-pressed={voiceFormat === f}
                          className={`reel-format-chip ${voiceFormat === f ? 'active' : ''}`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      setGenerateError(null);
                      setGeneratingText(true);
                      try {
                        const res = await fetch('/api/voiceover/generate-text', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            script,
                            scenes: scenes.map(s => ({ prompt: s.prompt })),
                            format: voiceFormat,
                            sceneCount,
                            voiceLanguage: 'en',
                          }),
                        });
                        const data = await res.json();
                        if (res.ok && data.text) {
                          setCustomVoiceText(data.text);
                        } else {
                          setGenerateError(data.error ?? 'Generation failed');
                        }
                      } catch (err) {
                        setGenerateError(err instanceof Error ? err.message : 'Fetch failed');
                      } finally {
                        setGeneratingText(false);
                      }
                    }}
                    disabled={generatingText || !script.trim()}
                    className="btn-ghost reel-generate-btn disabled:opacity-40 disabled:cursor-not-allowed"
                    title={!script.trim() ? 'Write script first' : 'Generate narration with Claude'}
                  >
                    {generatingText ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    {generatingText ? 'Generating\u2026' : 'Generate from script'}
                  </button>
                </div>

                {generateError && (
                  <div className="reel-error-row">
                    <X className="w-3 h-3 shrink-0" />
                    {generateError}
                    <button onClick={() => setGenerateError(null)} className="ml-auto opacity-60 hover:opacity-100 transition-opacity cursor-pointer" style={{ background: 'transparent', border: 'none', color: '#ff3344' }}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <textarea
                  value={customVoiceText}
                  onChange={e => setCustomVoiceText(e.target.value)}
                  placeholder="e.g. &laquo;In this video I will show you...&raquo;"
                  className="input-field w-full resize-none"
                  style={{ minHeight: '100px' }}
                  maxLength={1000}
                />
                <div className="flex justify-between mt-2">
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '0.1em', color: customVoiceText.length > 900 ? '#ff3344' : 'rgba(245,230,211,0.3)' }}>
                    {customVoiceText.length} / 1000
                  </span>
                  {customVoiceText.length > 0 && (
                    <button
                      onClick={() => setCustomVoiceText('')}
                      className="btn-ghost !px-2 !py-1"
                      style={{ fontSize: '10px' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Background Music block */}
              <div className="glass-card p-6 mt-6">
                <span className="section-label block mb-2">Background music (optional)</span>
                <h3 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '28px', color: '#f5e6d3', marginBottom: '8px' }}>
                  Set the <em style={{ color: '#ff3344', fontStyle: 'italic' }}>tone</em>.
                </h3>
                <p style={{ fontFamily: "'Fraunces', serif", fontSize: '14px', color: 'rgba(245,230,211,0.45)', marginBottom: '16px' }}>
                  Pick a category, then a track. Music will play behind your narration.
                </p>

                {musicLoading && (
                  <div className="shimmer" style={{ height: '56px', marginBottom: '8px' }} />
                )}

                {musicLibrary && (
                  <>
                    {/* Category chips */}
                    <div className="reel-music-categories">
                      {musicLibrary.categories.map(cat => (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => setSelectedMusicCategory(cat.name)}
                          aria-pressed={selectedMusicCategory === cat.name}
                          className={`reel-chip ${selectedMusicCategory === cat.name ? 'active' : ''}`}
                        >
                          {cat.name} <span style={{ opacity: 0.5, fontSize: '9px', marginLeft: '4px' }}>{cat.trackCount}</span>
                        </button>
                      ))}
                    </div>

                    {/* Tracks list */}
                    {selectedMusicCategory && (
                      <div className="reel-music-tracks mt-4">
                        {musicLibrary.categories
                          .find(c => c.name === selectedMusicCategory)
                          ?.tracks.map(track => {
                            const isSelected = selectedMusicId === track.id;
                            const isPlaying = playingMusicId === track.id;
                            return (
                              <button
                                key={track.id}
                                type="button"
                                onClick={() => setSelectedMusicId(track.id === selectedMusicId ? null : track.id)}
                                className={`reel-music-row ${isSelected ? 'selected' : ''}`}
                              >
                                <span
                                  role="button"
                                  tabIndex={0}
                                  aria-label={isPlaying ? `Stop ${track.name}` : `Play preview ${track.name}`}
                                  onClick={e => { e.stopPropagation(); toggleMusicPlay(track.id); }}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); toggleMusicPlay(track.id); } }}
                                  className="reel-music-play"
                                >
                                  {isPlaying ? <Volume2 className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                </span>
                                <div className="reel-music-meta">
                                  <span className="reel-music-name">{track.name}</span>
                                  {track.subfolder && <span className="reel-music-sub">{track.subfolder}</span>}
                                </div>
                              </button>
                            );
                          })}
                      </div>
                    )}

                    {/* Volume + ducking controls */}
                    {selectedMusicId && (
                      <div className="reel-music-controls mt-4">
                        <div className="reel-music-vol">
                          <label className="reel-format-label" htmlFor="music-vol">Volume</label>
                          <input
                            id="music-vol"
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={musicVolume}
                            onChange={e => setMusicVolume(parseFloat(e.target.value))}
                            className="reel-slider"
                            aria-label="Music volume"
                          />
                          <span className="reel-music-vol-val">{Math.round(musicVolume * 100)}%</span>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={musicDucking}
                          aria-label={`Ducking ${musicDucking ? 'on' : 'off'}`}
                          onClick={() => setMusicDucking(v => !v)}
                          className={`reel-toggle ${musicDucking ? 'on' : 'off'}`}
                          title="Lower music when narration speaks"
                        >
                          <span className="reel-toggle-knob" />
                          <span className="reel-toggle-state">Ducking {musicDucking ? 'ON' : 'OFF'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTrimModalOpen(true)}
                          className="btn-ghost"
                          aria-label="Trim audio"
                        >
                          Trim {musicTrimDuration ? `(${musicTrimDuration.toFixed(1)}s)` : ''}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSelectedMusicId(null); stopMusic(); }}
                          className="w-7 h-7 flex items-center justify-center cursor-pointer transition-colors duration-200"
                          style={{ border: '1px solid rgba(245,230,211,0.2)', background: 'transparent', color: 'rgba(245,230,211,0.3)' }}
                          aria-label="Remove music"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Captions block */}
              <div className="glass-card p-6 mt-6">
                <span className="section-label block mb-2">Captions (auto-subtitles)</span>
                <h3 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '28px', color: '#f5e6d3', marginBottom: '8px' }}>
                  Burn the <em style={{ color: '#ff3344', fontStyle: 'italic' }}>words</em> in.
                </h3>
                <p style={{ fontFamily: "'Fraunces', serif", fontSize: '14px', color: 'rgba(245,230,211,0.45)', marginBottom: '16px' }}>
                  Auto-transcribed from voiceover via Whisper. Word-level timing, baked into video.
                </p>

                <div className="reel-captions-row">
                  <div className="reel-captions-toggle">
                    <span className="reel-format-label">Captions</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={captionsEnabled}
                      aria-label={`Captions ${captionsEnabled ? 'on' : 'off'}`}
                      onClick={() => setCaptionsEnabled(v => !v)}
                      className={`reel-toggle ${captionsEnabled ? 'on' : 'off'}`}
                    >
                      <span className="reel-toggle-knob" />
                      <span className="reel-toggle-state">{captionsEnabled ? 'ON' : 'OFF'}</span>
                    </button>
                  </div>

                  <div className="reel-model-block">
                    <span className="section-label">Style</span>
                    <select
                      value={captionsStyle}
                      onChange={e => setCaptionsStyle(e.target.value as typeof captionsStyle)}
                      disabled={!captionsEnabled}
                      className="reel-model-select"
                      aria-label="Caption style"
                    >
                      <option value="default">Default</option>
                      <option value="karaoke" disabled>Karaoke (soon)</option>
                      <option value="minimal" disabled>Minimal (soon)</option>
                      <option value="bouncy" disabled>Bouncy (soon)</option>
                    </select>
                  </div>

                  <div className="reel-model-block">
                    <span className="section-label">Position</span>
                    <select
                      value={captionsPosition}
                      onChange={e => setCaptionsPosition(e.target.value as typeof captionsPosition)}
                      disabled={!captionsEnabled}
                      className="reel-model-select"
                      aria-label="Caption position"
                    >
                      <option value="bottom">Bottom</option>
                      <option value="center">Center</option>
                      <option value="top">Top</option>
                    </select>
                  </div>

                  <div className="reel-model-block">
                    <span className="section-label">Language</span>
                    <select
                      value={captionsLang}
                      onChange={e => setCaptionsLang(e.target.value as typeof captionsLang)}
                      disabled={!captionsEnabled}
                      className="reel-model-select"
                      aria-label="Caption language"
                    >
                      <option value="auto">Auto-detect</option>
                      <option value="en">English</option>
                      <option value="ru">Русский</option>
                      <option value="kk">Қазақша</option>
                    </select>
                  </div>
                </div>

                <p className="mt-3" style={{ fontFamily: "'Fraunces', serif", fontSize: '12px', fontStyle: 'italic', color: 'rgba(245,230,211,0.35)' }}>
                  {captionsEnabled
                    ? 'Whisper transcription cost: ~$0.0001 per 10s clip \u00b7 negligible.'
                    : 'No subtitles will be burned into the final video.'}
                </p>
              </div>
            </div>

            {/* Trim Audio Modal */}
            {selectedMusicId && (
              <TrimAudioModal
                open={trimModalOpen}
                trackId={selectedMusicId}
                trackName={musicLibrary?.categories.flatMap(c => c.tracks).find(t => t.id === selectedMusicId)?.name ?? 'Track'}
                initialStart={musicStart}
                initialDuration={musicTrimDuration ?? 30}
                onClose={() => setTrimModalOpen(false)}
                onSave={(start, dur) => {
                  setMusicStart(start);
                  setMusicTrimDuration(dur);
                  setTrimModalOpen(false);
                }}
              />
            )}
          </div>
        )}

        {/* STEP 5: Generate Video */}
        {step === 5 && (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '42px', lineHeight: 0.95, letterSpacing: '-0.03em', color: '#f5e6d3' }}>
                  <em style={{ color: '#ff3344', fontStyle: 'italic' }}>Generate</em>.
                </h1>
                <p className="mt-2 tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(245,230,211,0.45)' }}>
                  {doneCount}/{scenes.length} photos &middot; {videoDoneCount}/{scenes.length} videos &middot; {style}
                </p>
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                <select
                  value={klingModel}
                  onChange={e => setKlingModel(e.target.value as typeof klingModel)}
                  className="input-inline cursor-pointer"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: '11px' }}
                >
                  <option value="kling-v1">Kling v1</option>
                  <option value="kling-v1-5">Kling v1.5</option>
                  <option value="kling-v2">Kling v2</option>
                </select>
                <select
                  value={klingDuration}
                  onChange={e => setKlingDuration(e.target.value as typeof klingDuration)}
                  className="input-inline cursor-pointer"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: '11px' }}
                >
                  <option value="5">5 sec</option>
                  <option value="10">10 sec</option>
                </select>
                <label className="flex items-center gap-1.5 cursor-pointer select-none" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.45)' }}>
                  <input
                    type="checkbox"
                    checked={autoGenerateVideo}
                    onChange={e => setAutoGenerateVideo(e.target.checked)}
                    className="w-3 h-3"
                    style={{ accentColor: '#ff3344' }}
                  />
                  Auto-video
                </label>
                <button onClick={() => setStep(4)} className="btn-ghost">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <div className="reel-generate-cost">
                  <span>{formatTokens(estimatedCost.tokens)} tokens</span>
                  <span className="reel-cost-usd-inline">&asymp; ${estimatedCost.usd.toFixed(2)}</span>
                </div>
                <button
                  onClick={generateAllScenes}
                  disabled={isGeneratingAll || scenes.length === 0 || insufficientBalance}
                  className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ fontSize: '14px', padding: '12px 24px' }}
                  title={insufficientBalance ? 'Insufficient balance' : undefined}
                >
                  {isGeneratingAll ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</> : <><Wand2 className="w-4 h-4" /> Generate All</>}
                </button>
                {insufficientBalance && (
                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: '12px', fontStyle: 'italic', color: '#ff3344' }}>
                    Insufficient balance &mdash; top up to continue
                  </span>
                )}
                <span className="badge" style={providerMode === 'higgsfield' ? { borderColor: 'rgba(136,165,132,0.4)', color: '#88a584' } : {}}>
                  {providerMode === 'higgsfield' ? 'via Higgsfield' : 'via Kling API'}
                </span>
                {providerMode === 'higgsfield' && <HiggsfieldStatusIndicator />}
                {voiceState !== 'idle' && (
                  <span className="badge" style={{
                    borderColor: voiceState === 'ready' ? 'rgba(136,165,132,0.4)' : voiceState === 'generating' ? 'rgba(245,230,211,0.2)' : 'rgba(255,51,68,0.3)',
                    color: voiceState === 'ready' ? '#88a584' : voiceState === 'generating' ? 'rgba(245,230,211,0.45)' : '#ff3344',
                  }}>
                    {voiceState === 'generating' && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
                    {voiceState === 'ready' && <CheckCircle className="w-2.5 h-2.5" />}
                    {voiceState === 'failed' && <X className="w-2.5 h-2.5" />}
                    Voice: {voiceState === 'generating' ? 'creating...' : voiceState === 'ready' ? `${voiceMeta?.voiceTone ?? 'ready'}` : 'failed'}
                  </span>
                )}
                {providerMode === 'higgsfield' && isGeneratingAll && (
                  <button
                    onClick={async () => {
                      abortRef.current = true;
                      try { await fetch('/api/admin/higgsfield/pause', { method: 'POST' }); } catch { /* */ }
                    }}
                    className="btn-ghost"
                    style={{ borderColor: 'rgba(255,51,68,0.3)', color: '#ff3344' }}
                  >
                    <Square className="w-3 h-3" /> Stop
                  </button>
                )}
                {scenes.length > 0 && scenes.every(s => s.videoStatus === 'done') && (
                  <button
                    onClick={mergeAllVideos}
                    disabled={isMerging}
                    className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ fontSize: '14px', padding: '12px 24px' }}
                  >
                    {isMerging ? <><RefreshCw className="w-4 h-4 animate-spin" /> Merging...</> : <><Scissors className="w-4 h-4" /> Merge Final</>}
                  </button>
                )}
              </div>
            </div>

            {/* Merged video player */}
            {mergedVideoUrl && (
              <div className="mb-6 glass-card p-6 flex items-center gap-6">
                <video src={mergedVideoUrl} controls className="h-32" style={{ border: '1px solid rgba(245,230,211,0.08)' }} />
                <div className="flex flex-col gap-3">
                  <p style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '18px', color: '#f5e6d3' }}>Final video ready</p>
                  <a href={mergedVideoUrl} download="final_video.mp4" className="btn-primary" style={{ fontSize: '13px', padding: '10px 20px' }}>
                    <Download className="w-4 h-4" /> Download MP4
                  </a>
                </div>
              </div>
            )}

            {isMerging && (
              <div className="mb-4 flex items-center gap-3 px-5 py-4 glass-card">
                <RefreshCw className="w-4 h-4 animate-spin" style={{ color: '#ff3344' }} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'rgba(245,230,211,0.7)' }}>Merging {scenes.length} clips...</span>
              </div>
            )}

            {/* Progress bars */}
            {scenes.length > 0 && (
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="section-label" style={{ fontSize: '10px' }}>Photos</span>
                  <span className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)' }}>{doneCount}/{scenes.length}</span>
                </div>
                <div className="w-full h-1" style={{ background: 'rgba(245,230,211,0.04)' }}>
                  <div className="progress-bar h-full" style={{ width: `${scenes.length ? (doneCount / scenes.length) * 100 : 0}%` }} />
                </div>
                <div className="flex justify-between mt-2 mb-1">
                  <span className="section-label" style={{ fontSize: '10px' }}>Videos</span>
                  <span className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)' }}>{videoDoneCount}/{scenes.length}</span>
                </div>
                <div className="w-full h-1" style={{ background: 'rgba(245,230,211,0.04)' }}>
                  <div className="progress-bar h-full transition-all duration-500" style={{ width: `${scenes.length ? (videoDoneCount / scenes.length) * 100 : 0}%` }} />
                </div>
              </div>
            )}

            {/* Generation progress */}
            {isGeneratingAll && generationProgress && (
              <div className="mb-4 glass-card p-5">
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: '14px', color: '#f5e6d3' }}>
                    Scene {generationProgress.currentScene} of {generationProgress.totalScenes}
                  </span>
                  <span className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)' }}>
                    {generationProgress.completedItems.length}/{generationProgress.totalScenes}
                  </span>
                </div>
                <div className="w-full h-1" style={{ background: 'rgba(245,230,211,0.04)' }}>
                  <div className="progress-bar h-full transition-all duration-500" style={{ width: `${(generationProgress.completedItems.length / generationProgress.totalScenes) * 100}%` }} />
                </div>
              </div>
            )}

            {/* Completed items strip */}
            {generationProgress && generationProgress.completedItems.length > 0 && (
              <div className="mb-4">
                <span className="section-label block mb-2" style={{ fontSize: '10px' }}>Completed</span>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {generationProgress.completedItems.map((item, i) => (
                    <div key={i} className="shrink-0 w-24 overflow-hidden" style={{ border: '1px solid rgba(245,230,211,0.08)' }}>
                      {item.type === 'video' ? (
                        <video src={item.url} className="w-full aspect-video object-cover" muted />
                      ) : (
                        <img src={item.url} alt={`Scene ${item.sceneIdx + 1}`} className="w-full aspect-video object-cover" />
                      )}
                      <p className="text-center py-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'rgba(245,230,211,0.3)' }}>{String(item.sceneIdx + 1).padStart(3, '0')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Download All */}
            {doneCount > 0 && !isGeneratingAll && (
              <div className="mb-4">
                <button
                  onClick={() => {
                    scenes.forEach((s, idx) => {
                      if (s.imageUrl) { const a = document.createElement('a'); a.href = s.imageUrl; a.download = `scene_${idx + 1}_image.png`; a.click(); }
                      if (s.videoUrl) { const a = document.createElement('a'); a.href = s.videoUrl; a.download = `scene_${idx + 1}_video.mp4`; a.click(); }
                    });
                  }}
                  className="btn-ghost"
                  style={{ borderColor: 'rgba(136,165,132,0.4)', color: '#88a584' }}
                >
                  <Download className="w-4 h-4" /> Download All ({doneCount})
                </button>
              </div>
            )}

            {doneCount === 0 && !isGeneratingAll ? (
              <div className="flex-1 glass-card flex flex-col items-center justify-center">
                <Film className="w-16 h-16 mb-4" style={{ color: 'rgba(245,230,211,0.12)' }} />
                <h3 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '24px', color: 'rgba(245,230,211,0.45)', marginBottom: '8px' }}>Ready to Generate</h3>
                <p style={{ fontFamily: "'Fraunces', serif", fontSize: '14px', color: 'rgba(245,230,211,0.3)', maxWidth: '400px', textAlign: 'center' }}>
                  Click &quot;Generate All&quot; to create photos and animate them into video.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-2">
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                  {scenes.map((scene, idx) => (
                    <div key={scene.id} className="glass-card p-4 flex flex-col">
                      <div className="aspect-video overflow-hidden flex items-center justify-center mb-3 relative" style={{ border: '1px solid rgba(245,230,211,0.08)' }}>
                        {scene.videoUrl ? (
                          <video src={scene.videoUrl} controls loop className="w-full h-full object-cover" />
                        ) : scene.imageUrl ? (
                          <>
                            <img src={scene.imageUrl} alt={`Scene ${idx + 1}`} className="w-full h-full object-cover" />
                            {(scene.videoStatus === 'processing' || scene.videoStatus === 'queued') && (
                              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1">
                                <RefreshCw className="w-6 h-6 animate-spin" style={{ color: '#ff3344' }} />
                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#ff3344' }}>Processing...</span>
                              </div>
                            )}
                            {scene.videoStatus === 'failed' && (
                              <div className="absolute bottom-1 right-1 badge badge--accent">failed</div>
                            )}
                          </>
                        ) : scene.status === 'generating' ? (
                          <RefreshCw className="w-8 h-8 animate-spin" style={{ color: '#ff3344' }} />
                        ) : (
                          <Image className="w-8 h-8" style={{ color: 'rgba(245,230,211,0.12)' }} />
                        )}
                      </div>

                      <div className="flex items-center gap-2 mb-1">
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)' }}>{String(idx + 1).padStart(3, '0')}</span>
                        <span className="section-label">Scene {idx + 1}</span>
                        {scene.status === 'done' && <CheckCircle className="w-3 h-3" style={{ color: '#88a584' }} />}
                        {scene.status === 'generating' && <RefreshCw className="w-3 h-3 animate-spin" style={{ color: '#ff3344' }} />}
                        {scene.videoStatus === 'done' && <Film className="w-3 h-3" style={{ color: '#88a584' }} />}
                        {(scene.videoStatus === 'processing' || scene.videoStatus === 'queued') && <RefreshCw className="w-3 h-3 animate-spin" style={{ color: '#c9a86a' }} />}
                        {scene.useMasterChar && masterCharLocked && <Lock className="w-3 h-3" style={{ color: 'rgba(245,230,211,0.2)' }} />}
                      </div>
                      <p className="line-clamp-2 mb-2" style={{ fontFamily: "'Fraunces', serif", fontSize: '12px', color: 'rgba(245,230,211,0.45)' }}>{scene.prompt}</p>

                      <div className="flex gap-1 mt-auto">
                        {scene.status !== 'generating' && scene.status !== 'done' && (
                          <button onClick={() => generateScene(scene)} className="flex-1 btn-ghost !py-1.5 !px-2" style={{ fontSize: '10px' }}>
                            <Wand2 className="w-3 h-3" /> Photo
                          </button>
                        )}
                        {scene.status === 'done' && scene.videoStatus === 'idle' && (
                          <button
                            onClick={() => { const ns = idx < scenes.length - 1 ? scenes[idx + 1] : null; generateKlingVideoForPair(scene, ns); }}
                            className="flex-1 btn-ghost !py-1.5 !px-2" style={{ fontSize: '10px', borderColor: 'rgba(245,230,211,0.15)' }}
                          >
                            <Film className="w-3 h-3" /> Video
                          </button>
                        )}
                        {scene.videoStatus === 'failed' && (
                          <button
                            onClick={() => { const ns = idx < scenes.length - 1 ? scenes[idx + 1] : null; generateKlingVideoForPair(scene, ns); }}
                            className="flex-1 btn-ghost !py-1.5 !px-2" style={{ fontSize: '10px', borderColor: 'rgba(255,51,68,0.3)', color: '#ff3344' }}
                          >
                            <RefreshCw className="w-3 h-3" /> Retry
                          </button>
                        )}
                        {scene.videoUrl && (
                          <a href={scene.videoUrl} download={`scene_${idx + 1}.mp4`} className="btn-ghost !py-1.5 !px-2" style={{ fontSize: '10px' }} title="Download" aria-label={`Download scene ${idx + 1}`}>
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
              <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
                <div className="glass-card p-8 max-w-md text-center">
                  <h3 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '24px', color: '#f5e6d3', marginBottom: '8px' }}>Final video ready</h3>
                  <p style={{ fontFamily: "'Fraunces', serif", fontSize: '14px', color: 'rgba(245,230,211,0.45)', marginBottom: '20px' }}>
                    Merge complete — saved to Library.
                  </p>
                  <video src={mergedVideoUrl} controls className="w-full mb-5" style={{ border: '1px solid rgba(245,230,211,0.08)' }} />
                  {addSubsError && (
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#ff6b6b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {addSubsError}
                    </p>
                  )}
                  <div className="flex gap-3 justify-center flex-wrap">
                    <a href={mergedVideoUrl} download="final.mp4" className="btn-primary" style={{ fontSize: '14px', padding: '10px 20px' }}>Download</a>
                    {voiceUrl && !mergedVideoUrl.includes('-with-subs') && (
                      <button
                        onClick={async () => {
                          if (!mergedVideoUrl || !voiceUrl) return;
                          setAddingSubs(true);
                          setAddSubsError(null);
                          try {
                            const res = await fetch('/api/scenario/add-subtitles', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                videoUrl: mergedVideoUrl,
                                voiceUrl,
                                language: captionsLang,
                                aspectRatio,
                                position: captionsPosition,
                              }),
                            });
                            const data = await res.json();
                            if (!res.ok || !data.finalUrl) {
                              throw new Error(data.error ?? `HTTP ${res.status}`);
                            }
                            setMergedVideoUrl(data.finalUrl);
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            setAddSubsError(msg);
                          } finally {
                            setAddingSubs(false);
                          }
                        }}
                        disabled={addingSubs}
                        className="btn-secondary"
                        style={{ fontSize: '14px', padding: '10px 20px' }}
                      >
                        {addingSubs ? 'Burning subs...' : 'Add Subtitles'}
                      </button>
                    )}
                    <button onClick={() => setShowFinalModal(false)} className="btn-ghost">Close</button>
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
