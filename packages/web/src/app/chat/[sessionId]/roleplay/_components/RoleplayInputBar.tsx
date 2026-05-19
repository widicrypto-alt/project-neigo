'use client';

import * as React from 'react';
import { Send, SkipForward, RotateCcw, Trash2 } from 'lucide-react';

interface RoleplayInputBarProps {
  onSubmit: (text: string) => void;
  onContinue: () => void;
  onRetry: () => void;
  onUndo: () => void;
  onClear?: () => void;
  busy?: boolean;
  characterName?: string;
}

export function RoleplayInputBar({
  onSubmit,
  onContinue,
  onRetry,
  onUndo,
  onClear,
  busy,
  characterName,
}: RoleplayInputBarProps) {
  const [value, setValue] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    // Auto-quote if user types bare text (not starting with " or *)
    const formatted = !text.startsWith('"') && !text.startsWith('*')
      ? `"${text}"`
      : text;
    onSubmit(formatted);
    setValue('');
    inputRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 px-4 md:px-8 pb-4 md:pb-6 z-40"
      style={{ background: 'linear-gradient(to top, #131313 0%, rgba(19,19,19,0.9) 60%, transparent 100%)', paddingTop: '48px' }}>
      <div className="max-w-7xl mx-auto w-full">
        {/* Input row — full width on mobile, 65% right-column on desktop */}
        <div className="w-full lg:w-[65%] lg:ml-auto lg:pl-8 flex items-center gap-3">
          <div className="w-full flex items-center gap-2 rounded-full p-2 pl-4 pr-2 shadow-lg"
            style={{
              background: 'rgba(18,18,18,0.88)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(109,94,227,0.2)',
            }}>
            {/* Action buttons */}
            <div className="flex items-center gap-1 border-r pr-2" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <button
                onClick={onContinue} disabled={!!busy}
                title="Continue"
                className="text-on-surface-variant hover:text-white transition-colors p-2 rounded-full disabled:opacity-30"
              >
                <SkipForward size={18} />
              </button>
              <button
                onClick={onRetry} disabled={!!busy}
                title="Retry"
                className="text-on-surface-variant hover:text-white transition-colors p-2 rounded-full disabled:opacity-30"
              >
                <RotateCcw size={18} />
              </button>
              {onClear && (
                <button
                  onClick={onClear} disabled={!!busy}
                  title="Clear"
                  className="transition-colors p-2 rounded-full disabled:opacity-30"
                  style={{ color: 'rgba(255,100,100,0.5)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,100,100,0.9)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,100,100,0.5)')}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>

            {/* Text input */}
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={onKey}
              disabled={!!busy}
              className="flex-1 bg-transparent border-none focus:ring-0 outline-none disabled:opacity-50"
              style={{
                fontFamily: '"Crimson Text", Georgia, serif',
                fontSize: '1.1rem',
                color: 'rgba(229,226,225,0.9)',
                padding: '10px 8px',
              }}
              placeholder={busy
                ? `${characterName ?? 'Character'} is typing…`
                : 'Act or respond…'}
            />

            {/* Send button */}
            <button
              onClick={submit}
              disabled={!value.trim() || !!busy}
              className="p-3 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 shrink-0"
              style={{
                background: value.trim() && !busy ? '#6d5ee3' : 'rgba(255,255,255,0.06)',
                color: value.trim() && !busy ? '#fbf7ff' : 'rgba(255,255,255,0.4)',
                boxShadow: value.trim() && !busy ? '0 0 15px rgba(109,94,227,0.4)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              <Send size={18} style={{ marginLeft: 2 }} />
            </button>
          </div>
        </div>

        {/* Hint */}
        <div className="w-full lg:w-[65%] lg:ml-auto lg:pl-8 flex items-center justify-center mt-1.5">
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', userSelect: 'none' }}>
            Enter to send &nbsp;·&nbsp; Start with{' '}
            <kbd style={{ fontFamily: 'inherit', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '10px' }}>*</kbd>
            {' '}for actions
          </span>
        </div>
      </div>
    </div>
  );
}
