'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Play, Pause } from 'lucide-react';

interface TrimAudioModalProps {
  open: boolean;
  trackId: string;
  trackName: string;
  initialStart: number;
  initialDuration: number;
  onClose: () => void;
  onSave: (start: number, duration: number) => void;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function TrimAudioModal({ open, trackId, trackName, initialStart, initialDuration, onClose, onSave }: TrimAudioModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wsRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const regionRef = useRef<any>(null);
  const [duration, setDuration] = useState(0);
  const [regionStart, setRegionStart] = useState(initialStart);
  const [regionEnd, setRegionEnd] = useState(initialStart + initialDuration);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || !containerRef.current) return;

    let destroyed = false;

    (async () => {
      // Dynamic import to avoid SSR issues
      const WaveSurfer = (await import('wavesurfer.js')).default;
      const RegionsPlugin = (await import('wavesurfer.js/dist/plugins/regions.esm.js')).default;

      if (destroyed) return;

      const regions = RegionsPlugin.create();

      const ws = WaveSurfer.create({
        container: containerRef.current!,
        waveColor: 'rgba(245, 230, 211, 0.4)',
        progressColor: '#ff3344',
        cursorColor: '#ff3344',
        cursorWidth: 1,
        barWidth: 2,
        barGap: 1,
        barRadius: 0,
        height: 80,
        normalize: true,
        url: `/api/music/file?id=${encodeURIComponent(trackId)}`,
        plugins: [regions],
      });
      wsRef.current = ws;

      ws.on('ready', () => {
        if (destroyed) return;
        const dur = ws.getDuration();
        setDuration(dur);
        setLoaded(true);
        const end = Math.min(initialStart + initialDuration, dur);
        const region = regions.addRegion({
          start: initialStart,
          end,
          color: 'rgba(255, 51, 68, 0.18)',
          drag: true,
          resize: true,
        });
        regionRef.current = region;
        region.on('update-end', () => {
          setRegionStart(region.start);
          setRegionEnd(region.end);
        });
      });

      ws.on('play', () => setIsPlaying(true));
      ws.on('pause', () => setIsPlaying(false));
      ws.on('finish', () => setIsPlaying(false));
    })();

    return () => {
      destroyed = true;
      if (wsRef.current) {
        wsRef.current.destroy();
        wsRef.current = null;
      }
      setLoaded(false);
      setIsPlaying(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trackId]);

  const playRegion = useCallback(() => {
    const ws = wsRef.current;
    const region = regionRef.current;
    if (!ws || !region) return;
    if (isPlaying) {
      ws.pause();
    } else {
      ws.setTime(region.start);
      ws.play();
      const stopHandler = () => {
        if (ws.getCurrentTime() >= region.end) {
          ws.pause();
          ws.un('audioprocess', stopHandler);
        }
      };
      ws.on('audioprocess', stopHandler);
    }
  }, [isPlaying]);

  if (!open) return null;

  const regionDuration = regionEnd - regionStart;

  return (
    <div
      className="reel-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Trim audio"
      tabIndex={-1}
    >
      <div className="reel-modal-card">
        <div className="reel-modal-header">
          <div>
            <span className="section-label block mb-1">Trim Audio</span>
            <div className="reel-modal-title">{trackName}</div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center cursor-pointer transition-colors duration-200" style={{ border: '1px solid rgba(245,230,211,0.2)', background: 'transparent', color: '#f5e6d3' }} aria-label="Close">
            <X className="w-3 h-3" />
          </button>
        </div>

        <div className="reel-modal-body">
          <div ref={containerRef} className="reel-waveform" />

          {loaded && (
            <div className="reel-trim-info">
              <button onClick={playRegion} className="w-7 h-7 flex items-center justify-center cursor-pointer transition-colors duration-200" style={{ border: '1px solid rgba(245,230,211,0.2)', background: 'transparent', color: '#f5e6d3' }} aria-label={isPlaying ? 'Pause' : 'Play region'}>
                {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
              <span className="reel-trim-time">
                {fmt(regionStart)} &rarr; {fmt(regionEnd)}
              </span>
              <span className="reel-trim-duration">
                <strong>{regionDuration.toFixed(1)}s</strong> selected &middot; {fmt(duration)} total
              </span>
            </div>
          )}

          {!loaded && (
            <div className="shimmer" style={{ height: '40px' }} />
          )}
        </div>

        <div className="reel-modal-footer">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={() => onSave(regionStart, regionEnd - regionStart)}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!loaded || regionDuration < 0.5}
            style={{ fontSize: '14px', padding: '12px 24px' }}
          >
            Save trim
          </button>
        </div>
      </div>
    </div>
  );
}
