/**
 * PLANIMPv6 — Shared rich-content rendering pipeline.
 * Runs on the SERVER only (sanitize-html is server-side).
 * Browser previews go through POST /api/preview/render.
 */

// Token estimator (already in shared).
export function estimateTokensFast(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export type RichContentProfile = 'default' | 'comment';

/**
 * Render Markdown → sanitized HTML.
 * Returns { html, tokenCount }.
 * This function does NOT import sanitize-html directly — the server package
 * must call renderAndSanitizeServer() which lives in @neigo/server.
 * This file only exports helpers that are safe to import in both environments.
 */
export function escapePromptTemplateTokens(s: string): string {
  return s.replace(/\{\{[^}]+\}\}/g, (m) =>
    m.replace('{{', '&#123;&#123;').replace('}}', '&#125;&#125;'),
  );
}

/**
 * Simple client-side MD → plain text summary (no sanitizer needed).
 * Strips markdown formatting for meta description / OG tags.
 */
export function mdToPlainText(md: string, maxChars = 300): string {
  const plain = md
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.*?\)/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/^>\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
  return plain.length > maxChars ? plain.slice(0, maxChars) + '…' : plain;
}
