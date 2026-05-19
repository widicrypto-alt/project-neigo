'use client';

import * as React from 'react';
import { AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRoleplaySession } from '../_context/RoleplaySessionContext';
import { MessageBubble, TypingIndicator } from './MessageBubble';
import { RoleplayInputBar } from './RoleplayInputBar';

// ── EMOTION → CSS filter + transform (same as chat-fe KIRANA_FILTERS pattern) ─
const EMOTION_FILTER: Record<string, string> = {
  neutral:      'contrast-100 brightness-100 saturate-100',
  happy:        'contrast-105 brightness-108 saturate-115',
  smug:         'contrast-105 brightness-105 saturate-110',
  sad:          'contrast-90 brightness-75 saturate-50 grayscale-[0.3]',
  angry:        'contrast-125 brightness-90 saturate-50',
  embarrassed:  'contrast-100 brightness-105 saturate-130',
  surprised:    'contrast-110 brightness-105 saturate-100',
  curious:      'contrast-100 brightness-100 saturate-110',
  scared:       'contrast-115 brightness-80 saturate-60',
  tender:       'contrast-95 brightness-105 saturate-120',
  conflicted:   'contrast-110 brightness-90 saturate-80',
  shy:          'contrast-100 brightness-100 saturate-115',
  thinking:     'contrast-95 brightness-90 saturate-75',
  dramatic:     'contrast-125 brightness-90 saturate-50',
};

const EMOTION_TRANSFORM: Record<string, string> = {
  neutral:      'scale-100 rotate-0 translate-y-0',
  happy:        'scale-[1.01] rotate-0 -translate-y-1',
  smug:         'scale-[1.02] rotate-1 -translate-y-2',
  sad:          'scale-[0.96] rotate-0 translate-y-4',
  angry:        'scale-[1.03] -rotate-1 -translate-y-3',
  embarrassed:  'scale-[0.99] rotate-0 translate-y-1',
  surprised:    'scale-[1.03] rotate-0 -translate-y-3',
  curious:      'scale-[0.99] rotate-1 translate-y-1',
  scared:       'scale-[0.97] rotate-0 translate-y-3',
  tender:       'scale-[1.01] rotate-0 -translate-y-1',
  conflicted:   'scale-[0.99] -rotate-1 translate-y-1',
  shy:          'scale-[0.98] rotate-0 translate-y-2',
  thinking:     'scale-[0.98] rotate-2 translate-y-2',
  dramatic:     'scale-[1.05] -rotate-2 -translate-y-4',
};

// ── Layout ─────────────────────────────────────────────────────────────────────

export function RoleplayLayout() {
  const {
    sessionId,
    characterName,
    spriteData,
    messages,
    isTyping,
    currentEmotion,
    isOffline,
    toasts,
    send,
    handleContinue,
    handleUndo,
    handleRegenerate,
  } = useRoleplaySession();

  const mainRef = React.useRef<HTMLDivElement>(null);
  const isAtBottomRef = React.useRef(true);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => mainRef.current,
    estimateSize: () => 100,
    overscan: 3,
  });

  // Track whether user is near the bottom
  React.useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => {
      isAtBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-scroll on new messages or typing
  React.useEffect(() => {
    const el = mainRef.current;
    if (!el || !isAtBottomRef.current) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, [messages, isTyping]);

  const emotion = currentEmotion in EMOTION_FILTER ? currentEmotion : 'neutral';
  const filterClass = EMOTION_FILTER[emotion] ?? EMOTION_FILTER.neutral!;
  const transformClass = EMOTION_TRANSFORM[emotion] ?? EMOTION_TRANSFORM.neutral!;

  return (
    <div style={{
      height: '100dvh',
      width: '100vw',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      background: '#131313',
      color: '#e5e2e1',
      position: 'relative',
    }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 20px',
        background: 'rgba(19,19,19,0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <Link href="/chat" style={{ color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontSize: '13px' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
          <ArrowLeft size={16} />
          Back
        </Link>
        <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)' }} />
        <span style={{
          fontFamily: '"Be Vietnam Pro", sans-serif',
          fontSize: '15px',
          fontWeight: 600,
          color: 'rgba(255,255,255,0.85)',
          letterSpacing: '0.01em',
        }}>
          {characterName}
        </span>
        {isOffline && (
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'rgba(255,100,100,0.8)', fontStyle: 'italic' }}>
            Offline
          </span>
        )}
      </header>

      {/* ── Character Sprite (left, absolute, 35%) ──────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0,
        width: 'min(35%, 500px)', height: '100%',
        zIndex: 10, pointerEvents: 'none',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}>
        {(spriteData?.spriteManifest || spriteData?.avatarUrl) && (() => {
          const spriteUrl = spriteData.spriteManifest
            ? (spriteData.spriteManifest[currentEmotion] ?? spriteData.spriteManifest['neutral'] ?? Object.values(spriteData.spriteManifest)[0] ?? spriteData.avatarUrl)
            : spriteData.avatarUrl;
          if (!spriteUrl) return null;
          return (
            <div
              className={`relative w-full h-[90%] bg-contain bg-bottom bg-no-repeat transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${filterClass} ${transformClass}`}
              style={{ backgroundImage: `url('${spriteUrl}')`, transformOrigin: 'bottom center' }}
            >
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #131313 0%, transparent 30%)' }} />
            </div>
          );
        })()}
      </div>

      {/* ── Message Feed (right 65%) ──────────────────────────────── */}
      <main
        ref={mainRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingTop: 72,
          paddingBottom: 140,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 lg:px-8 w-full">
          <div className="w-full lg:w-[65%] lg:ml-auto lg:pl-8">
            {/* Virtual message list */}
            <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualizer.getVirtualItems()[0]?.start ?? 0}px)`,
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{ paddingBottom: '12px' }}
                  >
                    <MessageBubble msg={messages[virtualRow.index]!} />
                  </div>
                ))}
              </div>
            </div>

            <AnimatePresence>
              {isTyping && <TypingIndicator key="typing" name={characterName} />}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* ── Input Bar ────────────────────────────────────────────── */}
      <RoleplayInputBar
        onSubmit={send}
        onContinue={handleContinue}
        onRetry={handleRegenerate}
        onUndo={handleUndo}
        busy={isTyping || isOffline}
        characterName={characterName}
      />

      {/* ── Toast stack ──────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 60,
        alignItems: 'center', pointerEvents: 'none',
      }}>
        <AnimatePresence>
          {toasts.map(t => (
            <div key={t.id} style={{
              background: t.tone === 'error' ? 'rgba(180,30,30,0.9)' : 'rgba(30,30,30,0.9)',
              backdropFilter: 'blur(12px)',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '20px',
              fontSize: '13px',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              {t.message}
            </div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
