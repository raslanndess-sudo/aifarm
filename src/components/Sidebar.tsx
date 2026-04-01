'use client';
import { Clapperboard, Library, Smartphone, CalendarDays, BarChart2, CreditCard, Cpu } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'studio',    label: 'Studio',        icon: Clapperboard },
  { id: 'library',   label: 'Video Library',  icon: Library },
  { id: 'phonefarm', label: 'Phone Farm',     icon: Smartphone },
  { id: 'scheduler', label: 'Scheduler',      icon: CalendarDays },
  { id: 'analytics', label: 'Analytics',      icon: BarChart2 },
  { id: 'billing',   label: 'Billing',        icon: CreditCard },
];

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <header className="shrink-0 border-b border-zinc-800/50 bg-zinc-950 sticky top-0 z-50">
      <div className="flex items-center h-12 px-5">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0 mr-8">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-white" />
          </div>
        </div>

        {/* Nav — plain text like Leonardo */}
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ id, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className={`px-3 py-1 text-sm transition-colors ${
                  active
                    ? 'text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
