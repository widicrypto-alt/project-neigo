'use client';

import { memo, useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MessageNode, Emotion } from '@/lib/chat-experience';
import { getCharacterTheme } from '@/lib/chat-experience';
import { cn } from '@/lib/cn';

interface MessageBubbleProps {
  message: MessageNode;
  isStreaming?: boolean;
  onComplete?: () => void;
}

/**
 * MessageBubble - Immersive Chat 2.0 version
 * 
 * Features:
 * - Dynamic character color generation
 * - Differentiated "Thought" (batin) vs "Dialogue" styling
 * - Expressive emotional animations (shake, bounce)
 * - Typewriter reveal using Framer Motion
 */
function MessageBubble({
  message,
  isStreaming = false,
  onComplete,
}: MessageBubbleProps) {
  const isUser = message.speaker === 'Kamu';
  const isThought = message.type === 'thought';
  const isNarration = message.type === 'narration';
  
  // Dynamic theme based on speaker name/id - only for characters
  const theme = useMemo(() => {
    if (isUser) return null;
    return getCharacterTheme(message.speaker || 'unknown');
  }, [message.speaker, isUser]);

  const [isVisible, setIsVisible] = useState(false);
  const [isTypingComplete, setIsTypingComplete] = useState(!isStreaming);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Scroll into view when typing completes or new message appears
  useEffect(() => {
    if (isTypingComplete && textRef.current) {
      textRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isTypingComplete]);

  // Framer Motion Variants for Typewriter
  const containerVariants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.03, // Speed of typewriter
        onComplete: () => {
          setIsTypingComplete(true);
          onComplete?.();
        }
      }
    }
  };

  const letterVariants = {
    hidden: { opacity: 0, y: 2 },
    visible: { opacity: 1, y: 0 }
  };

  // Determine emotional animation class
  const getEmotionalClass = (emotion?: Emotion) => {
    if (!emotion) return '';
    switch (emotion) {
      case 'angry': return 'vn-animate-shake';
      case 'happy': 
      case 'laugh':
      case 'playful': return 'vn-animate-bounce';
      case 'surprised': return 'scale-[1.02] transition-transform';
      default: return '';
    }
  };

  const renderTextWithTypewriter = (text: string) => {
    if (!isStreaming) return <span>{text}</span>;

    const characters = Array.from(text);
    return (
      <motion.span
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {characters.map((char, i) => (
          <motion.span key={i} variants={letterVariants}>
            {char}
          </motion.span>
        ))}
        {!isTypingComplete && (
          <motion.span 
            className="inline-block w-1.5 h-4 ml-1 align-middle"
            style={{ backgroundColor: isUser ? '#fff' : (theme?.primary || '#fff') }}
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}
      </motion.span>
    );
  };

  const renderContent = () => {
    // Check if text already has parentheses to avoid doubling up
    const text = message.text || '';
    const hasParentheses = text.trim().startsWith('(') && text.trim().endsWith(')');
    const contentClasses = cn(isThought && !hasParentheses && "vn-thought-text");

    // If we have parts (quoted speech vs text), render them
    if (message.parts && message.parts.length > 0) {
      return (
        <div className={contentClasses}>
          {message.parts.map((part, index) => {
            if (part.kind === 'q') {
              return (
                <span 
                  key={index} 
                  className="font-medium"
                  style={{ color: (isUser || !theme) ? undefined : theme.primary }}
                >
                  &quot;{part.text}&quot;
                </span>
              );
            }
            return <span key={index}>{part.text}</span>;
          })}
        </div>
      );
    }

    // Otherwise render plain text with typewriter if streaming
    return (
      <div className={contentClasses}>
        {renderTextWithTypewriter(text)}
      </div>
    );
  };

  const getBubbleStyle = () => {
    if (isUser || isThought || isNarration || !theme) return {};
    
    return {
      borderColor: theme.border,
      boxShadow: `0 4px 20px -2px ${theme.glow}`,
      background: `linear-gradient(135deg, ${theme.secondary} 0%, rgba(18, 18, 18, 0.9) 100%)`,
    };
  };

  const bubbleClasses = cn(
    "vn-message-bubble rounded-2xl p-4 md:p-6 relative flex flex-col font-novel",
    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
    isUser ? "user-bubble rounded-tr-sm self-end ml-auto mb-4" : "glass-panel rounded-tl-sm mb-4",
    isThought && "vn-thought-bubble self-center max-w-[85%] text-center",
    isNarration && "vn-narration self-center text-center !bg-transparent !border-none !shadow-none max-w-2xl",
    !isUser && !isThought && !isNarration && "border-l-4",
    getEmotionalClass(message.emotion),
    "transition-all duration-500 ease-out"
  );

  return (
    <div
      ref={textRef}
      className={bubbleClasses}
      style={getBubbleStyle()}
      role="article"
      aria-label={`${message.type} message from ${message.speaker || 'unknown'}`}
    >
      {/* Speaker Badge */}
      {message.speaker && message.speaker !== 'Kamu' && !isThought && !isNarration && theme && (
        <div 
          className="vn-speaker-badge !font-display !tracking-wider"
          style={{ 
            backgroundColor: theme.badge, 
            borderColor: theme.border, 
            color: theme.primary 
          }}
        >
          <span>{message.speaker}</span>
        </div>
      )}

      {/* Message Content */}
      <div className={cn(
        "leading-relaxed text-[1.1rem] md:text-[1.2rem]",
        isUser ? "text-white" : "text-on-surface"
      )}>
        {renderContent()}
      </div>

      {/* Typing dots for stream but not yet started */}
      {isStreaming && !message.text && (
        <div className="vn-typing-indicator mt-2">
          <span className="vn-typing-dot" style={{ backgroundColor: theme?.primary || '#fff' }} />
          <span className="vn-typing-dot" style={{ backgroundColor: theme?.primary || '#fff' }} />
          <span className="vn-typing-dot" style={{ backgroundColor: theme?.primary || '#fff' }} />
        </div>
      )}
    </div>
  );
}

export default memo(MessageBubble);
