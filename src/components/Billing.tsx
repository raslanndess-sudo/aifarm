'use client';
import { useState, useEffect, useCallback } from 'react';
import { Check, ArrowUpRight, ArrowDownRight, CreditCard, Sparkles, Crown, Zap } from 'lucide-react';
import NoSignal from '@/components/NoSignal';

interface Transaction {
  id: number;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  created_at: string;
}

interface BillingData {
  balance: number;
  totalCredits: number;
  usedThisMonth: number;
  plan: string;
  renewDate: string;
  transactions: Transaction[];
}

const plans = [
  { name: 'Starter', price: 29, credits: 3_000, features: ['3 000 credits/month', '720p renders', 'Basic styles', '5 phone slots'], icon: Zap },
  { name: 'Pro', price: 79, credits: 10_000, features: ['10 000 credits/month', '1080p renders', 'All styles', '20 phone slots', 'CREF locking'], popular: true, icon: Sparkles },
  { name: 'Studio', price: 199, credits: 30_000, features: ['30 000 credits/month', '4K renders', 'All styles', 'Unlimited phones', 'Priority queue', 'API access'], icon: Crown },
];

export default function Billing() {
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchBilling = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/billing');
      if (!res.ok) throw new Error('Failed to fetch');
      const data: BillingData = await res.json();
      setBilling(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBilling(); }, [fetchBilling]);

  if (loading) return <NoSignal isLoading />;
  if (error || !billing) return <NoSignal title="No Signal" message="Failed to load billing data" onRetry={fetchBilling} />;

  const usagePercent = billing.totalCredits > 0 ? (billing.balance / billing.totalCredits) * 100 : 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-10">
        <span className="section-label block mb-3">Ledger &middot; Budget</span>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '48px', lineHeight: 0.95, letterSpacing: '-0.03em', color: '#f5e6d3' }}>
          The <em style={{ color: '#ff3344', fontStyle: 'italic' }}>ledger</em>.
        </h1>
      </div>

      {/* Hero balance */}
      <div className="glass-card p-10 mb-8 text-center">
        <span className="section-label block mb-4">Available Credits</span>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '72px', lineHeight: 1, color: '#f5e6d3' }} className="tabular-nums">
          {billing.balance.toLocaleString()}
        </div>
        <p className="mt-3" style={{ fontFamily: "'Fraunces', serif", fontSize: '14px', fontStyle: 'italic', color: 'rgba(245,230,211,0.45)' }}>
          of {billing.totalCredits.toLocaleString()} &middot; {billing.plan} plan
        </p>
        {/* Progress bar */}
        <div className="w-full max-w-md mx-auto mt-6 h-1" style={{ background: 'rgba(245,230,211,0.04)' }}>
          <div className="progress-bar h-full" style={{ width: `${usagePercent}%` }} />
        </div>
        <div className="flex justify-between max-w-md mx-auto mt-2">
          <span className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)' }}>Used: {billing.usedThisMonth.toLocaleString()}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)' }}>Renews {billing.renewDate}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Plans */}
        <div className="col-span-2">
          <span className="section-label block mb-4">Plans</span>
          <div className="grid grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent = plan.name === billing.plan;
              const PlanIcon = plan.icon;
              return (
                <div key={plan.name} className={`glass-card p-6 relative transition-all duration-200 ${isCurrent ? '' : ''}`} style={isCurrent ? { borderLeft: '2px solid #ff3344' } : {}}>
                  {isCurrent && (
                    <span className="badge badge--accent absolute top-4 right-4">Current</span>
                  )}
                  <PlanIcon className="w-5 h-5 mb-4" style={{ color: isCurrent ? '#ff3344' : 'rgba(245,230,211,0.3)' }} />
                  <h4 style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '22px', color: '#f5e6d3', marginBottom: '4px' }}>{plan.name}</h4>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '32px', color: '#f5e6d3' }} className="tabular-nums">${plan.price}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)' }}>/month</span>
                  </div>
                  <span className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.45)', letterSpacing: '0.1em' }}>{plan.credits.toLocaleString()} credits</span>
                  <ul className="mt-4 mb-5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 py-1.5" style={{ fontFamily: "'Fraunces', serif", fontSize: '12px', color: 'rgba(245,230,211,0.7)' }}>
                        <Check className="w-3 h-3 shrink-0" style={{ color: '#88a584' }} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    className={isCurrent ? 'btn-ghost w-full opacity-50 cursor-default' : 'btn-primary w-full'}
                    disabled={isCurrent}
                    style={!isCurrent ? { fontSize: '14px', padding: '12px 20px' } : {}}
                  >
                    {isCurrent ? 'Current Plan' : 'Upgrade'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Transactions */}
        <div>
          <span className="section-label block mb-4">Recent Transactions</span>
          <div className="glass-card p-0 overflow-hidden">
            {billing.transactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-4 px-5 py-4 transition-colors duration-200" style={{ borderBottom: '1px solid rgba(245,230,211,0.06)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,230,211,0.025)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div className="w-7 h-7 flex items-center justify-center shrink-0" style={{ border: '1px solid rgba(245,230,211,0.12)' }}>
                  {tx.type === 'credit'
                    ? <ArrowDownRight className="w-3.5 h-3.5" style={{ color: '#88a584' }} />
                    : <ArrowUpRight className="w-3.5 h-3.5" style={{ color: 'rgba(245,230,211,0.3)' }} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate" style={{ fontFamily: "'Fraunces', serif", fontSize: '13px', color: 'rgba(245,230,211,0.7)' }}>{tx.description}</p>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)', letterSpacing: '0.1em' }}>{tx.created_at}</p>
                </div>
                <span className="tabular-nums shrink-0" style={{
                  fontFamily: "'DM Serif Display', serif",
                  fontStyle: 'italic',
                  fontSize: '18px',
                  color: tx.type === 'credit' ? '#88a584' : '#ff3344',
                }}>
                  {tx.type === 'credit' ? '+' : '-'}{tx.amount.toLocaleString()}
                </span>
              </div>
            ))}
            {billing.transactions.length === 0 && (
              <div className="p-8 text-center">
                <p style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '18px', color: 'rgba(245,230,211,0.45)' }}>
                  No transactions. <em style={{ color: '#ff3344' }}>Begin</em> a take.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Usage tip */}
      <div className="glass-card p-6 flex items-center gap-5">
        <CreditCard className="w-6 h-6 shrink-0" style={{ color: 'rgba(245,230,211,0.18)' }} />
        <div>
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: '14px', color: '#f5e6d3' }}>Credit Usage</p>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(245,230,211,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '4px' }}>
            Scene 20 cr &middot; Hero 80 cr &middot; Angle sheet 200 cr
          </p>
        </div>
      </div>
    </div>
  );
}
