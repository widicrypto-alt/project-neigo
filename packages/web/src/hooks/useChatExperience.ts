'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  DEFAULT_EMOTION,
  MOOD_PRESETS,
  type Emotion,
  type MessageNode,
  type MoodPresetKey,
  type SpriteManifest,
} from '@/lib/chat-experience';
import { detectEmotion } from '@/lib/content-detect';

interface UseChatExperienceOptions {
  sessionId: string;
  initialMessages?: MessageNode[];
  spriteManifest?: SpriteManifest | null;
  initialMoodPreset?: MoodPresetKey;
}

interface UseChatExperienceReturn {
  // State
  messages: MessageNode[];
  isLoading: boolean;
  currentEmotion: Emotion;
  recentEmotions: Emotion[];
  moodPreset: MoodPresetKey;
  isMobile: boolean;
  
  // Actions
  applyEmotion: (emotion: Emotion) => void;
  setMoodPreset: (preset: MoodPresetKey) => void;
  addMessage: (message: MessageNode) => void;
  updateMessage: (id: string, updates: Partial<MessageNode>) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  
  // Sprite helpers
  currentSpriteUrl: string | null;
  isTransitioning: boolean;
  startTransition: (targetUrl: string, targetEmotion: Emotion) => void;
  completeTransition: () => void;
}

/**
 * Hook for managing chat experience state
 */
export function useChatExperience(options: UseChatExperienceOptions): UseChatExperienceReturn {
  const {
    sessionId,
    initialMessages = [],
    spriteManifest,
    initialMoodPreset = 'candlelight',
  } = options;

  // Core state
  const [messages, setMessages] = useState<MessageNode[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<Emotion>(DEFAULT_EMOTION);
  const [recentEmotions, setRecentEmotions] = useState<Emotion[]>([DEFAULT_EMOTION]);
  const [moodPreset, setMoodPreset] = useState<MoodPresetKey>(initialMoodPreset);
  const [isMobile, setIsMobile] = useState(false);

  // Transition state
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionRef = useRef<{
    targetUrl: string | null;
    targetEmotion: Emotion;
  } | null>(null);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Apply emotion
  const applyEmotion = useCallback((emotion: Emotion) => {
    setCurrentEmotion(emotion);
    setRecentEmotions(prev => {
      const deduped = [emotion, ...prev.filter(e => e !== emotion)];
      return deduped.slice(0, 5);
    });
  }, []);

  // Add message
  const addMessage = useCallback((message: MessageNode) => {
    setMessages(prev => [...prev, message]);

    // Auto-detect emotion from content
    if (message.text && (message.type === 'dialogue' || message.type === 'narration')) {
      const detected = detectEmotion(message.text);
      if (detected) {
        applyEmotion(detected);
      }
    }
  }, [applyEmotion]);

  // Update message
  const updateMessage = useCallback((id: string, updates: Partial<MessageNode>) => {
    setMessages(prev => prev.map(msg => 
      msg.id === id ? { ...msg, ...updates } : msg
    ));
  }, []);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Start sprite transition
  const startTransition = useCallback((targetUrl: string, targetEmotion: Emotion) => {
    transitionRef.current = { targetUrl, targetEmotion };
    setIsTransitioning(true);
  }, []);

  // Complete sprite transition
  const completeTransition = useCallback(() => {
    if (transitionRef.current) {
      setCurrentEmotion(transitionRef.current.targetEmotion);
      transitionRef.current = null;
    }
    setIsTransitioning(false);
  }, []);

  // Get current sprite URL
  const currentSpriteUrl = spriteManifest?.[currentEmotion] || spriteManifest?.[DEFAULT_EMOTION] || null;

  return {
    // State
    messages,
    isLoading,
    currentEmotion,
    recentEmotions,
    moodPreset,
    isMobile,

    // Actions
    applyEmotion,
    setMoodPreset,
    addMessage,
    updateMessage,
    clearMessages,
    setLoading: setIsLoading,

    // Sprite helpers
    currentSpriteUrl,
    isTransitioning,
    startTransition,
    completeTransition,
  };
}

/**
 * Hook for detecting emotion from text
 */
export function useEmotionDetection(text: string | null, onEmotion: (emotion: Emotion) => void) {
  useEffect(() => {
    if (!text) return;

    const emotion = detectEmotion(text);
    if (emotion) {
      onEmotion(emotion);
    }
  }, [text, onEmotion]);
}

/**
 * Hook for parallax mouse tracking
 */
export function useParallaxMouse(containerRef: React.RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      setPosition({
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      });
    };

    container.addEventListener('mousemove', handleMouseMove);
    return () => container.removeEventListener('mousemove', handleMouseMove);
  }, [containerRef]);

  return position;
}

/**
 * Hook for reduced motion preference
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return reducedMotion;
}

/**
 * Hook for sprite preloading
 */
export function useSpritePreload(manifest: SpriteManifest | null | undefined, emotions: Emotion[]) {
  useEffect(() => {
    if (!manifest) return;

    for (const emotion of emotions) {
      const url = manifest[emotion];
      if (url) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = url;
        document.head.appendChild(link);
      }
    }
  }, [manifest, emotions]);
}
