'use client';

import * as React from 'react';
import { m } from 'framer-motion';
import type { RoleplayMessage } from '../_context/RoleplaySessionContext';

// ── Tokenizer: separate dialogue from inline actions ──────────────────────────
const tokenizeRP = (text: string) => {
  const tokens: { type: 'dialogue' | 'action' | 'text'; text: string }[] = [];
  const regex = /("([^"]*)")|(\*([^*]+)\*)|(_([^_]+)_)|([^"*_]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) tokens.push({ type: 'dialogue', text: match[2] ?? '' });
    else if (match[3]) tokens.push({ type: 'action', text: match[4] ?? '' });
    else if (match[5]) tokens.push({ type: 'action', text: match[6] ?? '' });
    else if (match[7]?.trim()) tokens.push({ type: 'text', text: match[7] });
  }
  return tokens;
};

// ── System divider ────────────────────────────────────────────────────────────
const SystemMessage = ({ text }: { text: string }) => (
  <div style={{
    textAlign: 'center', width: '100%', margin: '20px 0',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', opacity: 0.5,
  }}>
    <div style={{ height: '1px', background: 'rgba(255,255,255,0.15)', flex: 1 }} />
    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', fontFamily: 'sans-serif' }}>
      {text}
    </span>
    <div style={{ height: '1px', background: 'rgba(255,255,255,0.15)', flex: 1 }} />
  </div>
);

// ── Character bubble (glass-panel, left-aligned, rounded-tl-sm) ───────────────
const CharacterBubble = ({ msg }: { msg: RoleplayMessage }) => {
  const tokens = tokenizeRP(msg.text);
  return (
    <m.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{
        alignSelf: 'flex-start',
        maxWidth: '85%',
        padding: '16px 20px',
        borderRadius: '20px 20px 20px 4px',
        background: 'rgba(18, 18, 18, 0.85)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      }}
    >
      <p style={{
        margin: 0,
        fontFamily: '"Crimson Text", Georgia, serif',
        fontSize: '1.15rem',
        lineHeight: '1.75',
        color: 'rgba(229, 226, 225, 0.95)',
      }}>
        {tokens.map((tok, i) => {
          if (tok.type === 'dialogue') return (
            <span key={i} style={{ color: 'rgba(255, 248, 235, 0.97)' }}>
              &ldquo;{tok.text}&rdquo;
            </span>
          );
          if (tok.type === 'action') return (
            <span key={i} style={{ color: 'rgba(229, 226, 225, 0.6)', fontStyle: 'italic' }}>
              {' '}{tok.text}{' '}
            </span>
          );
          return <span key={i}>{tok.text}</span>;
        })}
      </p>
      {/* Optional inline narration (separate field) */}
      {msg.narration && (
        <p style={{
          margin: '10px 0 0 0',
          fontFamily: '"Crimson Text", Georgia, serif',
          fontSize: '1rem',
          lineHeight: '1.65',
          color: 'rgba(229, 226, 225, 0.55)',
          fontStyle: 'italic',
        }}>
          {msg.narration}
        </p>
      )}
    </m.div>
  );
};

// ── User bubble (purple gradient, right-aligned, rounded-tr-sm) ───────────────
const UserBubble = ({ msg }: { msg: RoleplayMessage }) => (
  <m.div
    initial={{ opacity: 0, y: 16, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    style={{
      alignSelf: 'flex-end',
      maxWidth: '80%',
      padding: '14px 18px',
      borderRadius: '20px 4px 20px 20px',
      background: 'linear-gradient(135deg, rgba(89,72,206,0.3) 0%, rgba(109,94,227,0.1) 100%)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(138,115,255,0.35)',
      borderRight: '3px solid rgba(138,115,255,0.75)',
      boxShadow: '0 4px 20px -2px rgba(109,94,227,0.15)',
    }}
  >
    <p style={{
      margin: 0,
      fontFamily: '"Crimson Text", Georgia, serif',
      fontSize: '1.15rem',
      lineHeight: '1.75',
      color: 'rgba(229, 226, 225, 0.9)',
      fontStyle: 'italic',
    }}>
      {msg.text}
    </p>
  </m.div>
);

// ── Typing indicator (3 dots + character name) ────────────────────────────────
export const TypingIndicator = ({ name }: { name: string }) => (
  <m.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 8 }}
    style={{
      alignSelf: 'flex-start',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px 16px',
      borderRadius: '20px 20px 20px 4px',
      background: 'rgba(18, 18, 18, 0.75)',
      backdropFilter: 'blur(24px)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {[0, 150, 300].map(delay => (
        <div key={delay} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'rgba(255,255,255,0.45)',
          animation: `pulse 1.4s ease-in-out infinite`,
          animationDelay: `${delay}ms`,
        }} />
      ))}
    </div>
    <span style={{
      fontSize: '0.8rem',
      color: 'rgba(255,255,255,0.35)',
      fontStyle: 'italic',
      fontFamily: 'sans-serif',
      letterSpacing: '0.03em',
    }}>
      {name} is typing…
    </span>
  </m.div>
);

// ── Main export ───────────────────────────────────────────────────────────────
export const MessageBubble = ({ msg }: { msg: RoleplayMessage }) => {
  if (msg.role === 'system') return <SystemMessage text={msg.text} />;
  if (msg.role === 'user') return <UserBubble msg={msg} />;
  return <CharacterBubble msg={msg} />;
};
