import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db';

export async function POST() {
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;
  if (session !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 1. Выключаем флаг в БД
  db().prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('provider_mode', 'api')`).run();

  // 2. Логируем
  const fs = require('fs');
  const line = `[${new Date().toISOString()}] EMERGENCY STOP triggered\n`;
  fs.appendFileSync('data/higgsfield-audit.log', line);

  return NextResponse.json({ success: true, message: 'Higgsfield mode disabled, provider reset to API' });
}
