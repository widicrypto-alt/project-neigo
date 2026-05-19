/**
 * Deterministic poster picker for character cards.
 * Returns one of the seeded gradient posters based on stable id hash.
 * Replace by uploading actual avatar/art to the character record.
 */
const POSTERS = ['/img/poster-01.svg', '/img/poster-02.svg', '/img/poster-03.svg'];

export function posterFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % POSTERS.length;
  return POSTERS[idx]!;
}
