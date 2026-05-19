'use client';

import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import AtmosphereLayer from './AtmosphereLayer';
import SpriteLayer from './SpriteLayer';
import ExpressionGallery from './ExpressionGallery';
import MobileBackdrop from './MobileBackdrop';
import {
  MOOD_PRESETS,
  DEFAULT_EMOTION,
  CRITICAL_EMOTIONS,
  type Emotion,
  type MoodPresetKey,
  type SpriteManifest,
} from '@/lib/chat-experience';

interface CharacterStageProps {
  characterName: string;
  spriteManifest?: SpriteManifest | null;
  currentEmotion: Emotion;
  moodPreset?: MoodPresetKey;
  backgroundUrl?: string;
  recentEmotions?: Emotion[];
  onEmotionSelect?: (emotion: Emotion) => void;
  isMobile?: boolean;
  className?: string;
}

/**
 * CharacterStage - Fixed character container
 * 
 * Combines:
 * - AtmosphereLayer (parallax backgrounds, mood lighting, dust particles)
 * - SpriteLayer (crossfade sprite rendering)
 * - ExpressionGallery (emotion thumbnail strip)
 * 
 * Layout:
 * ┌─────────────────────────────────┐
 * │     AtmosphereLayer (bg)         │
 * │  ┌─────────────────────────┐    │
 * │  │                         │    │
 * │  │     SpriteLayer         │    │
 * │  │   (character sprite)    │    │
 * │  │                         │    │
 * │  └─────────────────────────┘    │
 * │  ┌─────────────────────────┐    │
 * │  │   ExpressionGallery     │    │
 * │  └─────────────────────────┘    │
 * └─────────────────────────────────┘
 */
function CharacterStage({
  characterName,
  spriteManifest = {},
  currentEmotion,
  moodPreset = 'candlelight',
  backgroundUrl,
  recentEmotions = [],
  onEmotionSelect,
  isMobile = false,
  className = '',
}: CharacterStageProps) {
  // Mouse position for parallax effect
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });
  
  // Reduced motion preference
  const [reducedMotion, setReducedMotion] = useState(false);
  
  // Normalize spriteManifest
  const manifest = useMemo(() => spriteManifest ?? {}, [spriteManifest]);
  
  // Current sprite URL
  const [currentSpriteUrl, setCurrentSpriteUrl] = useState<string | null>(
    manifest[currentEmotion] || manifest[DEFAULT_EMOTION] || null
  );
  
  // Next sprite URL for transition
  const [nextSpriteUrl, setNextSpriteUrl] = useState<string | null>(null);
  
  // Is transitioning
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Container ref
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Update sprite when emotion or manifest changes
  useEffect(() => {
    const targetUrl = manifest[currentEmotion] || manifest[DEFAULT_EMOTION] || null;
    
    if (targetUrl && targetUrl !== currentSpriteUrl && !isTransitioning) {
      setNextSpriteUrl(targetUrl);
      setIsTransitioning(true);
    }
  }, [currentEmotion, manifest, currentSpriteUrl, isTransitioning]);

  // Preload critical emotions
  useEffect(() => {
    if (!manifest) return;

    for (const emotion of CRITICAL_EMOTIONS) {
      const url = manifest[emotion];
      if (url) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = url;
        document.head.appendChild(link);
      }
    }
  }, [manifest]);

  // Handle mouse move for parallax
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    setMousePosition({ x, y });
  }, []);

  // Add mouse move listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mousemove', handleMouseMove);
    return () => container.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  // Handle transition complete
  const handleTransitionComplete = useCallback(() => {
    if (nextSpriteUrl) {
      setCurrentSpriteUrl(nextSpriteUrl);
      setNextSpriteUrl(null);
    }
    setIsTransitioning(false);
  }, [nextSpriteUrl]);

  // Handle emotion select from gallery
  const handleEmotionSelect = useCallback((emotion: Emotion) => {
    onEmotionSelect?.(emotion);
  }, [onEmotionSelect]);

  // Get current sprite URL
  const displaySpriteUrl = isTransitioning ? currentSpriteUrl : (manifest[currentEmotion] || currentSpriteUrl);

  // Mobile backdrop mode
  if (isMobile) {
    return (
      <MobileBackdrop
        spriteUrl={displaySpriteUrl}
        characterName={characterName}
      />
    );
  }

  return (
    <aside
      ref={containerRef}
      className={`vn-character-stage ${className} ${reducedMotion ? 'vn-reduced-motion' : ''}`}
      aria-label={`${characterName} sprite and context`}
      role="region"
    >
      {/* Atmosphere Layer - Background */}
      <AtmosphereLayer
        moodPreset={moodPreset}
        emotion={currentEmotion}
        backgroundUrl={backgroundUrl}
        mousePosition={mousePosition}
        reducedMotion={reducedMotion}
      />

      {/* Sprite Layer - Character */}
      <div className="absolute inset-0 z-10">
        <SpriteLayer
          currentUrl={displaySpriteUrl}
          nextUrl={nextSpriteUrl}
          currentEmotion={currentEmotion}
          isTransitioning={isTransitioning}
          reducedMotion={reducedMotion}
          onTransitionComplete={handleTransitionComplete}
        />
      </div>

      {/* Character Name Badge */}
      <div className="absolute top-4 left-4 z-20">
        <div className="vn-speaker-badge">
          <span>{characterName}</span>
        </div>
      </div>

      {/* Expression Gallery */}
      {recentEmotions.length > 0 && onEmotionSelect && (
        <div className="absolute bottom-20 left-4 right-4 z-20">
          <ExpressionGallery
            recentEmotions={recentEmotions}
            currentEmotion={currentEmotion}
            onSelectEmotion={handleEmotionSelect}
            spriteManifest={manifest}
          />
        </div>
      )}

      {/* Entrance Animation */}
      <style jsx>{`
        aside {
          animation: vn-stage-enter 600ms ease-out both;
        }
      `}</style>
    </aside>
  );
}

// Memoize for performance
export default memo(CharacterStage);
