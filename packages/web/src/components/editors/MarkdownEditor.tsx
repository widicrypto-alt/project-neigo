'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { estimateTokensFast } from '@neigo/shared';
import { cn } from '@/lib/cn';

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  maxChars?: number;
  /** Token budget warning threshold. */
  warnTokens?: number;
  minRows?: number;
  label?: string;
  disabled?: boolean;
}

/**
 * Lightweight Markdown editor with token counter.
 * Uses a plain <textarea> to avoid heavy bundle from @uiw/react-md-editor.
 * Token count is estimated client-side with estimateTokensFast from @neigo/shared.
 *
 * BACKLOG B2.13 — paste handler converts pasted HTML (e.g. Google Docs,
 * Notion, browser selection) to Markdown via lazy-loaded `turndown`.
 * Plain text paste falls through to the default browser behavior.
 */
let _td: import('turndown') | null = null;
async function getTurndown() {
  if (_td) return _td;
  const TurndownService = (await import('turndown')).default;
  _td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });
  return _td;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Tulis dengan Markdown…',
  maxChars,
  warnTokens = 2000,
  minRows = 5,
  label,
  disabled,
}: Props) {
  const tokens = estimateTokensFast(value);
  const chars = value.length;
  const overToken = tokens > warnTokens;
  const overChar = maxChars ? chars > maxChars : false;
  const taRef = useRef<HTMLTextAreaElement>(null);

  const onPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const html = e.clipboardData.getData('text/html');
      if (!html || html.trim().length === 0) return; // let browser handle plain text
      e.preventDefault();
      const td = await getTurndown();
      const md = td.turndown(html);
      const ta = e.currentTarget;
      const start = ta.selectionStart ?? value.length;
      const end = ta.selectionEnd ?? value.length;
      const next = value.slice(0, start) + md + value.slice(end);
      onChange(next);
      // restore caret after react re-render
      requestAnimationFrame(() => {
        if (taRef.current) {
          const pos = start + md.length;
          taRef.current.selectionStart = taRef.current.selectionEnd = pos;
        }
      });
    },
    [value, onChange],
  );

  const rows = Math.max(minRows, Math.min(30, value.split('\n').length + 2));

  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-ink-300">{label}</label>}
      <div className={cn('rounded-lg border overflow-hidden transition-colors', overChar ? 'border-red-500' : 'border-ink-700 focus-within:border-violet-500')}>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          maxLength={maxChars}
          className="w-full bg-ink-900 px-3 py-2 text-sm font-mono text-ink-200 placeholder-ink-600 resize-y focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center justify-between px-3 py-1 bg-ink-900/50 border-t border-ink-800 text-xs text-ink-600">
          <span>Markdown didukung · paste HTML otomatis dikonversi</span>
          <div className="flex items-center gap-3">
            {maxChars && (
              <span className={overChar ? 'text-red-400' : ''}>{chars.toLocaleString()} / {maxChars.toLocaleString()} chars</span>
            )}
            <span className={overToken ? 'text-amber-400' : ''}>
              ~{tokens.toLocaleString()} token{overToken && ' ⚠️'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
