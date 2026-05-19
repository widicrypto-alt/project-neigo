'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import CharacterStage from '../character/CharacterStage';
import ChatColumn from './ChatColumn';
import ChatHeader from './ChatHeader';
import InputBar from './InputBar';
import MobileBackdrop from '../character/MobileBackdrop';
import {
  DEFAULT_EMOTION,
  MOOD_PRESETS,
  type Emotion,
  type MessageNode,
  type MoodPresetKey,
  type SpriteManifest,
} from '@/lib/chat-experience';
import { detectEmotion } from '@/lib/content-detect';

interface ChatPageExperienceProps {
  sessionId: string;
  characterName: string;
  characterId: string;
  initialMessages?: MessageNode[];
  spriteManifest?: SpriteManifest;
  backgroundUrl?: string;
  initialMoodPreset?: MoodPresetKey;
  onSendMessage?: (text: string) => void;
  onContinue?: () => void;
  onRetry?: () => void;
}

/**
 * ChatPageExperience - Main orchestrator for the visual novel chat experience
 * 
 * Layout:
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │                        ChatHeader (fixed top)                        │
 * ├─────────────────────────────┬────────────────────────────────────────┤
 * │                             │                                        │
 * │   CharacterStage (fixed)     │         ChatColumn (scrollable)       │
 * │   ├── AtmosphereLayer       │         ├── MessageStream            │
 * │   │   ├── ParallaxBG        │         │   └── Bubble[]              │
 * │   │   ├── MoodLighting      │         └── InputBar                  │
 * │   │   └── DustMotes         │             ├── ModeSelector           │
 * │   ├── SpriteLayer           │             ├── Textarea              │
 * │   │   └── CurrentSprite     │             └── ActionButtons         │
 * │   └── ExpressionGallery     │                                        │
 * │                             │                                        │
 * └─────────────────────────────┴────────────────────────────────────────┘
 */
export default function ChatPageExperience({
  sessionId,
  characterName,
  characterId,
  initialMessages = [],
  spriteManifest,
  backgroundUrl,
  initialMoodPreset = 'candlelight',
  onSendMessage,
  onContinue,
  onRetry,
}: ChatPageExperienceProps) {
  const router = useRouter();
  const chatColumnRef = useRef<{ scrollToBottom: () => void; getScrollPosition: () => number } | null>(null);

  // State
  const [messages, setMessages] = useState<MessageNode[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<Emotion>(DEFAULT_EMOTION);
  const [recentEmotions, setRecentEmotions] = useState<Emotion[]>([DEFAULT_EMOTION]);
  const [moodPreset, setMoodPreset] = useState<MoodPresetKey>(initialMoodPreset);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Apply emotion and update recent emotions
  const applyEmotion = useCallback((emotion: Emotion) => {
    setCurrentEmotion(emotion);
    setRecentEmotions(prev => {
      // Dedupe and keep last 5
      const deduped = [emotion, ...prev.filter(e => e !== emotion)];
      return deduped.slice(0, 5);
    });
  }, []);

  // Handle emotion from SSE or content detection
  const handleEmotionFromContent = useCallback((text: string) => {
    const detected = detectEmotion(text);
    if (detected && detected !== currentEmotion) {
      applyEmotion(detected);
    }
  }, [currentEmotion, applyEmotion]);

  // Handle emotion selection from gallery
  const handleEmotionSelect = useCallback((emotion: Emotion) => {
    applyEmotion(emotion);
  }, [applyEmotion]);

  // Handle message submit
  const handleSubmit = useCallback((text: string) => {
    // Create user message
    const userMessage: MessageNode = {
      id: `user-${Date.now()}`,
      type: 'dialogue',
      speaker: 'Kamu',
      text,
      timestamp: Date.now(),
    };

    // Add user message
    setMessages(prev => [...prev, userMessage]);

    // Notify parent
    onSendMessage?.(text);

    // Set loading state
    setIsLoading(true);
  }, [onSendMessage]);

  // Handle continue
  const handleContinue = useCallback(() => {
    onContinue?.();
  }, [onContinue]);

  // Handle retry
  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    router.push('/chat');
  }, [router]);

  // Add a response message (called from parent via ref or callback)
  const addResponseMessage = useCallback((message: MessageNode) => {
    setMessages(prev => [...prev, message]);
    setIsLoading(false);
    
    // Detect emotion from response
    if (message.text) {
      handleEmotionFromContent(message.text);
    }
  }, [handleEmotionFromContent]);

  // Get current sprite URL
  const currentSpriteUrl = useMemo(() => {
    return spriteManifest?.[currentEmotion] || spriteManifest?.[DEFAULT_EMOTION] || null;
  }, [spriteManifest, currentEmotion]);

  return (
    <div className="min-h-screen bg-[#07080f] overflow-hidden">
      {/* Mobile Backdrop */}
      {isMobile && (
        <MobileBackdrop
          spriteUrl={currentSpriteUrl}
          characterName={characterName}
        />
      )}

      {/* Character Stage - Left Panel */}
      {!isMobile && (
        <CharacterStage
          characterName={characterName}
          spriteManifest={spriteManifest}
          currentEmotion={currentEmotion}
          moodPreset={moodPreset}
          backgroundUrl={backgroundUrl}
          recentEmotions={recentEmotions}
          onEmotionSelect={handleEmotionSelect}
          isMobile={isMobile}
        />
      )}

      {/* Right Panel - Chat */}
      <div
        className="relative h-screen flex flex-col"
        style={{
          marginLeft: isMobile ? 0 : undefined,
        }}
      >
        {/* Header */}
        <ChatHeader
          characterName={characterName}
          onBack={handleBack}
        />

        {/* Chat Column */}
        <ChatColumn
          ref={chatColumnRef}
          characterName={characterName}
          messages={messages}
          isLoading={isLoading}
        />

        {/* Input Bar */}
        <InputBar
          onSubmit={handleSubmit}
          onContinue={handleContinue}
          onRetry={handleRetry}
          disabled={isLoading}
          isLoading={isLoading}
        />
      </div>

      {/* Expose methods for parent components */}
      {/* This could be done via forwardRef or context */}
    </div>
  );
}
