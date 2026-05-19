import type { Metadata } from 'next';
import { use } from 'react';
import CreatorProfileClient from './CreatorProfileClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://neigo.com';

interface CreatorData {
  creator: {
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
  };
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const normalized = handle.toLowerCase().replace(/^@/, '');

  try {
    const res = await fetch(`${API_URL}/api/creators/${normalized}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error('not found');
    const data = (await res.json()) as CreatorData;
    const { creator } = data;
    const title = `${creator.displayName} (@${creator.handle}) — Project Neigo`;
    const description = creator.bio || `View ${creator.displayName}'s characters and stories on Project Neigo`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${BASE_URL}/creators/${handle}`,
        images: creator.avatarUrl ? [{ url: creator.avatarUrl, width: 200, height: 200 }] : [],
        type: 'profile',
      },
      twitter: {
        card: 'summary',
        title,
        description,
        images: creator.avatarUrl ? [creator.avatarUrl] : [],
      },
    };
  } catch {
    return {
      title: 'Creator — Project Neigo',
      description: 'View creator profiles on Project Neigo',
    };
  }
}

export default function CreatorPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  return <CreatorProfileClient handle={handle} />;
}
