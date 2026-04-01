'use client';
import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Studio from '@/components/Studio';
import VideoLibrary from '@/components/VideoLibrary';
import PhoneFarm from '@/components/PhoneFarm';
import Scheduler from '@/components/Scheduler';
import Analytics from '@/components/Analytics';
import Billing from '@/components/Billing';

type Tab = 'studio' | 'library' | 'phonefarm' | 'scheduler' | 'analytics' | 'billing';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('studio');

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={(t) => setActiveTab(t as Tab)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'studio'    && <Studio />}
          {activeTab === 'library'   && <VideoLibrary />}
          {activeTab === 'phonefarm' && <PhoneFarm />}
          {activeTab === 'scheduler' && <Scheduler />}
          {activeTab === 'analytics' && <Analytics />}
          {activeTab === 'billing'   && <Billing />}
        </div>
      </main>
    </div>
  );
}
