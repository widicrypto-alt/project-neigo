'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { postSse } from '@/lib/sse';
import { chatStreamingBuffer } from '@/lib/streaming-buffer';
import { parseSlashCommand, SLASH_COMMANDS, SLASH_USAGE } from '@/lib/slash-commands';
import type { SseEvent, ChatSession } from '@neigo/shared';
import type { Bubble, FailedTurn, ChatToast as Toast } from '../_components/types';

interface SpriteData {
  avatarUrl: string | null;
  spriteSheetUrl: string | null;
  spriteManifest: Record<string, string> | null;
  name: string | null;
}

interface ChatSessionContextValue {
  sessionId: string;
  session: any;
  sessionState: any;
  history: any;
  
  isStorySession: boolean;
  hasMcSet: boolean;
  showMcGate: boolean;
  characterName: string;
  activeMood: string;
  
  castIds: string[];
  primaryCharacterId: string | null;
  spritesMap: Map<string, SpriteData>;
  
  bubbles: Bubble[];
  sending: boolean;
  actionBusy: null | 'undo' | 'regen' | 'branch';
  detectedEmotion: any;
  cyoaChoices: Array<{ label: string; sendText: string }>;
  isOffline: boolean;
  toasts: Toast[];
  activeSpeakerId: string | null;
  streamKey: number;

  setActiveSpeakerId: (id: string | null) => void;
  setCyoaChoices: (choices: any[]) => void;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  
  send: (options?: { retry?: boolean; overrideText?: string; mode?: string }) => Promise<void>;
  handleContinue: () => Promise<void>;
  handleUndo: () => Promise<void>;
  handleRegenerate: () => Promise<void>;
  handleBranch: () => Promise<void>;
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);

export const useChatSessionState = () => {
  const ctx = useContext(ChatSessionContext);
  if (!ctx) throw new Error('useChatSessionState must be used within ChatSessionProvider');
  return ctx;
};

