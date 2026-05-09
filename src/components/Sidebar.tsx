'use client';
import { useState, useEffect } from 'react';
import { formatTokens } from '@/lib/pricing';

const NAV_ITEMS = [
  { id: 'studio',    label: 'Studio' },
  { id: 'library',   label: 'Library' },
  { id: 'phonefarm', label: 'Phone Farm' },
  { id: 'scheduler', label: 'Scheduler' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'billing',   label: 'Billing' },
  { id: 'settings',  label: 'Settings' },
];

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => { if (d.balance) setBalance(parseInt(d.balance, 10) || 0); })
      .catch(() => {});
  }, []);

  return (
    <header className="shrink-0 relative z-50">
      <nav className="flex items-center justify-between px-10 pt-8 pb-8 border-b" style={{ borderColor: 'rgba(245,230,211,0.12)' }}>
        {/* Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <span style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: '24px', color: '#f5e6d3' }}>
            AI Video
          </span>
          <span
            className="inline-flex items-center"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#ff3344',
              border: '1px solid #ff3344',
              borderRadius: '999px',
              padding: '3px 8px',
            }}
          >
            Reel &middot; 26
          </span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(({ id, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className="relative px-4 py-2 cursor-pointer transition-colors duration-200"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '11px',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: active ? '#f5e6d3' : 'rgba(245,230,211,0.45)',
                  background: 'transparent',
                  border: 'none',
                }}
              >
                {label}
                {active && (
                  <span
                    className="absolute bottom-0 left-4 right-4 h-px"
                    style={{ background: '#ff3344' }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Balance + Logout */}
        <div className="flex items-center gap-4">
          <div className="reel-nav-balance">
            <span className="reel-nav-balance-label">Balance</span>
            <span className="reel-nav-balance-value tabular-nums">{formatTokens(balance)}</span>
            <span className="reel-nav-balance-suffix">tk</span>
          </div>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              window.location.href = '/login';
            }}
            className="flex items-center gap-1.5 cursor-pointer transition-colors duration-200"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'rgba(245,230,211,0.45)',
              background: 'transparent',
              border: 'none',
            }}
            title="Sign out"
          >
            Logout <span aria-hidden="true">&nearr;</span>
          </button>
        </div>
      </nav>
    </header>
  );
}
