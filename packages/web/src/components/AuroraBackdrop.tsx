'use client';

/**
 * Full-viewport ambient aurora backdrop.
 * Fixed position so it stays while content scrolls.
 * Pure CSS — no JS animations; respects prefers-reduced-motion.
 */
export function AuroraBackdrop() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
    >
      {/* Base vignette */}
      <div className="absolute inset-0 bg-ink-950" />

      {/* Aurora blobs — tagged neigo-aurora-motion so data-saver + low-battery
          classes on <html> can disable the float animation without killing
          color. prefers-reduced-motion handled globally in tokens.css. */}
      <div
        className="neigo-aurora-motion absolute -top-40 -left-32 w-[38rem] h-[38rem] rounded-full opacity-40 blur-3xl animate-float"
        style={{
          background:
            'radial-gradient(closest-side, rgba(236,72,153,0.55), rgba(236,72,153,0) 70%)',
        }}
      />
      <div
        className="neigo-aurora-motion absolute top-[20%] right-[-10rem] w-[34rem] h-[34rem] rounded-full opacity-35 blur-3xl animate-float"
        style={{
          background:
            'radial-gradient(closest-side, rgba(139,92,246,0.5), rgba(139,92,246,0) 70%)',
          animationDelay: '-3s',
        }}
      />
      <div
        className="neigo-aurora-motion absolute bottom-[-12rem] left-[30%] w-[38rem] h-[38rem] rounded-full opacity-25 blur-3xl animate-float"
        style={{
          background:
            'radial-gradient(closest-side, rgba(232,154,92,0.5), rgba(232,154,92,0) 70%)',
          animationDelay: '-5s',
        }}
      />

      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage:
            'radial-gradient(ellipse at center, #000 40%, transparent 80%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, #000 40%, transparent 80%)',
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 30%, rgba(7,8,15,0.7) 90%)',
        }}
      />
    </div>
  );
}
