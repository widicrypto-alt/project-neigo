'use client';

import { memo } from 'react';
import Image from 'next/image';

interface MobileBackdropProps {
  spriteUrl?: string | null;
  characterName?: string;
}

/**
 * MobileBackdrop - Full-bleed immersive background for mobile
 * 
 * When screen < md, character becomes blurred backdrop behind chat.
 * This provides an immersive experience on mobile devices.
 */
function MobileBackdrop({
  spriteUrl,
  characterName = 'Character',
}: MobileBackdropProps) {
  if (!spriteUrl) {
    return (
      <div className="vn-mobile-backdrop" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-950/50 via-orange-950/30 to-stone-950" />
      </div>
    );
  }

  return (
    <div className="vn-mobile-backdrop" aria-hidden="true">
      {/* Blurred sprite as backdrop */}
      <Image
        src={spriteUrl}
        alt={`${characterName} backdrop`}
        className="w-full h-full object-cover"
        style={{
          filter: 'blur(12px) brightness(0.35) saturate(0.9)',
        }}
        loading="eager"
        unoptimized
        width={1024}
        height={1024}
      />
      
      {/* Gradient overlay for readability */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(to bottom, 
              rgba(8, 5, 3, 0.7) 0%, 
              rgba(8, 5, 3, 0.4) 40%,
              rgba(8, 5, 3, 0.6) 70%,
              rgba(8, 5, 3, 0.9) 100%
            ),
            radial-gradient(ellipse at center, transparent 0%, rgba(8, 5, 3, 0.5) 100%)
          `,
        }}
      />
    </div>
  );
}

export default memo(MobileBackdrop);
