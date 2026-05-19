'use client';

import { useState, useCallback, useRef, memo } from 'react';
import ActionButtons from './ActionButtons';

interface InputBarProps {
  onSubmit: (text: string) => void;
  onContinue?: () => void;
  onRetry?: () => void;
  onClear?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}

/**
 * InputBar - Simplified glass container without mode selector
 */
function InputBar({
  onSubmit,
  onContinue,
  onRetry,
  onClear,
  disabled = false,
  isLoading = false,
}: InputBarProps) {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle input change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    
    // Auto-resize textarea
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, []);

  // Handle submit
  const handleSubmit = useCallback(() => {
    const trimmedValue = inputValue.trim();
    if (trimmedValue && !disabled && !isLoading) {
      onSubmit(trimmedValue);
      setInputValue('');
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [inputValue, disabled, isLoading, onSubmit]);

  // Handle key press
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    
    // Submit on Ctrl/Cmd + Enter
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // Handle clear
  const handleClear = useCallback(() => {
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
    onClear?.();
  }, [onClear]);

  return (
    <div
      className="fixed bottom-0 right-0 left-0 md:left-[32%] p-4 z-30"
      style={{
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="max-w-3xl mx-auto">
        <div className="vn-input-glass p-4 border border-indigo-500/20 rounded-[2rem] shadow-lg">
          {/* Textarea Container */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              className="vn-input-textarea !bg-transparent !border-none focus:!ring-0 resize-none overflow-hidden"
              value={inputValue}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={isLoading ? "Sedang merespons..." : "Bicara atau lakukan sesuatu..."}
              rows={1}
              disabled={disabled || isLoading}
              aria-label="Chat input"
              aria-multiline="true"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between mt-3 border-t border-white/5 pt-3">
            {/* Character count / hints */}
            <div className="text-xs text-ink-500">
              {inputValue.length > 0 && (
                <span>{inputValue.length} karakter</span>
              )}
            </div>

            {/* Buttons */}
            <ActionButtons
              onSend={handleSubmit}
              onContinue={onContinue}
              onRetry={onRetry}
              onClear={handleClear}
              disabled={disabled}
              isLoading={isLoading}
              hasInput={inputValue.trim().length > 0}
            />
          </div>
        </div>

        {/* Keyboard hint */}
        <div className="flex items-center justify-center gap-4 mt-2 text-xs text-ink-600">
          <span>
            <kbd className="kbd">Enter</kbd> Kirim
          </span>
          <span>
            <kbd className="kbd">Shift</kbd> + <kbd className="kbd">Enter</kbd> Baris baru
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(InputBar);
