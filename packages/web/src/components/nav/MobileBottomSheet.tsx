'use client';

import { ReactNode, useEffect, useState } from 'react';
import { AnimatePresence, motion, PanInfo } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { NavItem } from './FloatingDock';

interface MobileBottomSheetProps {
  open: boolean;
  onClose: () => void;
  items?: NavItem[];
  children?: ReactNode;
}

export function MobileBottomSheet({
  open,
  onClose,
  items = [],
  children
}: MobileBottomSheetProps) {
  const pathname = usePathname();
  
  // Close sheet on route change
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Handle swipe down to close
  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-100 bg-black/60 backdrop-blur-sm md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-101 flex flex-col rounded-t-4xl bg-neutral-900 border-t border-white/10 p-6 md:hidden max-h-[85vh]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
          >
            {/* Drag Handle */}
            <div className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-white/20" />

            <div className="flex-1 overflow-y-auto">
              {children ? children : (
                <div className="grid gap-2">
                  {items.map((item) => {
                    const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                    const Icon = item.icon;
                    
                    return (
                      <Link 
                        key={item.href} 
                        href={item.href}
                        className={cn(
                          "flex items-center gap-4 rounded-2xl p-4 transition-colors",
                          isActive ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                        )}
                        onClick={() => {
                          if (navigator.vibrate) navigator.vibrate(50); // Haptic feedback
                        }}
                      >
                        <Icon className={cn("w-6 h-6", isActive && "text-primary")} />
                        <span className="flex-1 text-lg font-medium">{item.label}</span>
                        
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
