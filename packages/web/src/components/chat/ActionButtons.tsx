'use client';

import { memo, useCallback } from 'react';
import { Send, SkipForward, RotateCcw, Trash2 } from 'lucide-react';

interface ActionButtonsProps {
  onSend: () => void;
  onContinue?: () => void;
  onRetry?: () => void;
  onClear?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  hasInput?: boolean;
}

/**
 * ActionButtons - Primary action buttons for the input bar
 * 
 * Buttons:
 * - Kirim (Send) — Primary amber gradient button
 * - Lanjut (Continue) — Secondary, requests character continuation
 * - Ulang (Retry) — Regenerate last response
 * - Hapus (Clear) — Clear input
 */
function ActionButtons({
  onSend,
  onContinue,
  onRetry,
  onClear,
  disabled = false,
  isLoading = false,
  hasInput = false,
}: ActionButtonsProps) {
  const handleSend = useCallback(() => {
    if (!disabled && !isLoading && hasInput) {
      onSend();
    }
  }, [disabled, isLoading, hasInput, onSend]);

  const handleContinue = useCallback(() => {
    if (!disabled && !isLoading && onContinue) {
      onContinue();
    }
  }, [disabled, isLoading, onContinue]);

  const handleRetry = useCallback(() => {
    if (!disabled && !isLoading && onRetry) {
      onRetry();
    }
  }, [disabled, isLoading, onRetry]);

  const handleClear = useCallback(() => {
    if (!disabled && !isLoading && onClear) {
      onClear();
    }
  }, [disabled, isLoading, onClear]);

  return (
    <div className="flex items-center gap-3" role="group" aria-label="Action buttons">
      {/* Utility Buttons */}
      <div className="flex items-center gap-1 border-r border-white/10 pr-3">
        {onContinue && (
          <button
            type="button"
            onClick={handleContinue}
            disabled={disabled || isLoading}
            className="text-ink-400 hover:text-white transition-colors p-2 rounded-full disabled:opacity-30"
            title="Lanjutkan"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        )}
        
        {onRetry && (
          <button
            type="button"
            onClick={handleRetry}
            disabled={disabled || isLoading}
            className="text-ink-400 hover:text-white transition-colors p-2 rounded-full disabled:opacity-30"
            title="Ulang"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        )}

        {onClear && (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled || isLoading}
            className="text-red-400/50 hover:text-red-400 transition-colors p-2 rounded-full disabled:opacity-30"
            title="Hapus"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Primary Send Button */}
      <button
        type="button"
        onClick={handleSend}
        disabled={disabled || isLoading || !hasInput}
        className={`
          p-3 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex-shrink-0
          \${hasInput && !isLoading 
            ? 'bg-primary-container text-on-primary-container bloom-effect hover:bg-primary-container/90' 
            : 'bg-white/5 text-ink-500'}
        `}
        aria-label="Kirim pesan"
        title="Kirim pesan"
      >
        <Send className="w-5 h-5 ml-0.5" />
      </button>

      {/* Loading Spinner */}
      {isLoading && (
        <div className="ml-1" aria-hidden="true">
          <svg
            className="animate-spin h-5 w-5 text-indigo-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

export default memo(ActionButtons);
