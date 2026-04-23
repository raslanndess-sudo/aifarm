import { cookies } from 'next/headers';
import db from '@/lib/db';
import { getProvider, type ProviderMode } from './index';
import type { VideoProvider } from './types';

export async function resolveProvider(): Promise<{ provider: VideoProvider; mode: ProviderMode }> {
  // Проверяем сессию — admin ли пользователь
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;
  const isAdmin = session === 'admin';

  if (!isAdmin) {
    return { provider: getProvider('api'), mode: 'api' };
  }

  // Проверяем настройку provider_mode
  const row = db().prepare(`SELECT value FROM settings WHERE key = 'provider_mode'`).get() as { value: string } | undefined;
  const mode: ProviderMode = (row?.value === 'higgsfield') ? 'higgsfield' : 'api';

  return { provider: getProvider(mode), mode };
}
