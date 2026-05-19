'use client';

import React, { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import CharacterStage from '@/components/character/CharacterStage';
import { ChatPanel } from '@/components/chat-vn/ChatPanel';
import { InputBar } from '@/components/chat-vn/InputBar';
import { useAmbientSfx } from '@/components/chat-vn/use-ambient-sfx';
import { McProfileGate } from './McProfileGate';
import { CastRoster } from './CastRoster';
import { ToastStack } from './ToastStack';
import { useChatSessionState } from '../_context/ChatSessionContext';

export function ChatLayout() {
  const t = useTranslations('chat');
  const queryClient = useQueryClient();
  const state = useChatSessionState();

  const {
    sessionId,
    session,
    showMcGate,
    activeSpeakerId,
    primaryCharacterId,
    characterName,
    spritesMap,
    detectedEmotion,
    activeMood,
    castIds,
    bubbles,
    streamKey,
    sending,
    isOffline,
    cyoaChoices,
    actionBusy,
    toasts,
    setActiveSpeakerId,
    setCyoaChoices,
    send,
    handleContinue,
    handleUndo,
    handleRegenerate,
    handleBranch
  } = state;

  const { currentLabel: sfxLabel } = useAmbientSfx(activeMood);

  const onSubmit = useCallback((data: { mode: string; text: string }) => {
    void send({ mode: data.mode, overrideText: data.text });
  }, [send]);

  const onContinue = () => void handleContinue();
  const onRetry = () => void handleRegenerate();
  const onUndo = () => void handleUndo();
  const onBranch = () => void handleBranch();
  const onClear = () => {};

  return (
    <div className="bg-background text-on-background h-screen w-screen overflow-hidden flex flex-col relative font-serif dark" style={{ background: '#09090b', color: '#efe6d4' }}>
      {showMcGate && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100 }}>
          <McProfileGate 
            sessionId={sessionId} 
            storyHasMc={true} 
            onComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
            }} 
          />
        </div>
      )}

      {/* Left: Character stage (Absolute 35%) */}
      <div className="absolute bottom-0 left-0 h-full w-full lg:w-[35%] z-10 flex items-end justify-center fixed pointer-events-none" style={{ minWidth: 360, maxWidth: 560 }}>
        <div className="relative w-full h-full pointer-events-auto">
          <CharacterStage
            characterName={spritesMap.get(activeSpeakerId || primaryCharacterId || '')?.name ?? characterName}
            spriteManifest={spritesMap.get(activeSpeakerId || primaryCharacterId || '')?.spriteManifest || {}}
            currentEmotion={detectedEmotion}
            moodPreset={activeMood as any}
            backgroundUrl={session.data?.session?.sceneCard?.background ?? undefined}
          />
        </div>
      </div>

      {/* Center: Chat */}
      <main className="flex-1 relative z-20 flex flex-col overflow-y-auto pt-20 px-4 lg:px-8 max-w-7xl mx-auto w-full scroll-smooth pb-[180px]">
        {castIds.length > 1 && (
          <div style={{ position: 'absolute', top: 76, left: 0, right: 0, zIndex: 11 }}>
            <CastRoster
              members={castIds.map((id) => {
                const sprite = spritesMap.get(id);
                return {
                  id,
                  name: sprite?.name ?? id,
                  avatarUrl: sprite?.avatarUrl ?? null,
                  isSpeaking: activeSpeakerId === id,
                };
              })}
              activeSpeakerId={activeSpeakerId}
              onSelectMember={(id) => setActiveSpeakerId(id)}
            />
          </div>
        )}

        <div className="flex flex-col gap-4 w-full lg:w-[65%] lg:ml-auto lg:pl-8 mb-6 mt-auto">
          <ChatPanel
            story={bubbles}
            streamKey={streamKey}
            title={session.data?.session?.title ?? characterName}
            sending={sending}
          />
        </div>
        
        {isOffline && (
          <div style={{
            position: 'absolute', bottom: 120, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(200, 40, 40, 0.85)', backdropFilter: 'blur(12px)',
            color: '#fff', padding: '12px 24px', borderRadius: '24px',
            fontSize: '14px', zIndex: 50, display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,100,100,0.4)'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
            <b>{t('status.offline')}</b> – {t('status.reconnecting')}
          </div>
        )}

        {cyoaChoices.length > 0 && !isOffline ? (
          <div style={{
            position: 'absolute', bottom: 24, left: 0, right: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
            zIndex: 40, padding: '24px',
            background: 'linear-gradient(to top, rgba(6, 4, 10, 0.95) 0%, rgba(6, 4, 10, 0.8) 60%, transparent 100%)'
          }}>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '4px', letterSpacing: '0.05em' }}>{t('cyoa.groupLabel')}:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', maxWidth: '600px' }}>
              {cyoaChoices.map((choice, i) => (
                <button
                  key={i}
                  onClick={() => {
                    void send({ overrideText: choice.sendText });
                    setCyoaChoices([]);
                  }}
                  style={{
                    background: 'rgba(30, 20, 15, 0.7)', border: '1px solid rgba(232, 162, 90, 0.3)',
                    color: '#f4b870', padding: '12px 20px', borderRadius: '12px', cursor: 'pointer',
                    backdropFilter: 'blur(8px)', fontSize: '15px', transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(50, 30, 20, 0.9)'; e.currentTarget.style.borderColor = '#f4b870'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(30, 20, 15, 0.7)'; e.currentTarget.style.borderColor = 'rgba(232, 162, 90, 0.3)'; }}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCyoaChoices([])}
              style={{
                marginTop: '12px', background: 'transparent', border: 'none',
                color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              {t('cyoa.custom')}
            </button>
          </div>
        ) : (
          <InputBar
            onSubmit={onSubmit}
            onContinue={onContinue}
            onRetry={onRetry}
            onUndo={onUndo}
            onBranch={onBranch}
            onClear={onClear}
            busy={actionBusy !== null || sending || isOffline}
            characterName={characterName}
          />
        )}

        {sfxLabel && (
          <div style={{
            position: 'absolute', top: 16, right: 16, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
            padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.5)', fontSize: '11px', letterSpacing: '0.05em'
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
            {sfxLabel}
          </div>
        )}

      </main>

      <ToastStack toasts={toasts} spritePanelCollapsed={false} />
    </div>
  );
}
