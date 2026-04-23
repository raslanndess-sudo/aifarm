import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Transaction, Settings } from '@/lib/types';

interface TransactionPostBody {
  description: string;
  amount: number;
  type: 'credit' | 'debit';
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json() as TransactionPostBody;

    if (!body.description || !body.amount || !body.type) {
      return NextResponse.json(
        { error: 'description, amount, and type are required' },
        { status: 400 }
      );
    }

    if (body.amount <= 0) {
      return NextResponse.json(
        { error: 'amount must be greater than 0' },
        { status: 400 }
      );
    }

    if (body.type !== 'credit' && body.type !== 'debit') {
      return NextResponse.json(
        { error: 'type must be "credit" or "debit"' },
        { status: 400 }
      );
    }

    const result = db.transaction(() => {
      const balanceRow = db.prepare(
        "SELECT value FROM settings WHERE key = 'balance'"
      ).get() as Settings | undefined;

      let balance = parseFloat(balanceRow?.value ?? '0');

      if (body.type === 'debit') {
        if (balance < body.amount) {
          return { error: 'Insufficient balance', balance };
        }
        balance -= body.amount;
      } else {
        balance += body.amount;
      }

      db.prepare(
        "UPDATE settings SET value = ? WHERE key = 'balance'"
      ).run(String(balance));

      const insertResult = db.prepare(
        `INSERT INTO transactions (description, amount, type)
         VALUES (?, ?, ?)`
      ).run(body.description, body.amount, body.type);

      const transaction = db.prepare(
        'SELECT * FROM transactions WHERE id = ?'
      ).get(insertResult.lastInsertRowid) as Transaction;

      return { transaction, newBalance: balance };
    })();

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
