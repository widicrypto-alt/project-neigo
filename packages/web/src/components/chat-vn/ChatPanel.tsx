'use client';

import * as React from 'react';

export interface ChatPanelProps {
  story: any[];
  streamKey: number;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  title?: string;
  sending?: boolean;
}

export function ChatPanel({ story, streamKey, onScroll, title = 'Karakter', sending = false }: ChatPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll as new paragraphs arrive
  React.useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [story]);

  return (
    <div style={{
      position: 'relative',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'transparent',
    }}>
      {/* Scrollable narrative */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingTop: 120, // push down past fixed header
          paddingBottom: 220, // space for input bar
          position: 'relative',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <div style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          {story.map((node, idx) => {
            const isUser = node.role === 'USER';
            const isSystem = node.isSystem || node.role === 'SYSTEM';

            if (isSystem) {
              return (
                <div key={node.id || idx} style={{
                  textAlign: 'center', width: '100%', margin: '12px 0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', opacity: 0.6
                }}>
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.2)', flex: 1 }} />
                  <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)' }}>
                    {node.content}
                  </span>
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.2)', flex: 1 }} />
                </div>
              );
            }

            return (
              <div 
                key={node.id || idx}
                className={`
                  animate-msg rounded-2xl p-4 md:p-6 shadow-lg relative flex flex-col font-novel text-left
                  \${isUser 
                    ? 'user-bubble rounded-tr-sm self-end ml-auto' 
                    : 'glass-panel rounded-tl-sm'}
                `}
                style={{
                  maxWidth: '85%',
                  lineHeight: '1.6',
                }}
              >
                <RenderContent content={node.content || ''} />
              </div>
            );
          })}

          {/* Streaming indicator */}
          {sending && <StreamIndicator />}
        </div>
      </div>
    </div>
  );
}

// Custom renderer to format quotes vs narration
const RenderContent = ({ content }: { content: string }) => {
  if (!content) return null;

  const paragraphs = content.split('\n\n').filter(p => p.trim() !== '');

  return (
    <>
      {paragraphs.map((p, i) => {
        // Find if the paragraph is mostly dialogue or narration.
        // We can do a simple pass to highlight quotes.
        const isActionOrThought = p.startsWith('*') || p.startsWith('_');
        
        return (
          <p key={i} className="text-[1.15rem] md:text-[1.25rem] text-on-surface" style={{
            margin: i === paragraphs.length - 1 ? 0 : '0 0 16px 0',
            opacity: isActionOrThought ? 0.7 : 1,
            fontStyle: isActionOrThought ? 'italic' : 'normal',
          }}>
            {p.replace(/\*/g, '').replace(/_/g, '')}
          </p>
        );
      })}
    </>
  );
};

const StreamIndicator = () => (
  <div style={{
    padding: '16px 20px',
    width: 'fit-content',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    borderRadius: '16px',
    borderTopLeftRadius: '2px',
    background: 'rgba(0, 0, 0, 0.4)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  }}>
    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.6)', animation: 'pulse 1.5s infinite' }} />
    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.6)', animation: 'pulse 1.5s infinite 150ms' }} />
    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.6)', animation: 'pulse 1.5s infinite 300ms' }} />
  </div>
);
