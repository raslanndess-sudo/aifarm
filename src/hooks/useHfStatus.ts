import { useEffect, useState } from 'react';

export type HfStatus = 'idle' | 'running' | 'paused';
export interface HfStatusResponse {
  status: HfStatus;
  currentOp: string | null;
}

export function useHfStatus(pollMs = 2000) {
  const [data, setData] = useState<HfStatusResponse>({ status: 'idle', currentOp: null });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch('/api/admin/higgsfield/status');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const j = (await res.json()) as HfStatusResponse;
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void tick();
    const interval = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pollMs]);

  const pause = async () => {
    await fetch('/api/admin/higgsfield/pause', { method: 'POST' });
  };
  const resume = async () => {
    await fetch('/api/admin/higgsfield/resume', { method: 'POST' });
  };

  return { ...data, error, pause, resume };
}
