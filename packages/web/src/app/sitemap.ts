import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://neigo.com';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PublicEntity {
  id: string;
  updatedAt?: string;
  publishedAt?: string;
}

async function fetchPublicIds(path: string): Promise<PublicEntity[]> {
  try {
    const res = await fetch(`${API_URL}${path}?limit=500&status=published`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = await res.json() as { characters?: PublicEntity[]; stories?: PublicEntity[] };
    return (json.characters ?? json.stories ?? []) as PublicEntity[];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [characters, stories] = await Promise.all([
    fetchPublicIds('/api/characters'),
    fetchPublicIds('/api/stories'),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/stories`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE_URL}/characters`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE_URL}/login`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ];

  const characterRoutes: MetadataRoute.Sitemap = characters.map((c) => ({
    url: `${BASE_URL}/characters/${c.id}`,
    lastModified: new Date(c.updatedAt ?? c.publishedAt ?? Date.now()),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  const storyRoutes: MetadataRoute.Sitemap = stories.map((s) => ({
    url: `${BASE_URL}/stories/${s.id}`,
    lastModified: new Date(s.updatedAt ?? s.publishedAt ?? Date.now()),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...characterRoutes, ...storyRoutes];
}
