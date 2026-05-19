'use client';

import { useCallback, useEffect, useRef, useState, use } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import ChatPageExperience from '@/components/chat/ChatPageExperience';
import { cn } from '@/lib/cn';
import { api, userFacingApiMessage } from '@/lib/api';
import { postSse } from '@/lib/sse';
import { chatStreamingBuffer } from '@/lib/streaming-buffer';
import { detectEmotion } from '@/lib/content-detect';
import {
  type Character,
  type ChatMessage,
  type ChatSession,
  type SseEvent,
} from '@neigo/shared';
import {
  DEFAULT_EMOTION,
  type Emotion,
  type MessageNode,
  type MoodPresetKey,
} from '@/lib/chat-experience';

export default function VNChatSessionPage(props: { params: Promise<{ sessionId: string }> }) {
  const t = useTranslations('vn');
  const commonT = useTranslations('common');
  const { sessionId } = use(props.params);
  const queryClient = useQueryClient();
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<MessageNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<Emotion>(DEFAULT_EMOTION);
  const [recentEmotions, setRecentEmotions] = useState<Emotion[]>([DEFAULT_EMOTION]);
  const [mood, setMood] = useState<MoodPresetKey>('candlelight');
  const [spriteManifest, setSpriteManifest] = useState<Record<string, string> | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // ── Queries ────────────────────────────────────────────────────────────────
  const session = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.get<{ session: ChatSession }>(`/api/sessions/${sessionId}`),
  });

  const history = useQuery({
    queryKey: ['messages', sessionId],
    queryFn: () => api.get<{ messages: ChatMessage[] }>(`/api/sessions/${sessionId}/messages`),
  });

  const characterId = session.data?.session.characterId;
  const character = useQuery({
    queryKey: ['character', characterId],
    queryFn: () => api.get<{ character: Character }>(`/api/characters/${characterId}`),
    enabled: !!characterId,
    staleTime: 60_000,
  });

  // ── Sprite Manifest & Background ──────────────────────────────────────────
  useEffect(() => {
    if (!characterId) return;

    Promise.allSettled([
      api.get<{ manifest: { expressions: Record<string, string> } }>(
        `/api/characters/${characterId}/sprite-manifest`,
      ),
      api.get<{ sceneCard: { background?: string } }>(`/api/sessions/${sessionId}`),
    ]).then(([manifestResult, sceneResult]) => {
      if (manifestResult.status === 'fulfilled') {
        setSpriteManifest(manifestResult.value.manifest.expressions ?? null);
      }
      if (sceneResult.status === 'fulfilled') {
        setBackgroundUrl(sceneResult.value.sceneCard?.background ?? null);
      }
    });
  }, [characterId, sessionId]);

  // ── Load History ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!history.data) return;

    setMessages(
      history.data.messages
        .filter((m) => {
          const meta = m.metadata as Record<string, unknown> | null | undefined;
          return meta?.kind !== 'scene_change';
        })
        .map((m) => ({
          id: m.id,
          type: m.speakerType === 'USER'
            ? 'dialogue'
            : m.speakerType === 'NARRATOR'
              ? 'narration'
              : m.speakerType === 'WHISPER'
                ? 'thought'
                : 'dialogue',
          speaker: m.speakerType === 'USER'
            ? commonT('you')
            : m.speakerType === 'NARRATOR'
              ? undefined
              : session.data?.session.title || character.data?.character.name || commonT('character'),
          text: m.content,
          timestamp: new Date(m.createdAt).getTime(),
        })),
    );
  }, [history.data, session.data, character.data, commonT]);

  // ── Apply Emotion ─────────────────────────────────────────────────────────
  const applyEmotion = useCallback((emotion: string) => {
    const validEmotion = emotion as Emotion;
    setCurrentEmotion(validEmotion);
    setRecentEmotions((prev) => {
      const deduped = [validEmotion, ...prev.filter((e) => e !== validEmotion)];
      return deduped.slice(0, 5);
    });
  }, []);

  // ── Send Message ──────────────────────────────────────────────────────────
  const handleSendMessage = useCallback((text: string) => {
    setIsLoading(true);

    const msgBuffers = new Map<string, MessageNode>();
    let completed = false;

    postSse(`/api/chat/${sessionId}/turn`, { content: text }, {
      onEvent: (evt: SseEvent) => {
        if (evt.type === 'narrator' || evt.type === 'character') {
          const existing = msgBuffers.get(evt.messageId);
          if (existing) {
            chatStreamingBuffer.append(evt.messageId, evt.chunk);
          } else {
            const nb: MessageNode = {
              id: evt.messageId,
              type: evt.type === 'narrator' ? 'narration' : 'dialogue',
              speaker: evt.type === 'character' 
                ? (session.data?.session.title || character.data?.character.name)
                : undefined,
              text: '',
              timestamp: Date.now(),
            };
            msgBuffers.set(evt.messageId, nb);
            chatStreamingBuffer.append(evt.messageId, evt.chunk);
            setMessages((prev) => [...prev, nb]);
          }
        } else if (evt.type === 'emotion') {
          applyEmotion(evt.emotion);
        } else if (evt.type === 'done') {
          completed = true;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setMessages((prev) =>
                prev.map((x) => {
                  if (!msgBuffers.has(x.id)) return x;
                  const finalText = chatStreamingBuffer.getSnapshot(x.id) || '';
                  if ((x.type === 'dialogue' || x.type === 'narration') && finalText) {
                    const emotion = detectEmotion(finalText);
                    if (emotion) applyEmotion(emotion);
                  }
                  return { ...x, text: finalText };
                }),
              );
              msgBuffers.forEach((_, id) => chatStreamingBuffer.clear(id));
              void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
              void queryClient.invalidateQueries({ queryKey: ['messages', sessionId] });
            });
          });
          setIsLoading(false);
        }
      },
      onDone: () => {
        if (!completed) setIsLoading(false);
      },
      onError: () => {
        setIsLoading(false);
      },
    });
  }, [sessionId, session.data, character.data, applyEmotion, queryClient]);

  // ── Continue ─────────────────────────────────────────────────────────────
  const handleContinue = useCallback(() => {
    if (isLoading) return;
    setIsLoading(true);

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) { setIsLoading(false); return; }

    postSse(`/api/chat/${sessionId}/continue`, {}, {
      onEvent: (evt: SseEvent) => {
        if (evt.type === 'character') {
          const prefix = messages.length > 0 ? '\n\n' : '';
          setMessages((prev) =>
            prev.map((b, idx) =>
              idx === prev.length - 1
                ? { ...b, text: (b.text || '') + prefix + (evt.chunk || '') }
                : b,
            ),
          );
        }
        if (evt.type === 'emotion') {
          applyEmotion(evt.emotion);
        }
        if (evt.type === 'done') {
          setIsLoading(false);
          void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
        }
      },
      onDone: () => {
        setIsLoading(false);
      },
      onError: () => {
        setIsLoading(false);
      },
    });
  }, [isLoading, messages, sessionId, applyEmotion, queryClient]);

  // ── Retry ────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    // Remove last assistant messages and retry
    setMessages((prev) => {
      const lastUserIdx = [...prev].reverse().findIndex((x) => x.speaker === commonT('you'));
      if (lastUserIdx === -1) return prev;
      return prev.slice(0, prev.length - lastUserIdx);
    });

    setIsLoading(true);
    postSse(`/api/chat/${sessionId}/regenerate`, {}, {
      onEvent: (evt: SseEvent) => {
        if (evt.type === 'narrator' || evt.type === 'character') {
          const nb: MessageNode = {
            id: evt.messageId,
            type: evt.type === 'narrator' ? 'narration' : 'dialogue',
            speaker: evt.type === 'character'
              ? (session.data?.session.title || character.data?.character.name)
              : undefined,
            text: evt.chunk || '',
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, nb]);
        }
        if (evt.type === 'emotion') {
          applyEmotion(evt.emotion);
        }
        if (evt.type === 'done') {
          setIsLoading(false);
          void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
        }
      },
      onDone: () => {
        setIsLoading(false);
      },
      onError: () => {
        setIsLoading(false);
      },
    });
  }, [sessionId, session.data, character.data, applyEmotion, queryClient, commonT]);

  // ── Auto Scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    const shouldFollow = shouldAutoScrollRef.current || distanceFromBottom < 120;
    if (!shouldFollow) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const characterName = session.data?.session.title || character.data?.character.name || commonT('character');

  return (
    <div className="min-h-screen bg-[#07080f]">
      {/* VN Mode Banner */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-900/80 to-orange-900/80 backdrop-blur-sm border-b border-amber-500/20">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/chat/${sessionId}`}
              className="text-amber-200/80 hover:text-amber-100 text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              {t('normalMode')}
            </Link>
            <span className="text-amber-200/60">|</span>
            <span className="text-amber-100 font-medium text-sm">{t('vnMode')}</span>
          </div>
          <div className="text-amber-200/60 text-xs">
            {t.rich('exitHint', {
              key: (chunks) => <kbd className="px-1.5 py-0.5 bg-amber-900/50 rounded text-amber-200">{chunks}</kbd>
            })}
          </div>
        </div>
      </div>

      {/* VN Chat Experience */}
      <div className="pt-10">
        <ChatPageExperience
          sessionId={sessionId}
          characterName={characterName}
          characterId={characterId || ''}
          initialMessages={messages}
          spriteManifest={spriteManifest ?? undefined}
          backgroundUrl={backgroundUrl ?? undefined}
          initialMoodPreset={mood}
          onSendMessage={handleSendMessage}
          onContinue={handleContinue}
          onRetry={handleRetry}
        />
      </div>
    </div>
  );
}
