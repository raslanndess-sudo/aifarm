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

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  if (loading) return <NoSignal isLoading />;
  if (error || !billing) return <NoSignal title="No Signal" message="Failed to load billing data" onRetry={fetchBilling} />;

  const usagePercent = billing.totalCredits > 0 ? (billing.balance / billing.totalCredits) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <div className="glass-card p-8 relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-purple-500/[0.07] to-transparent rounded-full -translate-y-1/2 translate-x-1/4 blur-2xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-cyan-500/[0.05] to-transparent rounded-full translate-y-1/2 -translate-x-1/4 blur-2xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <CreditCard className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="section-label mb-1">Available Credits</h2>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold gradient-text tabular-nums">{billing.balance.toLocaleString()}</span>
                <span className="text-sm text-text-muted">/ {billing.totalCredits.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="progress-bar h-full"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <div className="flex justify-between mt-2.5 text-xs text-text-muted">
            <span className="tabular-nums">Used: {billing.usedThisMonth.toLocaleString()} this month</span>
            <span>Plan: <span className="text-text-secondary font-medium">{billing.plan}</span> · Renews {billing.renewDate}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Plans */}
        <div className="col-span-2 space-y-4">
          <h3 className="section-label">Plans</h3>
          <div className="grid grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent = plan.name === billing.plan;
              const PlanIcon = plan.icon;
              return (
                <div
                  key={plan.name}
                  className={`glass-card p-5 relative overflow-hidden transition-all duration-300 ${
                    plan.popular ? 'glow-border' : ''
                  } ${
                    isCurrent ? 'border-purple-500/30 shadow-[0_0_40px_-8px_rgba(139,92,246,0.15)]' : ''
                  }`}
                >
                  {/* Popular badge */}
                  {plan.popular && !isCurrent && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-500 via-cyan-500 to-purple-500" />
                  )}

                  {isCurrent && (
                    <div className="absolute top-3 right-3">
                      <span className="badge bg-purple-500/15 text-purple-400 border-purple-500/25">Current</span>
                    </div>
                  )}

                  <div className={`w-9 h-9 rounded-xl ${isCurrent ? 'bg-purple-500/15' : 'bg-white/[0.04]'} flex items-center justify-center mb-4`}>
                    <PlanIcon className={`w-4.5 h-4.5 ${isCurrent ? 'text-purple-400' : 'text-text-tertiary'}`} />
                  </div>

                  <h4 className="text-base font-bold text-text-primary mb-1">{plan.name}</h4>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl font-bold gradient-text tabular-nums">${plan.price}</span>
                    <span className="text-xs text-text-muted">/month</span>
                  </div>
                  <div className="text-[11px] text-cyan-400/70 mb-4 tabular-nums">{plan.credits.toLocaleString()} credits/month</div>
                  <ul className="space-y-2.5 mb-5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-xs text-text-secondary">
                        <div className="w-4 h-4 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5 text-green-400" />
                        </div>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isCurrent
                        ? 'bg-white/[0.04] text-text-muted cursor-default border border-border-subtle'
                        : 'btn-primary'
                    }`}
                    disabled={isCurrent}
                  >
                    {isCurrent ? 'Current Plan' : 'Upgrade'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Transactions */}
        <div className="space-y-4">
          <h3 className="section-label">Recent Transactions</h3>
          <div className="glass-card divide-y divide-border-subtle overflow-hidden">
            {billing.transactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  tx.type === 'credit' ? 'bg-green-500/10' : 'bg-white/[0.04]'
                }`}>
                  {tx.type === 'credit'
                    ? <ArrowDownRight className="w-4 h-4 text-green-400" />
                    : <ArrowUpRight className="w-4 h-4 text-text-muted" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-secondary truncate">{tx.description}</p>
                  <p className="text-[10px] text-text-muted mt-0.5">{tx.created_at}</p>
                </div>
                <span className={`text-sm font-semibold shrink-0 tabular-nums ${
                  tx.type === 'credit' ? 'text-green-400' : 'text-text-muted'
                }`}>
                  {tx.type === 'credit' ? '+' : '-'}{tx.amount.toLocaleString()}
                </span>
              </div>
            ))}
            {billing.transactions.length === 0 && (
              <div className="p-8 text-center text-text-muted text-xs">
                No transactions yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Usage tip */}
      <div className="glass-card p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <p className="text-sm text-text-primary font-medium">Credit Usage Tip</p>
          <p className="text-xs text-text-muted mt-0.5">
            Scene generation costs 20 credits · Hero generation costs 80 credits · Angle sheet costs 200 credits
          </p>
        </div>
      </div>
    </div>
  );
}
