'use client';
import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  html: string;
  className?: string;
}

// BACKLOG B2.15 — internal hosts that bypass the external-link confirm.
// Any URL whose hostname matches the current page or one of these suffixes
// is considered first-party and navigates without interception.
const INTERNAL_SUFFIXES = ['neigo.app', 'neigo.app', 'localhost'];

function isInternalLink(href: string): boolean {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin === window.location.origin) return true;
    const host = url.hostname.toLowerCase();
    return INTERNAL_SUFFIXES.some((s) => host === s || host.endsWith('.' + s));
  } catch {
    return true; // relative / malformed → treat as internal
  }
}

/**
 * Renders server-sanitized HTML. Never passes raw user input — always
 * receives pre-rendered HTML from the server's rich-content service.
 *
 * Click delegation (B2.15): every anchor with an external href triggers a
 * confirm() dialog before navigation. Modifier-clicks (cmd/ctrl/middle)
 * are passed through so power users can still open new tabs at will.
 */
export function RichContent({ html, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;
    // Allow modifier-clicks (open in new tab) without prompting.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as unknown as { button: number }).button === 1) return;
    if (isInternalLink(href)) return;
    e.preventDefault();
    const ok = window.confirm(`Buka tautan eksternal?\n\n${href}`);
    if (ok) window.open(href, '_blank', 'noopener,noreferrer');
  }, []);

  // BACKLOG B2.13 — lazy syntax highlight via shiki. We only load shiki when a
  // <pre><code class="language-X"> block is present in the rendered HTML, and
  // we restrict the highlighter to a small language whitelist to keep bundle
  // weight in check (shiki's tree-shaking lets us pay only for what we use).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const codes = root.querySelectorAll<HTMLElement>('pre > code[class*="language-"]');
    if (codes.length === 0) return;
    let cancelled = false;
    const SUPPORTED = new Set(['ts', 'tsx', 'js', 'jsx', 'json', 'bash', 'sh', 'sql', 'py', 'python', 'md', 'markdown', 'yaml', 'yml', 'html', 'css']);
    (async () => {
      try {
        const langs: string[] = [];
        codes.forEach((c) => {
          const m = c.className.match(/language-([\w-]+)/);
          const l = m?.[1]?.toLowerCase();
          if (l && SUPPORTED.has(l) && !langs.includes(l)) langs.push(l);
        });
        if (langs.length === 0) return;
        const { createHighlighter } = await import('shiki');
        const highlighter = await createHighlighter({
          themes: ['github-dark-dimmed'],
          langs,
        });
        if (cancelled) return;
        codes.forEach((code) => {
          const m = code.className.match(/language-([\w-]+)/);
          const lang = m?.[1]?.toLowerCase();
          if (!lang || !SUPPORTED.has(lang)) return;
          const pre = code.parentElement;
          if (!pre || pre.dataset.shikiHl === '1') return;
          const source = code.textContent ?? '';
          try {
            const highlighted = highlighter.codeToHtml(source, {
              lang,
              theme: 'github-dark-dimmed',
            });
            pre.outerHTML = highlighted;
          } catch {
            // unsupported lang at runtime — leave plain.
          }
        });
      } catch {
        // shiki unavailable — graceful no-op.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'prose prose-invert prose-sm max-w-none',
        'prose-headings:text-ink-100 prose-p:text-ink-300',
        'prose-a:text-violet-400 prose-a:underline',
        'prose-blockquote:border-violet-500 prose-blockquote:text-ink-400',
        'prose-code:bg-ink-800 prose-code:px-1 prose-code:rounded',
        'prose-strong:text-ink-100',
        className,
      )}
      onClick={onClick}
      // Server-rendered sanitized HTML — safe to use dangerouslySetInnerHTML.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
