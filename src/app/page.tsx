'use client';
import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Studio from '@/components/Studio';
import VideoLibrary from '@/components/VideoLibrary';
import PhoneFarm from '@/components/PhoneFarm';
import Scheduler from '@/components/Scheduler';
import Analytics from '@/components/Analytics';
import Billing from '@/components/Billing';
import Settings from '@/components/Settings';

type Tab = 'studio' | 'library' | 'phonefarm' | 'scheduler' | 'analytics' | 'billing' | 'settings';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('studio');
  const [transitionKey, setTransitionKey] = useState(0);

  const handleTabChange = (t: string) => {
    setActiveTab(t as Tab);
    setTransitionKey(prev => prev + 1);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />

      <main className="flex-1 flex flex-col overflow-hidden relative z-[1]">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1440px] mx-auto px-10 py-12 lg:py-16" key={transitionKey}>
            <div className="tab-content-enter">
              {activeTab === 'studio'    && <Studio />}
              {activeTab === 'library'   && <VideoLibrary />}
              {activeTab === 'phonefarm' && <PhoneFarm />}
              {activeTab === 'scheduler' && <Scheduler />}
              {activeTab === 'analytics' && <Analytics />}
              {activeTab === 'billing'   && <Billing />}
              {activeTab === 'settings'  && <Settings />}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
