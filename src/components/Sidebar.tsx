'use client';
import { Clapperboard, Library, Smartphone, CalendarDays, BarChart2, CreditCard, Settings, Cpu, LogOut } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'studio',    label: 'Studio',        icon: Clapperboard },
  { id: 'library',   label: 'Library',        icon: Library },
  { id: 'phonefarm', label: 'Phone Farm',     icon: Smartphone },
  { id: 'scheduler', label: 'Scheduler',      icon: CalendarDays },
  { id: 'analytics', label: 'Analytics',      icon: BarChart2 },
  { id: 'billing',   label: 'Billing',        icon: CreditCard },
  { id: 'settings',  label: 'Settings',       icon: Settings },
];

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <header className="shrink-0 sticky top-0 z-50">
      {/* Bottom border with gradient accent */}
      <div className="relative border-b border-border-subtle bg-surface-0/80 backdrop-blur-xl">
        <div className="flex items-center h-12 px-5">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0 mr-8">
            <div className="relative group cursor-pointer">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                <Cpu className="w-4 h-4 text-white" />
              </div>
              {/* Logo glow on hover */}
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 opacity-0 group-hover:opacity-30 blur-lg transition-opacity duration-300" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-text-primary hidden sm:block">
              <span className="gradient-text">AI</span>
              <span className="text-text-secondary ml-0.5">Video</span>
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-0.5">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => onTabChange(id)}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-200 ${
                    active
                      ? 'text-text-primary bg-white/[0.06]'
                      : 'text-text-tertiary hover:text-text-secondary hover:bg-white/[0.03]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 transition-colors duration-200 ${
                    active ? 'text-purple-400' : ''
                  }`} />
                  {label}
                  {/* Active indicator - bottom line */}
                  {active && (
                    <span className="absolute -bottom-[7px] left-3 right-3 h-[2px] rounded-full bg-gradient-to-r from-purple-500 to-cyan-500" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Spacer + Logout */}
          <div className="ml-auto">
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/login';
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] text-text-muted hover:text-red-400 hover:bg-red-500/[0.06] transition-all duration-200"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
