'use client';

import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * <IconButton /> — icon-only button with WCAG 2.5.5 min 44×44 tap zone.
 *
 * Always requires `aria-label`.
 */

export type IconButtonSize = 'sm' | 'md' | 'lg';
export type IconButtonVariant = 'ghost' | 'subtle' | 'solid';

const SIZES: Record<IconButtonSize, string> = {
  // All hit a min 44×44 tap area even when the visual is smaller — we pad.
  sm: 'h-11 w-11 [&>*]:w-4 [&>*]:h-4',
  md: 'h-11 w-11 [&>*]:w-5 [&>*]:h-5',
  lg: 'h-12 w-12 [&>*]:w-6 [&>*]:h-6',
};

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: 'text-ink-300 hover:text-ink-50 hover:bg-white/[0.06]',
  subtle: 'text-ink-100 bg-white/[0.04] hover:bg-white/[0.08]',
  solid: 'text-white bg-accent-500 hover:bg-accent-400',
};

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  'aria-label': string;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  children: React.ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { size = 'md', variant = 'ghost', className, type = 'button', children, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center rounded-xl transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950',
          'disabled:opacity-40 disabled:pointer-events-none',
          SIZES[size],
          VARIANTS[variant],
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
