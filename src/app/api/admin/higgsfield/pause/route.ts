import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requestPause, getStatus, getCurrentOperation } from '@/lib/providers/higgsfield-singleton';

export async function POST() {
  const cookieStore = await cookies();
  if (!cookieStore.get('session')?.value) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  requestPause();
  return NextResponse.json({ ok: true, status: getStatus(), currentOp: getCurrentOperation() });
}
