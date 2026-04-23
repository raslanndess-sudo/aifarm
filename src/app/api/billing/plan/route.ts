import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface PlanBody {
  plan: string;
}

// PATCH /api/billing/plan — change subscription plan
export async function PATCH(request: NextRequest) {
  try {
    const db = getDb();
    const body = (await request.json()) as PlanBody;

    if (!body.plan) {
      return NextResponse.json({ error: 'plan is required' }, { status: 400 });
    }

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('plan', body.plan);

    return NextResponse.json({ success: true, plan: body.plan });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
