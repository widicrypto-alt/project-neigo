'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * D6: Typewriter effect — one-shot, first mount only.
 *
 * Returns the currently visible substring of `text`.
 * When `prefers-reduced-motion` is set the full text is returned immediately.
 *
 * @param text   — The string to reveal character by character.
 * @param speed  — Milliseconds between each character (default 28ms).
 * @param delay  — Initial delay before typing starts (default 200ms).
 */
export function useTypewriter(
  text: string,
  speed = 28,
  delay = 200,
): string {
  const reduce = useReducedMotion();
  const [displayed, setDisplayed] = useState(reduce ? text : '');
  const frameRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reduce) {
      setDisplayed(text);
      return;
    }
    setDisplayed('');
    let i = 0;

    const start = setTimeout(() => {
      const tick = () => {
        i += 1;
        setDisplayed(text.slice(0, i));
        if (i < text.length) {
          frameRef.current = setTimeout(tick, speed);
        }
      };
      frameRef.current = setTimeout(tick, 0);
    }, delay);

    return () => {
      clearTimeout(start);
      if (frameRef.current) clearTimeout(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return displayed;
}
