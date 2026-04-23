import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { username?: string; password?: string };

    if (body.username === 'admin' && body.password === 'admin') {
      const token = crypto.randomUUID();

      const cookieStore = await cookies();
      cookieStore.set('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
