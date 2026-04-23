'use client';
import { WifiOff, RefreshCw, Loader2 } from 'lucide-react';

interface NoSignalProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isLoading?: boolean;
}

export default function NoSignal({
  title = 'No Signal',
  message = 'Could not connect to server',
  onRetry,
  isLoading = false,
}: NoSignalProps) {
  return (
    <div className="relative flex items-center justify-center min-h-[400px] rounded-2xl overflow-hidden">
      {/* TV static noise */}
      <div className="absolute inset-0 noise-bg opacity-[0.05]" />
      <div className="absolute inset-0 scanlines opacity-[0.02]" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-radial-[ellipse_at_center] from-transparent via-transparent to-surface-0/80" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-5 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-border-subtle flex items-center justify-center">
          {isLoading
            ? <Loader2 className="w-7 h-7 text-text-muted animate-spin" />
            : <WifiOff className="w-7 h-7 text-text-muted" />
          }
        </div>

        <div>
          <h3 className="text-lg font-semibold text-text-tertiary">{isLoading ? 'Loading...' : title}</h3>
          <p className="text-sm text-text-muted mt-1">{isLoading ? 'Fetching data from server' : message}</p>
        </div>

        {onRetry && !isLoading && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-ghost text-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
