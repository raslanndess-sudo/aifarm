import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requestResume } from '@/lib/providers/higgsfield-singleton';

export async function POST() {
  const cookieStore = await cookies();
  if (!cookieStore.get('session')?.value) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  requestResume();
  return NextResponse.json({ ok: true });
}
