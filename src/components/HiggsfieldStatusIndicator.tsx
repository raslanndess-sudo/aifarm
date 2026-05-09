'use client';
import { useHfStatus } from '@/hooks/useHfStatus';

export default function HiggsfieldStatusIndicator() {
  const { status, currentOp, pause, resume } = useHfStatus(2000);

  const label = {
    idle: 'Chrome free — manual work OK',
    running: `Automation: ${currentOp ?? 'running'}`,
    paused: `Paused: ${currentOp ?? 'idle'}`,
  }[status];

  const dotClass = {
    idle: 'bg-emerald-400',
    running: 'bg-red-400 animate-pulse',
    paused: 'bg-yellow-400',
  }[status];

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-border-subtle text-xs">
      <div className={`w-2 h-2 rounded-full ${dotClass}`} />
      <span className="text-text-secondary">{label}</span>
      {status === 'running' && (
        <button
          onClick={() => void pause()}
          className="ml-2 px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20 text-[11px]"
        >
          Pause
        </button>
      )}
      {status === 'paused' && (
        <button
          onClick={() => void resume()}
          className="ml-2 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-[11px]"
        >
          Resume
        </button>
      )}
    </div>
  );
}
