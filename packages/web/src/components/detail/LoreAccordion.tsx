'use client';
/**
 * LoreAccordion — expandable lore sections with first-auto-open.
 * PLANIMPv2 §2.1: Array<{title, bodyMd?, bodyHtml, order}>, ≤6 sections.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { RichContent } from '@/components/ui/RichContent';

export interface LoreSection {
  title: string;
  bodyMd?: string;
  bodyHtml: string;
  order: number;
}

export interface LoreAccordionProps {
  sections: LoreSection[];
}

export function LoreAccordion({ sections }: LoreAccordionProps) {
  const sorted = [...(sections ?? [])].sort((a, b) => a.order - b.order);
  const [openIdx, setOpenIdx] = useState<number>(0);
  if (sorted.length === 0) {
    return <p className="text-ink-500 text-sm italic">Belum ada bagian lore.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((s, i) => {
        const isOpen = openIdx === i;
        return (
          <div
            key={`${s.order}-${i}`}
            className="rounded-xl border border-ink-800 bg-ink-900/40 overflow-hidden"
          >
            <button
              onClick={() => setOpenIdx(isOpen ? -1 : i)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-ink-900/70 transition-colors"
            >
              <span className="text-sm font-semibold text-ink-100 truncate">{s.title}</span>
              <ChevronDown
                size={16}
                className={`text-ink-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div className="px-4 py-3 border-t border-ink-800 text-sm text-ink-200 leading-relaxed">
                <RichContent html={s.bodyHtml} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
