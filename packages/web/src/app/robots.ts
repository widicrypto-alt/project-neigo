import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://neigo.com';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/stories/', '/characters/', '/signup', '/login'],
        disallow: [
          '/ops/',
          '/studio/',
          '/chat/',
          '/settings/',
          '/handoff/',
          '/account/',
          '/api/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
