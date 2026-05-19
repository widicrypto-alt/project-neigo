'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Maps mood/location to ambient SFX URLs.
 * In a real app, these would point to R2 or public folder audio files.
 * For this implementation, we simulate it via an AudioContext and visually log it.
 */
const AMBIENT_TRACKS: Record<string, { url: string; key: string }> = {
  candlelight: { url: '/sfx/fire-crackle.mp3', key: 'sfx.candlelight' },
  moonlight: { url: '/sfx/crickets-night.mp3', key: 'sfx.moonlight' },
  dawn: { url: '/sfx/morning-birds.mp3', key: 'sfx.dawn' },
  daylight: { url: '/sfx/wind-breeze.mp3', key: 'sfx.daylight' },
  dusk: { url: '/sfx/dusk-ambience.mp3', key: 'sfx.dusk' },
  night: { url: '/sfx/deep-night.mp3', key: 'sfx.night' },
};

export function useAmbientSfx(moodPreset: string) {
  const t = useTranslations('chat');
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Clean up previous track
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const track = AMBIENT_TRACKS[moodPreset];
    if (!track) {
      setCurrentLabel(null);
      return;
    }

    setCurrentLabel(t(track.key as any));

    // In a real scenario, we'd initialize the audio element here:
    // const audio = new Audio(track.url);
    // audio.loop = true;
    // audio.volume = 0.2;
    // audio.play().catch(() => { /* user hasn't interacted yet */ });
    // audioRef.current = audio;

    const audio = audioRef.current;
    return () => {
      if (audio) {
        audio.pause();
      }
    };
  }, [moodPreset, t]);

  return { currentLabel };
}