export const ChatSessionProvider = ({ sessionId, children }: { sessionId: string; children: ReactNode }) => {
  const t = useTranslations('chat');
  const queryClient = useQueryClient();
  const router = useRouter();

  const [streamKey, setStreamKey] = useState(0);
  const [actionBusy, setActionBusy] = useState<null | 'undo' | 'regen' | 'branch'>(null);
  const [detectedEmotion, setDetectedEmotion] = useState<any>('neutral');
  const [cyoaChoices, setCyoaChoices] = useState<Array<{ label: string; sendText: string }>>([]);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOffline(!navigator.onLine);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const session = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.get<{ session: ChatSession }>(`/api/sessions/${sessionId}`),
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

  const isStorySession = !!(session.data?.session?.metadata as Record<string, unknown> | null)?.storyId;
  const hasMcSet = !!(session.data?.session?.metadata as Record<string, unknown> | null)?.mcType;
  const showMcGate = isStorySession && !hasMcSet && session.data?.session?.turnCount === 0;

  const sceneCardRaw = session.data?.session?.sceneCard as Record<string, unknown> | null | undefined;
  const sessionCharacterId = session.data?.session?.characterId;
  const sceneCardCastSubset = Array.isArray(sceneCardRaw?.castSubset)
    ? (sceneCardRaw!.castSubset as string[])
    : null;
  const primaryCharacterId = sceneCardCastSubset?.[0] ?? sessionCharacterId ?? null;
  const characterId = primaryCharacterId;

  const castIds = sceneCardCastSubset && sceneCardCastSubset.length > 0
    ? sceneCardCastSubset
    : characterId ? [characterId] : [];
  const castIdsKey = castIds.join(',');

  const characterName = sessionState.data?.characterName ?? 'Character';
  const activeMood = sessionState.data?.mood ?? 'candlelight';

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [sending, setSending] = useState(false);
  const [failedTurn, setFailedTurn] = useState<FailedTurn | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [spritesMap, setSpritesMap] = useState<Map<string, SpriteData>>(new Map());

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((ts) => [...ts, { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4500);
  }, []);

  useEffect(() => {
    if (castIds.length === 0) return;
    let cancelled = false;
    Promise.all(
      castIds.map(async (id) => {
        const [charRes, manifestRes] = await Promise.allSettled([
          api.get<{ character: any }>(`/api/characters/${id}`),
          api.get<{ manifest: { expressions: Record<string, string> } }>(`/api/characters/${id}/sprite-manifest`),
        ]);
        return {
          id,
          name: charRes.status === 'fulfilled' ? charRes.value.character.name : null,
          avatarUrl: charRes.status === 'fulfilled' ? charRes.value.character.avatarUrl : null,
          spriteSheetUrl: charRes.status === 'fulfilled' ? charRes.value.character.spriteSheetUrl : null,
          spriteManifest: manifestRes.status === 'fulfilled' ? (manifestRes.value.manifest.expressions ?? null) : null,
        };
      })
    ).then((results) => {
      if (cancelled) return;
      const map = new Map(results.map((r) => [r.id, r]));
      setSpritesMap(map);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castIdsKey]);

  useEffect(() => {
    if (!history.data) return;
    setBubbles(
      history.data.messages.map((m) => ({
        id: m.id,
        kind: m.speakerType === 'USER' ? 'user' : m.speakerType === 'NARRATOR' ? 'narrator' : 'character',
        speakerId: m.speakerId,
        content: m.content,
      }))
    );
  }, [history.data]);

  useEffect(() => {
    if (opened) return;
    if (!session.data || !history.data) return;
    if (session.data.session.turnCount > 0 || history.data.messages.length > 0) {
      setOpened(true);
      return;
    }
    setOpened(true);
    setSending(true);

    const msgBuffers = new Map<string, Bubble>();
    postSse(`/api/chat/${sessionId}/open`, {}, {
      onEvent: (evt: SseEvent) => {
        if (evt.type === 'narrator' || evt.type === 'character') {
          const existing = msgBuffers.get(evt.messageId);
          if (existing) {
            chatStreamingBuffer.append(evt.messageId, evt.chunk);
          } else {
            const nb: Bubble = {
              id: evt.messageId,
              kind: evt.type,
              speakerId: evt.characterId ?? null,
              content: '',
              pending: true,
            };
            msgBuffers.set(evt.messageId, nb);
            chatStreamingBuffer.append(evt.messageId, evt.chunk);
            setBubbles((b) => [...b, nb]);
          }
        }
        if (evt.type === 'done') {
          setBubbles((b) =>
            b.map((x) => {
              if (!msgBuffers.has(x.id)) return x;
              return { ...x, content: chatStreamingBuffer.getSnapshot(x.id), pending: false };
            })
          );
          msgBuffers.forEach((_, id) => chatStreamingBuffer.clear(id));
          setSending(false);
          queryClient.invalidateQueries({ queryKey: ['session-state', sessionId] });
        }
      },
      onError: (err) => {
        setSending(false);
      }
    });
  }, [session.data, history.data, opened, sessionId, queryClient]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const ping = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void api.post(`/api/sessions/${sessionId}/heartbeat`, {}).catch(() => {});
    };
    ping();
    const interval = setInterval(ping, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sessionId]);

  const send = useCallback(async (options?: { retry?: boolean; overrideText?: string; mode?: string }) => {
    const retrying = options?.retry === true;
    const mode = options?.mode ?? 'action';
    const rawText = (retrying ? failedTurn?.content : (options?.overrideText ?? ''))?.trim();
    if (!rawText || sending) return;

    if (!retrying) {
      const cmd = parseSlashCommand(rawText);
      if (cmd.kind === 'help') {
        pushToast({
          tone: 'info',
          message: SLASH_COMMANDS.map((n) => SLASH_USAGE[n]).join('  •  '),
        });
        return;
      }
      if (cmd.kind === 'continue') {
        void handleContinue();
        return;
      }
      if (cmd.kind === 'unknown') {
        pushToast({
          tone: 'info',
          message: `Unknown command: /${cmd.token}. Type /help for the list.`,
        });
        return;
      }
    }

    const text = rawText;

    setSending(true);
    setSendError(null);

    let userBubbleId = failedTurn?.userBubbleId ?? `tmp-u-${Date.now()}`;
    const streamedBubbleIds = new Set<string>();

    if (!retrying) {
      const userBubble: Bubble = { id: userBubbleId, kind: 'user', content: rawText };
      setBubbles((b) => [...b, userBubble]);
    }

    const msgBuffers = new Map<string, Bubble>();

    await postSse(`/api/chat/${sessionId}/turn`, { content: text }, {
      onEvent: (evt: SseEvent) => {
        switch (evt.type) {
          case 'narrator':
          case 'character':
          case 'reactor': {
            if ((evt.type === 'character' || evt.type === 'reactor') && evt.characterId) {
              setActiveSpeakerId(evt.characterId);
            }
            const existing = msgBuffers.get(evt.messageId);
            if (existing) {
              chatStreamingBuffer.append(evt.messageId, evt.chunk);
            } else {
              streamedBubbleIds.add(evt.messageId);
              const nb: Bubble = {
                id: evt.messageId,
                kind: evt.type,
                speakerId: evt.characterId ?? null,
                content: '',
                pending: true,
              };
              msgBuffers.set(evt.messageId, nb);
              chatStreamingBuffer.append(evt.messageId, evt.chunk);
              setBubbles((b) => [...b, nb]);
            }
            break;
          }
          case 'relationship':
            pushToast({ tone: 'relationship', message: evt.newStage });
            break;
          case 'milestone':
            pushToast({ tone: 'milestone', message: evt.message });
            break;
          case 'mood':
            pushToast({ tone: 'mood', message: t('notifications.moodChange', { mood: evt.moodState }) });
            break;
          case 'emotion':
            if (evt.emotion) setDetectedEmotion(evt.emotion);
            break;
          case 'cyoa_choices':
            if (evt.choices) setCyoaChoices(evt.choices);
            break;
          case 'vulnerability_moment': {
            const delay = typeof evt.delayMs === 'number' ? evt.delayMs : 120_000;
            const vmMsg = typeof evt.message === 'string' ? evt.message : 'A moment was created.';
            setTimeout(() => {
              pushToast({ tone: 'milestone', message: vmMsg });
            }, delay);
            break;
          }
          case 'system_hint':
            pushToast({ tone: 'info', message: evt.message });
            break;
          case 'done':
            setBubbles((b) =>
              b.map((x) => {
                if (!msgBuffers.has(x.id)) return x;
                return { ...x, content: chatStreamingBuffer.getSnapshot(x.id), pending: false };
              })
            );
            msgBuffers.forEach((_, id) => chatStreamingBuffer.clear(id));
            setSending(false);
            queryClient.invalidateQueries({ queryKey: ['session-state', sessionId] });
            break;
        }
      },
      onError: (err) => {
        setSendError(err.message);
        setSending(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, sending, failedTurn, queryClient, pushToast, t]);

  const handleContinue = useCallback(async () => {
    if (sending) return;
    const lastBubble = bubbles[bubbles.length - 1];
    if (!lastBubble) return;
    setSending(true);

    await postSse(`/api/chat/${sessionId}/continue`, {}, {
      onEvent: (evt: SseEvent) => {
        if (evt.type === 'character' || evt.type === 'narrator') {
           setBubbles((b) => b.map((bubble) =>
             bubble.id === lastBubble.id
               ? { ...bubble, content: bubble.content + (evt.chunk || '') }
               : bubble
           ));
        }
        if (evt.type === 'done') {
          setSending(false);
          queryClient.invalidateQueries({ queryKey: ['session-state', sessionId] });
        }
      }
    });
  }, [sessionId, sending, bubbles, queryClient]);

  const handleUndo = useCallback(async () => {
    if (actionBusy || sending) return;
    setActionBusy('undo');
    try {
      await api.del(`/api/sessions/${sessionId}/turns/last`);
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['session-state', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['messages', sessionId] });
    } catch (err) {
      pushToast({ tone: 'info', message: t('notifications.undoFailed') });
    } finally {
      setActionBusy(null);
    }
  }, [actionBusy, sending, sessionId, queryClient, t, pushToast]);

  const handleRegenerate = useCallback(async () => {
    if (actionBusy || sending) return;
    setActionBusy('regen');
    setSending(true);
    try {
      setBubbles((b) => {
        const lastUserIdx = [...b].reverse().findIndex((x) => x.kind === 'user');
        if (lastUserIdx === -1) return b;
        return b.slice(0, b.length - lastUserIdx);
      });
      const msgBuffers = new Map<string, Bubble>();
      await postSse(`/api/chat/${sessionId}/regenerate`, {}, {
        onEvent: (evt: SseEvent) => {
          if (evt.type === 'narrator' || evt.type === 'character') {
            const existing = msgBuffers.get(evt.messageId);
            if (existing) {
              chatStreamingBuffer.append(evt.messageId, evt.chunk);
            } else {
              const nb: Bubble = {
                id: evt.messageId,
                kind: evt.type,
                speakerId: evt.characterId ?? null,
                content: '',
                pending: true,
              };
              msgBuffers.set(evt.messageId, nb);
              chatStreamingBuffer.append(evt.messageId, evt.chunk);
              setBubbles((b) => [...b, nb]);
            }
          } else if (evt.type === 'emotion' || evt.type === 'mood' || evt.type === 'relationship' || evt.type === 'milestone' || evt.type === 'cyoa_choices') {
            if (evt.type === 'emotion' && evt.emotion) setDetectedEmotion(evt.emotion);
            if (evt.type === 'cyoa_choices' && evt.choices) setCyoaChoices(evt.choices);
            if (evt.type === 'mood') pushToast({ tone: 'mood', message: t('notifications.moodChange', { mood: evt.moodState }) });
            if (evt.type === 'relationship') pushToast({ tone: 'relationship', message: evt.newStage });
            if (evt.type === 'milestone') pushToast({ tone: 'milestone', message: evt.message });
          } else if (evt.type === 'done') {
            setBubbles((b) =>
              b.map((x) => {
                if (!msgBuffers.has(x.id)) return x;
                return { ...x, content: chatStreamingBuffer.getSnapshot(x.id), pending: false };
              })
            );
            msgBuffers.forEach((_, id) => chatStreamingBuffer.clear(id));
            setSending(false);
            queryClient.invalidateQueries({ queryKey: ['session-state', sessionId] });
          }
        },
        onError: () => {
          pushToast({ tone: 'info', message: 'Gagal memuat ulang (Regenerate failed).' });
          setSending(false);
        }
      });
    } catch (err) {
      pushToast({ tone: 'info', message: 'Gagal memuat ulang (Regenerate failed).' });
      setSending(false);
    } finally {
      setActionBusy(null);
    }
  }, [actionBusy, sending, sessionId, queryClient, t, pushToast]);

  const handleBranch = useCallback(async () => {
    if (actionBusy || sending) return;
    if (!window.confirm(t('actions.branchConfirm'))) return;
    setActionBusy('branch');
    try {
      const res = await api.post<{ session: { id: string } }>(`/api/sessions/${sessionId}/branch`, {});
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      router.push(`/chat/${res.session.id}`);
    } catch (err) {
      pushToast({ tone: 'info', message: 'Gagal membuat cabang cerita.' });
    } finally {
      setActionBusy(null);
    }
  }, [actionBusy, sending, sessionId, queryClient, router, t, pushToast]);

  const value = {
    sessionId,
    session,
    sessionState,
    history,
    isStorySession,
    hasMcSet,
    showMcGate,
    characterName,
    activeMood,
    castIds,
    primaryCharacterId,
    spritesMap,
    bubbles,
    sending,
    actionBusy,
    detectedEmotion,
    cyoaChoices,
    isOffline,
    toasts,
    activeSpeakerId,
    streamKey,

    setActiveSpeakerId,
    setCyoaChoices,
    pushToast,
    send,
    handleContinue,
    handleUndo,
    handleRegenerate,
    handleBranch
  };

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>;
};
