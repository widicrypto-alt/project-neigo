'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Send, SkipForward, GitBranch, RotateCcw, Trash2, Eye } from 'lucide-react';

export interface InputBarProps {
  onSubmit?: (data: { mode: string; text: string }) => void;
  onContinue?: () => void;
  onRetry?: () => void;
  onUndo?: () => void;
  onBranch?: () => void;
  onClear?: () => void;
  onWatch?: () => void;
  busy?: boolean;
  characterName?: string;
}

export function InputBar({ onSubmit, onContinue, onRetry, onUndo, onBranch, onClear, onWatch, busy, characterName }: InputBarProps) {
  const t = useTranslations('chat');

  const [value, setValue] = React.useState('');

  const submit = () => {
    if (!value.trim() || busy) return;
    
    let formattedText = value.trim();
    if (!formattedText.startsWith('"') && !formattedText.startsWith('*')) {
      formattedText = `"${formattedText}"`;
    }

    onSubmit?.({ mode: 'custom', text: formattedText });
    setValue('');
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="fixed left-0 right-0 bottom-0 px-8 pb-6 z-40 bg-gradient-to-t from-background via-background/90 to-transparent pt-12">
      <div className="max-w-[760px] mx-auto flex items-center gap-3">
        <div className="w-full flex items-center gap-2 glass-panel rounded-full p-2 pl-3 pr-2 flex-wrap sm:flex-nowrap shadow-lg border border-indigo-500/20">
          <div className="flex items-center gap-1 border-r border-white/10 pr-2">
            <button onClick={onContinue} disabled={busy} title={t('actions.resume')} className="text-on-surface-variant hover:text-white transition-colors p-2 rounded-full disabled:opacity-30">
              <SkipForward size={20} />
            </button>
            <button onClick={onBranch} disabled={busy} title={t('actions.branch')} className="text-on-surface-variant hover:text-white transition-colors p-2 rounded-full disabled:opacity-30">
              <GitBranch size={20} />
            </button>
            <button onClick={onUndo} disabled={busy} title={t('actions.rewind')} className="text-on-surface-variant hover:text-white transition-colors p-2 rounded-full disabled:opacity-30">
              <RotateCcw size={20} />
            </button>
            <button onClick={onWatch} disabled={busy} title="Amati (Auto-Turn)" className="text-on-surface-variant hover:text-white transition-colors p-2 rounded-full disabled:opacity-30">
              <Eye size={20} />
            </button>
            <button onClick={onClear} disabled={busy} title={t('actions.clear')} className="text-red-400/50 hover:text-red-400 transition-colors p-2 rounded-full disabled:opacity-30">
              <Trash2 size={20} />
            </button>
          </div>
          
          <input 
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={onKey}
            disabled={busy}
            className="flex-1 bg-transparent border-none focus:ring-0 font-novel text-[1.15rem] text-on-surface placeholder:text-on-surface-variant/50 px-2 py-3 outline-none disabled:opacity-50 resize-none"
            placeholder={busy ? `${characterName || 'Seseorang'} sedang merespons...` : "Bicara atau lakukan sesuatu..."}
          />
          
          <button 
            onClick={submit}
            disabled={!value.trim() || busy}
            className={`
              p-3 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex-shrink-0
              \${value.trim() && !busy 
                ? 'bg-primary-container text-on-primary-container bloom-effect hover:bg-primary-container/90' 
                : 'bg-white/5 text-ink-500'}
            `}
          >
            <Send size={20} className="ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
