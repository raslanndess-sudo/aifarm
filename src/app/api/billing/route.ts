import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Transaction, Settings } from '@/lib/types';

function getSetting(db: ReturnType<typeof getDb>, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Settings | undefined;
  return row ? row.value : null;
}

export async function GET() {
  try {
    const db = getDb();

    const balance = parseFloat(getSetting(db, 'balance') ?? '0');
    const totalCredits = parseFloat(getSetting(db, 'totalCredits') ?? '0');
    const plan = getSetting(db, 'plan') ?? 'free';
    const renewDate = getSetting(db, 'renewDate') ?? '';

    const transactions = db.prepare(
      'SELECT * FROM transactions ORDER BY created_at DESC LIMIT 20'
    ).all() as Transaction[];

    return NextResponse.json({
      balance,
      totalCredits,
      usedThisMonth: totalCredits - balance,
      plan,
      renewDate,
      transactions,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
