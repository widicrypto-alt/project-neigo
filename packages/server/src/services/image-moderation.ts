/**
 * PLANBv3 H4 — Image moderation service.
 *
 * Minimum viable moderation per PLANBv3.md §5. Two modes:
 *
 *   mode='beta' (default)    — log-only; auto-approve every commit so the
 *                              gallery ships without a paid classifier.
 *                              Users on users.nsfw_enabled=true may opt-in
 *                              to mark their own uploads NSFW at commit
 *                              time; that flag is honoured as-is.
 *
 *   mode='cloudflare'        — calls Cloudflare Workers AI image-safety
 *                              classifier when IMAGE_MOD_CF_TOKEN is set.
 *                              Reserved for a later rollout.
 *
 * Hard-block categories (minors / extreme violence) always return rejected
 * when the classifier signals them, regardless of user NSFW flag.
 */

export type ModerationStatus = 'approved' | 'rejected' | 'needs_review';

export interface ModerationResult {
  status: ModerationStatus;
  nsfw: boolean;
  reason: string | null;
  scores: Record<string, number>;
}

const MODE = (process.env.IMAGE_MODERATION_MODE ?? 'beta').toLowerCase();

/**
 * PLANBv7 W-B — hard-block categories that reject regardless of user NSFW
 * preference. Scores come from the classifier (CF Workers AI, future
 * adapters). Default threshold 0.75 is intentionally strict; a false
 * positive costs a retry, a false negative is a policy incident.
 *
 * Disable only for dev diagnostics via IMAGE_MODERATION_HARDBLOCK_ENABLED=false.
 */
const HARDBLOCK_ENABLED =
  (process.env.IMAGE_MODERATION_HARDBLOCK_ENABLED ?? 'true').toLowerCase() !== 'false';
const HARDBLOCK_THRESHOLD = Number.parseFloat(
  process.env.IMAGE_MODERATION_HARDBLOCK_THRESHOLD ?? '0.75',
);
export const HARD_BLOCK_CATEGORIES = [
  'minors',
  'real_face_verified',
  'gore',
  'extreme_violence',
] as const;
export type HardBlockCategory = (typeof HARD_BLOCK_CATEGORIES)[number];

/**
 * Returns the name of the hard-block category that tripped the threshold,
 * or null when no category crosses it / hard-block is disabled.
 */
export function evaluateHardBlock(
  scores: Record<string, number>,
): HardBlockCategory | null {
  if (!HARDBLOCK_ENABLED) return null;
  for (const cat of HARD_BLOCK_CATEGORIES) {
    const v = scores[cat];
    if (typeof v === 'number' && Number.isFinite(v) && v >= HARDBLOCK_THRESHOLD) {
      return cat;
    }
  }
  return null;
}

/**
 * Evaluate an uploaded image.
 *
 * For the beta path we do not pull the bytes from R2 at all — we just
 * trust the uploader's `nsfw` flag and auto-approve. Future phases can
 * stream the object through a classifier here.
 *
 * PLANBv7 W-B: if any hard-block category crosses threshold (from the CF
 * classifier path), we reject the commit even if the user did not flag
 * it NSFW. The uploader-supplied `reportedNsfw` is a preference flag,
 * not a safety gate.
 */
export async function moderateImage(args: {
  imageId: string;
  key: string;
  userId: string;
  reportedNsfw: boolean;
}): Promise<ModerationResult> {
  if (MODE === 'cloudflare' && process.env.IMAGE_MOD_CF_TOKEN) {
    // Reserved: call Cloudflare Workers AI classifier. Graceful fallback
    // to beta if the call throws so we never hard-fail a commit.
    try {
      const result = await cloudflareClassify(args);
      const hb = evaluateHardBlock(result.scores);
      if (hb) {
        return {
          status: 'rejected',
          nsfw: true,
          reason: `hard_block:${hb}`,
          scores: result.scores,
        };
      }
      return result;
    } catch (err) {
      console.warn('[moderation] cf classifier failed, falling back to beta', err);
    }
  }
  return {
    status: 'approved',
    nsfw: !!args.reportedNsfw,
    reason: null,
    scores: { mode: MODE === 'cloudflare' ? 0.1 : 0 },
  };
}

async function cloudflareClassify(args: {
  imageId: string;
  key: string;
  userId: string;
  reportedNsfw: boolean;
}): Promise<ModerationResult> {
  // Placeholder: the real integration pulls the object and POSTs to
  // https://api.cloudflare.com/client/v4/accounts/<id>/ai/run/@cf/unum/… .
  // We keep it compiling here with a safe no-op so the production path
  // can be turned on via env + a follow-up PR without schema churn.
  void args;
  return {
    status: 'approved',
    nsfw: !!args.reportedNsfw,
    reason: null,
    scores: { mode: 1 },
  };
}
