'use client';

import { memo, useCallback } from 'react';
import Image from 'next/image';
import type { Emotion } from '@/lib/chat-experience';
import { EMOTION_LABELS } from '@/lib/chat-experience';

interface ExpressionGalleryProps {
  recentEmotions: Emotion[];
  currentEmotion: Emotion;
  onSelectEmotion: (emotion: Emotion) => void;
  spriteManifest?: Record<string, string>;
}

/**
 * ExpressionGallery - Horizontal strip showing recent emotions
 * 
 * Features:
 * - Shows last 5 unique emotions
 * - Thumbnails with 48px height
 * - Click to pin emotion on sprite
 * - Auto-clears when new emotion arrives
 */
function ExpressionGallery({
  recentEmotions,
  currentEmotion,
  onSelectEmotion,
  spriteManifest = {},
}: ExpressionGalleryProps) {
  // Limit to 5 emotions
  const displayEmotions = recentEmotions.slice(0, 5);

  const handleSelect = useCallback((emotion: Emotion) => {
    onSelectEmotion(emotion);
  }, [onSelectEmotion]);

  if (displayEmotions.length === 0) {
    return null;
  }

  return (
    <div
      className="vn-expression-gallery"
      role="list"
      aria-label="Expression history"
    >
      {displayEmotions.map((emotion, index) => {
        const spriteUrl = spriteManifest[emotion];
        const isActive = emotion === currentEmotion;

        return (
          <button
            key={`${emotion}-${index}`}
            className={`vn-expression-thumb ${isActive ? 'active' : ''}`}
            onClick={() => handleSelect(emotion)}
            aria-label={`Select ${EMOTION_LABELS[emotion]} expression`}
            aria-pressed={isActive}
            title={EMOTION_LABELS[emotion]}
            type="button"
          >
            {spriteUrl ? (
              <Image
                src={spriteUrl}
                alt={EMOTION_LABELS[emotion]}
                className="w-full h-full object-cover"
                loading="lazy"
                unoptimized
                width={48}
                height={48}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-amber-900/30 to-orange-950/40 flex items-center justify-center">
                <span className="text-amber-500/60 text-xs font-medium">
                  {emotion.slice(0, 3).toUpperCase()}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Memoize for performance
export default memo(ExpressionGallery);
