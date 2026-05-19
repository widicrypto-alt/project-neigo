/**
 * PLANIMPv6 — Server-side MD → sanitized HTML renderer.
 * Uses micromark + micromark-extension-gfm + sanitize-html.
 * NEVER runs in the browser. Browser previews use POST /api/preview/render.
 */
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import sanitizeHtml from 'sanitize-html';
import type { IOptions } from 'sanitize-html';
import { estimateTokensFast } from '@neigo/shared';
import { env } from '../lib/env.js';

// BACKLOG B2.14 — `<img src>` host allowlist driven by R2_PUBLIC_DOMAINS.
// Empty list = pass-through (legacy). Match is suffix-based so subdomains
// of an allowed apex are accepted (e.g. "cdn.r2.neigo.app" passes when
// "r2.neigo.app" is on the list). Data URIs are rejected when the list is
// non-empty since they can't be host-checked.
function isAllowedImgSrc(src: string | undefined): boolean {
  if (!src) return false;
  const allow = env.R2_PUBLIC_DOMAINS;
  if (!allow.length) return true;
  try {
    const u = new URL(src, 'https://placeholder.local');
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    return allow.some((d) => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

// ─── Allowlists ───────────────────────────────────────────────────────────────

const DEFAULT_PROFILE: IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4',
    'blockquote', 'ul', 'ol', 'li',
    'strong', 'em', 'u', 's',
    'code', 'pre',
    'a', 'img',
    'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'details', 'summary',
    'iframe',
    'span', 'div',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'loading', 'width', 'height'],
    iframe: ['src', 'title', 'loading', 'allow', 'allowfullscreen', 'frameborder'],
    code: ['class'],
    th: ['scope'],
    td: ['colspan', 'rowspan'],
    div: ['class'],
    span: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'player.vimeo.com'],
  transformTags: {
    a: (_tag, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, target: '_blank', rel: 'noopener nofollow ugc' },
    }),
    img: (_tag, attribs) => {
      if (!isAllowedImgSrc(attribs.src)) {
        return { tagName: 'span', attribs: { class: 'md-img-blocked' } };
      }
      return {
        tagName: 'img',
        attribs: { ...attribs, loading: 'lazy', class: attribs.class ?? '' },
      };
    },
  },
  disallowedTagsMode: 'discard',
};

const COMMENT_PROFILE: IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
    'ul', 'ol', 'li', 'a', 'blockquote', 'span',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: (_tag, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, target: '_blank', rel: 'noopener nofollow ugc' },
    }),
  },
  disallowedTagsMode: 'discard',
};

const PROFILES: Record<string, IOptions> = {
  default: DEFAULT_PROFILE,
  comment: COMMENT_PROFILE,
};

// ─── Main export ─────────────────────────────────────────────────────────────

export function renderAndSanitize(
  md: string,
  profile: 'default' | 'comment' = 'default',
): { html: string; tokenCount: number } {
  if (!md?.trim()) return { html: '', tokenCount: 0 };
  try {
    const raw = micromark(md, {
      extensions: [gfm()],
      htmlExtensions: [gfmHtml()],
    });
    const html = sanitizeHtml(raw, PROFILES[profile] ?? DEFAULT_PROFILE);
    return { html, tokenCount: estimateTokensFast(md) };
  } catch {
    // Pathological input — return escaped plain text.
    const html = sanitizeHtml(md, { allowedTags: [], allowedAttributes: {} });
    return { html, tokenCount: estimateTokensFast(md) };
  }
}
