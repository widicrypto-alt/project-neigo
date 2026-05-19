import type { Metadata } from 'next';
import CharacterDetailClient from './CharacterDetailClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://neigo.com';

interface CharacterData {
  character: {
    id: string;
    name: string;
    avatarUrl: string | null;
    tagline?: string | null;
    tonePreset: string;
    isPublic: boolean;
    language: string;
    tags: string[];
  };
  detail: {
    tagline: string | null;
    descriptionMd: string | null;
    totalChats: number | null;
    avgStars: number | null;
  };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  try {
    const res = await fetch(`${API_URL}/api/characters/${id}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error('not found');
    const data = (await res.json()) as CharacterData;
    const char = data.character;
    const detail = data.detail;
    const title = `${char.name} — Project Neigo`;
    const description = detail?.tagline || detail?.descriptionMd?.slice(0, 160) || `Chat with ${char.name} on Project Neigo`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${BASE_URL}/characters/${id}`,
        images: char.avatarUrl ? [{ url: char.avatarUrl, width: 400, height: 400 }] : [],
        type: 'profile',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: char.avatarUrl ? [char.avatarUrl] : [],
      },
    };
  } catch {
    return {
      title: 'Character — Project Neigo',
      description: 'Discover AI characters on Project Neigo',
    };
  }
}

export default function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  // We need to unwrap the params promise for the client component
  // Use React.use() in the client component instead
  return <CharacterDetailClientWrapper params={params} />;
}

import { use } from 'react';

function CharacterDetailClientWrapper({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CharacterDetailClient id={id} />;
}
