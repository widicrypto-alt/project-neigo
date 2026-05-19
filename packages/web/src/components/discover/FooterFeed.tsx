'use client';
import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Feather, Sparkles, Moon } from 'lucide-react';

/**
 * Thin "ambient feed" at the foot of the home page to suggest the library
 * is alive even when user stats are quiet. Intentionally prose-style, never
 * flexes viral numbers.
 */
const LINES: Array<{ icon: React.ReactNode; text: string }> = [
  { icon: <Feather size={13} className="text-iris-300" />, text: 'Semalam Rei menulis satu halaman di diary-nya.' },
  { icon: <Sparkles size={13} className="text-violet-hot" />, text: 'Dua cerita baru diterbitkan komunitas.' },
  { icon: <Moon size={13} className="text-violet-cool" />, text: 'Lysandra menunggu di kafe yang sama seperti kemarin.' },
];

export function FooterFeed() {
  const reduce = useReducedMotion();
  // Rotate the first line per mount so different visits feel fresh.
  const rotated = useMemo(() => {
    const shift = Math.floor(Math.random() * LINES.length);
    return [...LINES.slice(shift), ...LINES.slice(0, shift)];
  }, []);

  return (
    <motion.footer
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="mt-8 flex flex-col gap-1 border-t border-night-line/60 pt-5 text-sm text-ink-400"
    >
      {rotated.map((line, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-0.5">{line.icon}</span>
          <span>{line.text}</span>
        </div>
      ))}
    </motion.footer>
  );
}
