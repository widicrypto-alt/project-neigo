/**
 * MARINARA H10 — Discord webhook mirror.
 *
 * Opt-in per session: creator sets
 *   `session.metadata.discordWebhook = "https://discord.com/api/webhooks/…"`
 * and (optionally) `session.metadata.allowNsfwInDiscord = true`.
 *
 * On each completed turn the orchestrator calls mirrorTurn(); we POST
 * two embeds (user + assistant) to the webhook, fire-and-forget.
 * NSFW content is stripped unless the session explicitly opted in.
 *
 * Security:
 *   - Only `https://discord.com/api/webhooks/…` URLs accepted;
 *     anything else returns silently (prevents SSRF).
 *   - Truncate each embed description to 2000 chars (Discord limit is 4096
 *     but we stay conservative to leave room for NSFW banners).
 *   - 4s upstream timeout so a flaky webhook never stalls the server loop.
 */

export interface MirrorInput {
  webhookUrl: string;
  characterName: string;
  userText: string;
  assistantText: string;
  nsfw: boolean;
  allowNsfw: boolean;
}

const DISCORD_WEBHOOK_RE = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;
const MAX_EMBED = 2000;
const TIMEOUT_MS = 4000;

function truncate(text: string, max = MAX_EMBED): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

export async function mirrorTurn(input: MirrorInput): Promise<void> {
  if (!DISCORD_WEBHOOK_RE.test(input.webhookUrl)) return;

  const assistantBody =
    input.nsfw && !input.allowNsfw ? '*[NSFW content hidden — enable in session settings]*' : input.assistantText;

  const payload = {
    embeds: [
      {
        author: { name: 'You' },
        description: truncate(input.userText),
        color: 0x6366f1,
      },
      {
        author: { name: input.characterName || 'Character' },
        description: truncate(assistantBody),
        color: 0xec4899,
      },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await fetch(input.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    // Fire-and-forget: log then swallow. A bad webhook never affects chat.
    console.warn('[discord-mirror] failed:', err);
  } finally {
    clearTimeout(timer);
  }
}

/** Pure validator exposed for settings UI. */
export function isValidDiscordWebhook(url: string | undefined | null): boolean {
  return typeof url === 'string' && DISCORD_WEBHOOK_RE.test(url);
}
