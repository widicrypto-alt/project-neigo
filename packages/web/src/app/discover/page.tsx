import { Suspense } from 'react';
import type { Metadata } from 'next';
import { DiscoverView } from '@/components/discover2/DiscoverView';

export const metadata: Metadata = {
  title: 'Discover · Project Neigo',
  description:
    'Browse AI character stories, roleplay adventures, and original worlds on Project Neigo.',
};

export default function DiscoverPage() {
  return (
    <div className="relative min-h-screen">
      {/* Ambient backdrop */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 neigo-backdrop" />
      <div className="relative z-10">
        <Suspense>
          <DiscoverView />
        </Suspense>
      </div>
    </div>
  );
}