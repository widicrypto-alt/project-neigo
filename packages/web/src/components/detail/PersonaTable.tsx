'use client';
/**
 * PersonaTable — structured 4-row persona overview.
 * Maps flat Character fields (or nested persona object if present) onto
 * the PLANIMPv2 "ROADS · Divine Champion" layout.
 */
import type { Character } from '@neigo/shared';

export interface PersonaTableProps {
  character: Pick<
    Character,
    | 'age'
    | 'gender'
    | 'personality'
    | 'speechStyle'
    | 'background'
    | 'coreTraits'
    | 'dynamicTraits'
    | 'verbalHabits'
    | 'conflictStyle'
  > & {
    role?: string | null;
    classRole?: string | null;
    physicalDescription?: string | null;
    coreIdentity?: string | null;
    mannerisms?: string | null;
    history?: string | null;
  };
}

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (Array.isArray(v)) return v.filter(Boolean).join(', ') || null;
  return String(v);
}

export function PersonaTable({ character }: PersonaTableProps) {
  const physical =
    str(character.physicalDescription) ??
    ([str(character.age), str(character.gender)].filter(Boolean).join(' · ') || null);
  const identity =
    str(character.coreIdentity) ??
    str(character.personality) ??
    (character.coreTraits ? str(character.coreTraits) : null);
  const mannerisms =
    str(character.mannerisms) ??
    ([str(character.speechStyle), str(character.verbalHabits), str(character.conflictStyle)]
      .filter(Boolean)
      .join(' · ') || null);
  const history = str(character.history) ?? str(character.background);

  const rows: Array<[string, string | null]> = [
    ['Fisik', physical],
    ['Identitas Inti', identity],
    ['Perilaku', mannerisms],
    ['Riwayat', history],
  ].filter(([, v]) => v) as Array<[string, string | null]>;

  if (rows.length === 0) return null;

  const sub = str(character.role) ?? str(character.classRole);

  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/40 overflow-hidden">
      {sub && (
        <div className="px-4 py-2 border-b border-ink-800 bg-ink-900/60">
          <p className="text-[10px] uppercase tracking-widest text-violet-400">{sub}</p>
        </div>
      )}
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={label} className={i > 0 ? 'border-t border-ink-800' : ''}>
              <th className="align-top text-left px-4 py-3 w-32 text-ink-500 text-xs uppercase tracking-wide font-medium">
                {label}
              </th>
              <td className="px-4 py-3 text-ink-200 leading-relaxed">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
