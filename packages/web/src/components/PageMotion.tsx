'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * D6: PageMotion — cross-fade wrapper for page-level content.
 *
 * Wrap the main content of any page with <PageMotion> for a 200ms fade-in.
 * Compatible with Next.js App Router (client component, no layout interference).
 * `prefers-reduced-motion` guard skips the animation entirely.
 *
 * Usage:
 *   export default function MyPage() {
 *     return <PageMotion><main>…</main></PageMotion>;
 *   }
 */
export function PageMotion({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
