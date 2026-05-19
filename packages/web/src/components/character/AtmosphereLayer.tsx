'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Image from 'next/image';
import { MOOD_PRESETS, type MoodPreset, type MoodPresetKey, type Emotion } from '@/lib/chat-experience';

// Emotion → Mood Preset mapping
const EMOTION_MOOD_MAP: Record<Emotion, MoodPresetKey> = {
  // Positive emotions - brighter, warmer
  happy: 'daylight',
  smile: 'candlelight',
  laugh: 'daylight',
  warm: 'candlelight',
  tender: 'candlelight',
  
  // Neutral emotions - balanced
  neutral: 'candlelight',
  thinking: 'moonlight',
  focused: 'daylight',
  
  // Negative emotions - dimmer, cooler or harsh
  sad: 'night',
  vulnerable: 'night',
  anxious: 'dusk',
  
  // Complex emotions
  surprised: 'dawn',
  curious: 'moonlight',
  playful: 'candlelight',
  conflicted: 'dusk',
  
  // Strong negative - harsh
  angry: 'night',
  cold: 'night',
  
  // Special
  confused: 'dusk',
};

interface AtmosphereLayerProps {
  moodPreset?: MoodPresetKey;
  emotion?: Emotion;
  backgroundUrl?: string;
  mousePosition?: { x: number; y: number };
  reducedMotion?: boolean;
}

/**
 * Dust Mote Particle
 */
interface DustMote {
  id: number;
  x: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
}

function DustMotes({
  count,
  preset,
  reducedMotion
}: {
  count: number;
  preset: MoodPreset;
  reducedMotion: boolean;
}) {
  const motes = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      size: preset.dustParticles.size[0] + Math.random() * (preset.dustParticles.size[1] - preset.dustParticles.size[0]),
      opacity: preset.dustParticles.opacity[0] + Math.random() * (preset.dustParticles.opacity[1] - preset.dustParticles.opacity[0]),
      duration: preset.dustParticles.duration[0] + Math.random() * (preset.dustParticles.duration[1] - preset.dustParticles.duration[0]),
      delay: Math.random() * preset.dustParticles.duration[1],
    }));
  }, [count, preset]);

  if (reducedMotion) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {motes.map((mote) => (
        <div
          key={mote.id}
          className="vn-dust-mote"
          style={{
            left: `${mote.x}%`,
            width: mote.size,
            height: mote.size,
            opacity: mote.opacity,
            '--drift-duration': `${mote.duration}s`,
            '--drift-delay': `${-mote.delay}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/**
 * Mood Lighting Overlay
 */
function MoodLighting({ preset }: { preset: MoodPreset }) {
  return (
    <div
      className="absolute inset-0 vn-mood-overlay"
      style={{
        background: preset.colors.ambient,
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Parallax Background Layer
 */
interface ParallaxLayerProps {
  backgroundUrl?: string;
  mousePosition: { x: number; y: number };
  preset: MoodPreset;
}

function ParallaxBackground({
  backgroundUrl,
  mousePosition,
  preset,
}: ParallaxLayerProps) {
  const [position, setPosition] = useState({ x: 50, y: 50 });

  useEffect(() => {
    // Calculate parallax offset based on mouse position
    const centerX = (mousePosition.x - 0.5) * 2; // -1 to 1
    const centerY = (mousePosition.y - 0.5) * 2; // -1 to 1

    // Far layer moves 8px, mid layer 16px
    const farOffsetX = centerX * 4;
    const farOffsetY = centerY * 4;

    setPosition({
      x: 50 + farOffsetX * 0.1,
      y: 50 + farOffsetY * 0.1,
    });
  }, [mousePosition]);

  return (
    <div
      className="absolute inset-0 vn-parallax-layer"
      style={{
        backgroundPosition: `${position.x}% ${position.y}%`,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Background image if provided */}
      {backgroundUrl && (
        <Image
          src={backgroundUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: 0.7 }}
          loading="eager"
          unoptimized
          width={1024}
          height={1024}
        />
      )}

      {/* Mood color overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: preset.colors.tint,
        }}
      />

      {/* Vignette effect */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)',
        }}
      />
    </div>
  );
}

/**
 * Edge Gradients for smooth blending
 */
function EdgeGradients() {
  return (
    <>
      <div className="vn-edge-gradient-left" aria-hidden="true" />
      <div className="vn-edge-gradient-bottom" aria-hidden="true" />
    </>
  );
}

/**
 * Main AtmosphereLayer Component
 */
export default function AtmosphereLayer({
  moodPreset = 'candlelight',
  emotion,
  backgroundUrl,
  mousePosition = { x: 0.5, y: 0.5 },
  reducedMotion = false,
}: AtmosphereLayerProps) {
  // Emotion takes priority over moodPreset for dynamic mood changes
  const effectiveMoodKey = emotion ? EMOTION_MOOD_MAP[emotion] || moodPreset : moodPreset;
  const preset = MOOD_PRESETS[effectiveMoodKey] || MOOD_PRESETS.candlelight;

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Parallax Background */}
      <ParallaxBackground
        backgroundUrl={backgroundUrl}
        mousePosition={mousePosition}
        preset={preset}
      />

      {/* Mood Lighting */}
      <MoodLighting preset={preset} />

      {/* Dust Particles */}
      <DustMotes
        count={preset.dustParticles.count}
        preset={preset}
        reducedMotion={reducedMotion}
      />

      {/* Edge Gradients */}
      <EdgeGradients />
    </div>
  );
}
