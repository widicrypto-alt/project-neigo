'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Clock, Pin, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface QuickNavSession {
  id: string;
  characterName: string;
  lastMessagePreview: string;
  isPinned: boolean;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Fetch quick-nav sessions
  const { data, isLoading } = useQuery<{ sessions: QuickNavSession[] }>({
    queryKey: ['quick-nav'],
    queryFn: () => api.get('/api/sessions/quick-nav'),
    enabled: open,
    staleTime: 30_000,
  });

  const sessions = data?.sessions || [];
  
  const filteredSessions = sessions.filter(s => 
    s.characterName.toLowerCase().includes(query.toLowerCase()) || 
    (s.lastMessagePreview && s.lastMessagePreview.toLowerCase().includes(query.toLowerCase()))
  );

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      document.body.style.overflow = 'hidden';
    } else {
      setQuery('');
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        open ? onClose() : undefined; // Toggling is handled by parent usually, but we catch it here too
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleSelect = (id: string) => {
    if (navigator.vibrate) navigator.vibrate(50);
    router.push(`/chat/${id}`);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-110 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="fixed inset-0 z-111 flex items-start justify-center pt-[15vh] px-4 pointer-events-none">
            <motion.div
              className="w-full max-w-xl overflow-hidden rounded-2xl bg-neutral-900 border border-white/10 shadow-2xl pointer-events-auto flex flex-col max-h-[70vh]"
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              {/* Search Header */}
              <div className="flex items-center border-b border-white/10 px-4 py-3">
                <Search className="h-5 w-5 text-white/40 mr-3" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Jump to character, session, or feature..."
                  className="flex-1 bg-transparent text-white placeholder:text-white/40 focus:outline-none"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button 
                  onClick={onClose}
                  className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Results List */}
              <div className="flex-1 overflow-y-auto p-2">
                {isLoading ? (
                  <div className="p-4 text-center text-white/40 text-sm">Loading sessions...</div>
                ) : filteredSessions.length > 0 ? (
                  <div className="grid gap-1">
                    <div className="px-3 py-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
                      Recent Threads
                    </div>
                    {filteredSessions.map((session) => (
                      <button
                        key={session.id}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/10 transition-colors focus:bg-white/10 focus:outline-none"
                        onClick={() => handleSelect(session.id)}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5">
                          {session.isPinned ? <Pin className="h-4 w-4 text-primary" /> : <Clock className="h-4 w-4 text-white/40" />}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <div className="truncate font-medium text-white">
                            {session.characterName}
                          </div>
                          <div className="truncate text-sm text-white/50">
                            {session.lastMessagePreview || "No messages yet"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-white/40">
                    No results found for &quot;{query}&quot;
                  </div>
                )}
              </div>
              
              {/* Footer Hints */}
              <div className="border-t border-white/10 bg-white/5 px-4 py-2 flex items-center justify-between text-xs text-white/40">
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans">↑</kbd>
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans">↓</kbd>
                  <span>to navigate</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans">Enter</kbd>
                  <span>to select</span>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
