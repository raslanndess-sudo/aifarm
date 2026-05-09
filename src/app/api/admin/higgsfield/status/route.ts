import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getStatus, getCurrentOperation, isPauseRequested } from '@/lib/providers/higgsfield-singleton';

export async function GET() {
  const cookieStore = await cookies();
  if (!cookieStore.get('session')?.value) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    status: getStatus(),
    currentOp: getCurrentOperation(),
    isPaused: isPauseRequested(),
  });
}
