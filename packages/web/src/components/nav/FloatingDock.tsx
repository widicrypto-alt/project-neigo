'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Compass,
  MessageCircle,
  PenSquare,
  Search,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/cn';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

interface FloatingDockProps {
  items?: NavItem[];
  onOpenCommandPalette?: () => void;
}

const DEFAULT_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: Compass },
  { href: '/discover', label: 'Discover', icon: BookOpen },
  { href: '/chat', label: 'Threads', icon: MessageCircle },
  { href: '/studio/stories', label: 'Studio', icon: PenSquare },
  { href: '/settings', label: 'Persona', icon: Settings },
];

export function FloatingDock({ items, onOpenCommandPalette }: FloatingDockProps) {
  const pathname = usePathname();
  const [isZenMode, setIsZenMode] = useState(false);

  // Auto Zen Mode on active Chat Session Pages (but not the index)
  useEffect(() => {
    if (pathname?.startsWith('/chat/') && pathname !== '/chat') {
      setIsZenMode(true);
    } else {
      setIsZenMode(false);
    }
  }, [pathname]);

  const navItems = items || DEFAULT_ITEMS;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed bottom-6 left-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl shadow-2xl"
        initial={{ y: 100, x: '-50%', opacity: 0 }}
        animate={{ 
          y: isZenMode ? 100 : 0, 
          x: '-50%', 
          opacity: isZenMode ? 0 : 1,
          scale: isZenMode ? 0.9 : 1
        }}
        exit={{ y: 100, x: '-50%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        whileHover={isZenMode ? { y: 0, opacity: 1, scale: 1 } : undefined} // Reveal on hover if in Zen mode
      >
        <button
          onClick={onOpenCommandPalette}
          className="relative flex items-center justify-center w-12 h-12 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors mr-2"
          aria-label="Search or Command Palette"
        >
          <Search className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px] font-medium text-white ring-2 ring-black">
            ⌘
          </span>
        </button>

        <div className="w-px h-8 bg-white/10 mr-2" />

        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                className={cn(
                  "relative flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-colors group",
                  isActive ? "text-primary" : "text-white/60 hover:text-white hover:bg-white/5"
                )}
                whileHover={{ y: -4, scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title={item.label}
              >
                <Icon className={cn("w-6 h-6", isActive && "drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]")} />
                
                {/* Active Indicator */}
                {isActive && (
                  <motion.div
                    layoutId="dock-active"
                    className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}

                {/* Badge */}
                {item.badge !== undefined && item.badge > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-1 right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white shadow-sm ring-2 ring-black"
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </motion.div>
                )}
              </motion.div>
            </Link>
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
}
