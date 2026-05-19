'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { postSse } from '@/lib/sse';
import { chatStreamingBuffer } from '@/lib/streaming-buffer';
import type { SseEvent } from '@neigo/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoleplayMessage {
  id: string;
  role: 'character' | 'user' | 'system';
  /** Dialogue text. Character: quoted string. User: their input. System: scene note. */
  text: string;
  /** Optional inline action/narration rendered below the dialogue in italic */
  narration?: string;
  emotion?: string;
  /** True while streaming in */
  pending?: boolean;
}

export interface RoleplayToast {
  id: string;
  tone: 'info' | 'success' | 'error';
  message: string;
}

interface SpriteData {
  avatarUrl: string | null;
  spriteSheetUrl: string | null;
  spriteManifest: Record<string, string> | null;
  name: string | null;
}

interface RoleplaySessionContextValue {
  sessionId: string;
  characterName: string;
  characterId: string | null;
  spriteData: SpriteData | null;
  messages: RoleplayMessage[];
  isTyping: boolean;
  currentEmotion: string;
  isOffline: boolean;
  toasts: RoleplayToast[];
  actionBusy: null | 'undo' | 'regen' | 'branch';
  send: (text: string) => void;
  handleContinue: () => void;
  handleUndo: () => Promise<void>;
  handleRegenerate: () => Promise<void>;
  pushToast: (t: Omit<RoleplayToast, 'id'>) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const RoleplaySessionContext = createContext<RoleplaySessionContextValue | null>(null);

export const useRoleplaySession = () => {
  const ctx = useContext(RoleplaySessionContext);
  if (!ctx) throw new Error('useRoleplaySession must be used within RoleplaySessionProvider');
  return ctx;
};

// ── Provider ──────────────────────────────────────────────────────────────────

export const RoleplaySessionProvider = ({
  sessionId,
  children,
}: {
  sessionId: string;
  children: ReactNode;
}) => {
  const queryClient = useQueryClient();

  // ── State
  const [messages, setMessages] = useState<RoleplayMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState('neutral');
  const [isOffline, setIsOffline] = useState(false);
  const [toasts, setToasts] = useState<RoleplayToast[]>([]);
  const [actionBusy, setActionBusy] = useState<null | 'undo' | 'regen' | 'branch'>(null);
  const [opened, setOpened] = useState(false);

  // ── Offline detection
  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setIsOffline(!navigator.onLine);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── Remote data
  const session = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.get<{ session: any }>(`/api/sessions/${sessionId}`),
  });

  const sessionState = useQuery({
    queryKey: ['session-state', sessionId],
    queryFn: () => api.get<any>(`/api/sessions/${sessionId}/state`),
    staleTime: 30_000,
  });

  const history = useQuery({
    queryKey: ['messages', sessionId],
    queryFn: () => api.get<{ messages: any[] }>(`/api/sessions/${sessionId}/messages`),
  });

  const characterId = session.data?.session?.characterId ?? null;
  const characterName = sessionState.data?.characterName ?? session.data?.session?.title ?? 'Character';

  // ── Sprite data
  const [spriteData, setSpriteData] = useState<SpriteData | null>(null);
  useEffect(() => {
    if (!characterId) return;
    let cancelled = false;
    Promise.allSettled([
      api.get<{ character: any }>(`/api/characters/${characterId}`),
      api.get<{ manifest: { expressions: Record<string, string> } }>(`/api/characters/${characterId}/sprite-manifest`),
    ]).then(([charRes, manifestRes]) => {
      if (cancelled) return;
      setSpriteData({
        name: charRes.status === 'fulfilled' ? charRes.value.character.name : null,
        avatarUrl: charRes.status === 'fulfilled' ? charRes.value.character.avatarUrl : null,
        spriteSheetUrl: charRes.status === 'fulfilled' ? charRes.value.character.spriteSheetUrl : null,
        spriteManifest: manifestRes.status === 'fulfilled' ? (manifestRes.value.manifest.expressions ?? null) : null,
      });
    });
    return () => { cancelled = true; };
  }, [characterId]);

  // ── Load history into messages
  useEffect(() => {
    if (!history.data) return;
    setMessages(
      history.data.messages
        .filter((m: any) => m.speakerType !== 'SYSTEM')
        .map((m: any) => ({
          id: m.id,
          role: m.speakerType === 'USER' ? 'user' : 'character',
          text: m.content,
        }))
    );
  }, [history.data]);

  // ── Opening turn (first message auto-send)
  useEffect(() => {
    if (opened) return;
    if (!session.data || !history.data) return;
    if (session.data.session.turnCount > 0 || history.data.messages.length > 0) {
      setOpened(true);
      return;
    }
    setOpened(true);
    setIsTyping(true);
    const buf: Record<string, string> = {};
    postSse(`/api/chat/${sessionId}/open`, {}, {
      onEvent: (evt: SseEvent) => {
        if (evt.type === 'character') {
          if (!buf[evt.messageId]) {
            buf[evt.messageId] = '';
            setMessages(prev => [...prev, { id: evt.messageId, role: 'character', text: '', pending: true }]);
          }
          chatStreamingBuffer.append(evt.messageId, evt.chunk);
          setMessages(prev => prev.map(m =>
            m.id === evt.messageId ? { ...m, text: chatStreamingBuffer.getSnapshot(evt.messageId) } : m
          ));
        }
        if (evt.type === 'emotion') setCurrentEmotion(evt.emotion);
        if (evt.type === 'done') {
          setMessages(prev => prev.map(m => m.pending ? { ...m, pending: false } : m));
          setIsTyping(false);
          queryClient.invalidateQueries({ queryKey: ['session-state', sessionId] });
        }
      },
      onError: () => setIsTyping(false),
    });
  }, [session.data, history.data, opened, sessionId, queryClient]);

  // ── Heartbeat
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const ping = () => {
      if (cancelled || typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') return;
      void api.post(`/api/sessions/${sessionId}/heartbeat`, {}).catch(() => {});
    };
    ping();
    const interval = setInterval(ping, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; clearInterval(interval); document.removeEventListener('visibilitychange', onVis); };
  }, [sessionId]);

  // ── Toast
  const pushToast = useCallback((t: Omit<RoleplayToast, 'id'>) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(ts => [...ts, { ...t, id }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 4500);
  }, []);

  // ── Send
  const send = useCallback((rawText: string) => {
    const text = rawText.trim();
    if (!text || isTyping) return;

    // Optimistic user bubble
    const userId = `u-${Date.now()}`;
    setMessages(prev => [...prev, { id: userId, role: 'user', text }]);
    setIsTyping(true);

    const buf: Record<string, string> = {};
    postSse(`/api/chat/${sessionId}/turn`, { content: text }, {
      onEvent: (evt: SseEvent) => {
        if (evt.type === 'character') {
          if (!buf[evt.messageId]) {
            buf[evt.messageId] = '';
            setMessages(prev => [...prev, { id: evt.messageId, role: 'character', text: '', pending: true }]);
          }
          chatStreamingBuffer.append(evt.messageId, evt.chunk);
          setMessages(prev => prev.map(m =>
            m.id === evt.messageId ? { ...m, text: chatStreamingBuffer.getSnapshot(evt.messageId) } : m
          ));
        }
        if (evt.type === 'emotion') setCurrentEmotion(evt.emotion);
        if (evt.type === 'done') {
          setMessages(prev => prev.map(m => m.pending ? { ...m, pending: false } : m));
          Object.keys(buf).forEach(id => chatStreamingBuffer.clear(id));
          setIsTyping(false);
          queryClient.invalidateQueries({ queryKey: ['session-state', sessionId] });
        }
        if (evt.type === 'error') {
          setIsTyping(false);
          pushToast({ tone: 'error', message: evt.message ?? 'Something went wrong' });
        }
      },
      onError: () => {
        setIsTyping(false);
        pushToast({ tone: 'error', message: 'Connection lost. Try again.' });
      },
    });
  }, [isTyping, sessionId, queryClient, pushToast]);

  // ── Continue
  const handleContinue = useCallback(() => {
    if (isTyping) return;
    setIsTyping(true);
    postSse(`/api/chat/${sessionId}/continue`, {}, {
      onEvent: (evt: SseEvent) => {
        if (evt.type === 'character') {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'character') {
              return prev.map((m, i) => i === prev.length - 1 ? { ...m, text: m.text + '\n\n' + evt.chunk } : m);
            }
            return [...prev, { id: evt.messageId, role: 'character', text: evt.chunk }];
          });
        }
        if (evt.type === 'emotion') setCurrentEmotion(evt.emotion);
        if (evt.type === 'done') {
          setIsTyping(false);
          queryClient.invalidateQueries({ queryKey: ['session-state', sessionId] });
        }
      },
      onError: () => setIsTyping(false),
    });
  }, [isTyping, sessionId, queryClient]);

  // ── Undo
  const handleUndo = useCallback(async () => {
    if (actionBusy) return;
    setActionBusy('undo');
    try {
      await api.post(`/api/sessions/${sessionId}/undo`, {});
      // Remove last assistant + user pair
      setMessages(prev => {
        const lastCharIdx = [...prev].reverse().findIndex(m => m.role === 'character');
        if (lastCharIdx === -1) return prev;
        const trimIdx = prev.length - 1 - lastCharIdx;
        const lastUserIdx = [...prev.slice(0, trimIdx)].reverse().findIndex(m => m.role === 'user');
        if (lastUserIdx === -1) return prev.slice(0, trimIdx);
        return prev.slice(0, trimIdx - 1 - lastUserIdx);
      });
      queryClient.invalidateQueries({ queryKey: ['messages', sessionId] });
    } catch {
      pushToast({ tone: 'error', message: 'Undo failed.' });
    } finally {
      setActionBusy(null);
    }
  }, [actionBusy, sessionId, queryClient, pushToast]);

  // ── Regenerate
  const handleRegenerate = useCallback(async () => {
    if (actionBusy || isTyping) return;
    setActionBusy('regen');
    // Remove last character message
    setMessages(prev => {
      const idx = [...prev].reverse().findIndex(m => m.role === 'character');
      if (idx === -1) return prev;
      return prev.slice(0, prev.length - 1 - idx);
    });
    setActionBusy(null);
    setIsTyping(true);
    const buf: Record<string, string> = {};
    postSse(`/api/chat/${sessionId}/regenerate`, {}, {
      onEvent: (evt: SseEvent) => {
        if (evt.type === 'character') {
          if (!buf[evt.messageId]) {
            buf[evt.messageId] = '';
            setMessages(prev => [...prev, { id: evt.messageId, role: 'character', text: '', pending: true }]);
          }
          chatStreamingBuffer.append(evt.messageId, evt.chunk);
          setMessages(prev => prev.map(m =>
            m.id === evt.messageId ? { ...m, text: chatStreamingBuffer.getSnapshot(evt.messageId) } : m
          ));
        }
        if (evt.type === 'emotion') setCurrentEmotion(evt.emotion);
        if (evt.type === 'done') {
          setMessages(prev => prev.map(m => m.pending ? { ...m, pending: false } : m));
          setIsTyping(false);
        }
      },
      onError: () => setIsTyping(false),
    });
  }, [actionBusy, isTyping, sessionId]);

  return (
    <RoleplaySessionContext.Provider value={{
      sessionId,
      characterName,
      characterId,
      spriteData,
      messages,
      isTyping,
      currentEmotion,
      isOffline,
      toasts,
      actionBusy,
      send,
      handleContinue,
      handleUndo,
      handleRegenerate,
      pushToast,
    }}>
      {children}
    </RoleplaySessionContext.Provider>
  );
};
