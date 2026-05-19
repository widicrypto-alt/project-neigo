'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { BookOpen, Compass, MessageCircle, PenSquare, Settings } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTranslations } from 'next-intl';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

export function MobileBottomTabBar() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const prefersReducedMotion = useReducedMotion();

  const ITEMS: NavItem[] = [
    { href: '/', label: t('home'), icon: Compass },
    { href: '/discover', label: t('discover'), icon: BookOpen },
    { href: '/chat', label: t('roleplay'), icon: MessageCircle },
    { href: '/studio/stories', label: t('studio'), icon: PenSquare },
    { href: '/settings', label: t('settings'), icon: Settings },
  ];

  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-evenly rounded-t-2xl border border-white/10 border-b-0 bg-black/85 px-2 py-4 backdrop-blur-md shadow-2xl shadow-black/40 md:hidden"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      initial={prefersReducedMotion ? false : { y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.15 }}
    >
      {ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link key={item.href} href={item.href} className="relative flex-1 flex justify-center">
            <motion.div
              className={cn(
                'flex flex-col items-center justify-center w-14 h-14 rounded-full transition-colors',
                isActive ? 'text-accent-400' : 'text-white/50 hover:text-white/80',
              )}
              whileTap={{ scale: 0.88 }}
            >
              <Icon className="w-5 h-5" />

              {isActive && (
                <motion.div
                  layoutId="mobile-nav-active"
                  className="absolute -bottom-0.5 w-1.5 h-1.5 rounded-full bg-accent-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}

              {item.badge !== undefined && item.badge > 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-1 right-1 flex h-4 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold text-white ring-2 ring-black/60"
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </motion.div>
              )}
            </motion.div>
          </Link>
        );
      })}
    </motion.div>
  );
}
