import { NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db-init';

export async function POST() {
  try {
    const tables = initDatabase();
    return NextResponse.json({ ok: true, tables });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
