/* eslint-disable @next/next/no-img-element */
/**
 * BACKLOG B1.7 — OG image edge route.
 *
 * Dynamic Open Graph / Twitter card images for characters and stories.
 * Uses Next.js `next/og` (built into Next 15, no extra dependency).
 *
 *   GET /og-image/character/:id
 *   GET /og-image/story/:id
 *
 * Cached by Next for 24h (`revalidate = 86400`). Safe against enumeration:
 * private/flagged/soft-deleted entities fall through to a neutral
 * branded placeholder rather than 404 — share cards should never leak
 * moderation state.
 */
import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';
export const revalidate = 86_400;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type EntityData = {
  title: string;
  tagline: string;
  subline: string;
  heroUrl: string | null;
};

async function fetchEntity(entityType: string, entityId: string): Promise<EntityData | null> {
  try {
    if (entityType === 'character') {
      const res = await fetch(`${API_BASE}/api/characters/${entityId}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const { character } = (await res.json()) as {
        character: {
          name: string;
          tagline?: string | null;
          avatarUrl?: string | null;
          language?: string | null;
          tonePreset?: string | null;
          isPublic: boolean;
          isRetired: boolean;
          isFlaggedForReview?: boolean;
          deletedAt?: string | null;
        };
      };
      if (!character.isPublic || character.isRetired || character.isFlaggedForReview || character.deletedAt) {
        return null;
      }
      return {
        title: character.name,
        tagline: character.tagline ?? '',
        subline: [character.tonePreset, character.language?.toUpperCase()].filter(Boolean).join(' · '),
        heroUrl: character.avatarUrl ?? null,
      };
    }
    if (entityType === 'story') {
      const res = await fetch(`${API_BASE}/api/stories/${entityId}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const { story } = (await res.json()) as {
        story: {
          title: string;
          tagline?: string | null;
          heroCarousel?: Array<{ url: string }>;
          status?: string;
          authorDisplayName?: string | null;
          isFlaggedForReview?: boolean;
          deletedAt?: string | null;
        };
      };
      if (
        (story.status !== 'published' && story.status !== 'featured') ||
        story.isFlaggedForReview ||
        story.deletedAt
      ) {
        return null;
      }
      return {
        title: story.title,
        tagline: story.tagline ?? '',
        subline: story.authorDisplayName ? `oleh ${story.authorDisplayName}` : '',
        heroUrl: story.heroCarousel?.[0]?.url ?? null,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ entityType: string; entityId: string }> },
) {
  const { entityType, entityId } = await ctx.params;

  const data = await fetchEntity(entityType, entityId);
  const title = data?.title ?? 'Project Neigo';
  const tagline = data?.tagline || 'Cerita interaktif AI, dalam bahasa Indonesia';
  const subline = data?.subline ?? '';
  const heroUrl = data?.heroUrl ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
          color: '#e2e8f0',
          fontFamily: 'sans-serif',
          padding: 64,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {heroUrl ? (
          <img
            src={heroUrl}
            alt=""
            width={380}
            height={380}
            style={{
              objectFit: 'cover',
              borderRadius: 24,
              marginRight: 56,
              flexShrink: 0,
              boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
            }}
          />
        ) : null}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
            gap: 20,
          }}
        >
          <div style={{ display: 'flex', fontSize: 28, color: '#a5b4fc', letterSpacing: 4 }}>
            NEIGO
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: heroUrl ? 64 : 80,
              fontWeight: 700,
              lineHeight: 1.1,
              color: '#f8fafc',
              maxWidth: heroUrl ? 680 : 1000,
            }}
          >
            {title}
          </div>
          {tagline ? (
            <div
              style={{
                display: 'flex',
                fontSize: 32,
                lineHeight: 1.3,
                color: '#cbd5e1',
                maxWidth: heroUrl ? 680 : 1000,
              }}
            >
              {tagline.length > 120 ? `${tagline.slice(0, 120)}…` : tagline}
            </div>
          ) : null}
          {subline ? (
            <div style={{ display: 'flex', fontSize: 24, color: '#94a3b8' }}>{subline}</div>
          ) : null}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
