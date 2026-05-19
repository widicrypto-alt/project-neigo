'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import type { Emotion, CrossfadePhase } from '@/lib/chat-experience';
import { ANIMATION_TIMINGS } from '@/lib/chat-experience';

interface SpriteLayerProps {
  currentUrl: string | null;
  nextUrl?: string | null;
  currentEmotion: Emotion;
  isTransitioning: boolean;
  reducedMotion?: boolean;
  onTransitionComplete?: () => void;
}

/**
 * Get sprite motion class based on emotion
 */
function getEmotionMotionClass(emotion: Emotion): string {
  const motionMap: Record<Emotion, string> = {
    happy: 'sprite-motion-success',
    smile: 'sprite-motion-success',
    laugh: 'sprite-motion-success',
    neutral: 'sprite-motion-breathe',
    thinking: 'sprite-motion-thinking',
    confused: 'sprite-motion-thinking',
    curious: 'sprite-motion-thinking',
    surprised: 'sprite-motion-alert',
    angry: 'sprite-motion-alert',
    sad: 'sprite-motion-breathe',
    warm: 'sprite-motion-breathe',
    tender: 'sprite-motion-breathe',
    vulnerable: 'sprite-motion-breathe',
    playful: 'sprite-motion-speak',
    conflicted: 'sprite-motion-thinking',
    cold: 'sprite-motion-breathe',
    anxious: 'sprite-motion-alert',
    focused: 'sprite-motion-thinking',
  };

  return motionMap[emotion] || 'sprite-motion-breathe';
}

/**
 * Sprite Layer with Crossfade Transitions
 * 
 * Implements the state machine for sprite transitions:
 * - idle: Current sprite visible
 * - fading-out: Current sprite fading, next sprite loading
 * - fading-in: Next sprite fading in
 */
export default function SpriteLayer({
  currentUrl,
  nextUrl,
  currentEmotion,
  isTransitioning,
  reducedMotion = false,
  onTransitionComplete,
}: SpriteLayerProps) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(currentUrl);
  const [displayEmotion, setDisplayEmotion] = useState<Emotion>(currentEmotion);
  const [phase, setPhase] = useState<CrossfadePhase>('idle');
  const [currentOpacity, setCurrentOpacity] = useState(1);
  const [nextOpacity, setNextOpacity] = useState(0);
  
  const currentImgRef = useRef<HTMLImageElement>(null);
  const nextImgRef = useRef<HTMLImageElement>(null);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performTransition = useCallback((targetUrl: string) => {
    // Clear any existing timeout
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }

    // Phase 1: Fade out current sprite
    setPhase('fading-out');
    setCurrentOpacity(0);

    // Wait for fade out
    const fadeOutDuration = reducedMotion ? 100 : ANIMATION_TIMINGS.spriteCrossfade.opacity;
    
    transitionTimeoutRef.current = setTimeout(() => {
      // Update display to new sprite
      setDisplayUrl(targetUrl);
      setDisplayEmotion(currentEmotion);
      
      // Phase 2: Fade in new sprite
      setPhase('fading-in');
      setNextOpacity(1);
      
      // Wait for fade in, then complete
      const fadeInDuration = reducedMotion ? 100 : ANIMATION_TIMINGS.spriteCrossfade.opacity;
      
      transitionTimeoutRef.current = setTimeout(() => {
        setPhase('idle');
        setCurrentOpacity(1);
        setNextOpacity(0);
        onTransitionComplete?.();
      }, fadeInDuration);
    }, fadeOutDuration);
  }, [currentEmotion, reducedMotion, onTransitionComplete]);

  // Handle incoming transitions
  useEffect(() => {
    if (isTransitioning && nextUrl && nextUrl !== currentUrl) {
      // Start transition sequence
      performTransition(nextUrl);
    }
  }, [isTransitioning, nextUrl, currentUrl, performTransition]);

  // Update current sprite when emotion changes without URL change
  useEffect(() => {
    if (currentUrl && !isTransitioning) {
      setDisplayUrl(currentUrl);
      setDisplayEmotion(currentEmotion);
    }
  }, [currentUrl, currentEmotion, isTransitioning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  const motionClass = getEmotionMotionClass(displayEmotion);
  const isFading = phase !== 'idle';

  return (
    <div
      className="relative w-full h-full flex items-center justify-center"
      role="img"
      aria-label={`Character sprite showing ${displayEmotion} expression`}
    >
      {/* Current Sprite */}
      <div
        className={`vn-sprite-container vn-sprite-fade vn-breathing ${motionClass}`}
        style={{
          opacity: currentOpacity,
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {displayUrl ? (
          <Image
            ref={currentImgRef}
            src={displayUrl}
            alt=""
            className="max-w-full max-h-full object-contain"
            style={{
              filter: isFading ? 'brightness(0.9)' : 'brightness(1)',
            }}
            loading="eager"
            unoptimized
            width={1024}
            height={1024}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-amber-900/20 to-orange-950/30 flex items-center justify-center">
            <span className="text-amber-500/40 text-lg font-light">
              Menunggu karakter...
            </span>
          </div>
        )}
      </div>

      {/* Next Sprite (during transition) */}
      {nextUrl && isFading && (
        <div
          className="vn-sprite-container vn-sprite-fade"
          style={{
            opacity: nextOpacity,
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Image
            ref={nextImgRef}
            src={nextUrl}
            alt=""
            className="max-w-full max-h-full object-contain"
            loading="eager"
            unoptimized
            width={1024}
            height={1024}
          />
        </div>
      )}

      {/* Sprite mood indicator glow */}
      {displayUrl && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% 70%, rgba(232, 162, 90, 0.15) 0%, transparent 60%)`,
            animation: reducedMotion ? 'none' : 'vn-mood-pulse 4s ease-in-out infinite',
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
