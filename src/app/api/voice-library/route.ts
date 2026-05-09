import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { VOICES_LIBRARY } from '@/lib/elevenlabs';

export async function GET() {
  const session = (await cookies()).get('session')?.value;
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ voices: VOICES_LIBRARY });
}
