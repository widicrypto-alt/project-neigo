export function formatAutoSessionTitle(args: {
  title?: string | null;
  mode: string;
  characterName?: string | null;
  createdAt: Date;
}): string {
  const cleaned = (args.title ?? '').trim();
  if (cleaned) return cleaned;

  const base = args.characterName?.trim() || 'New chat';
  const date = args.createdAt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });

  if (args.mode === 'ROLEPLAY') return `Roleplay with ${base} (${date})`;
  return `Chat with ${base} (${date})`;
}
