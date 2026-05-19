/**
 * Session date/time helpers (string-based).
 * Port of SessionDateManager.kt (logic only).
 */
export const DEFAULT_DATE = 'Day 1';

export function advanceDateString(current: string): string {
  const dayMatch = current.match(/^Day\s+(\d+)$/i);
  if (dayMatch && dayMatch[1]) return `Day ${parseInt(dayMatch[1], 10) + 1}`;
  const iso = current.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso && iso[1] && iso[2] && iso[3]) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  return current;
}

export function buildDateContext(
  currentDate: string,
  previousDate?: string | null,
  time?: string | null,
): string {
  const parts: string[] = [];
  parts.push(currentDate);
  if (time) parts.push(time);
  const joined = parts.join(', ');
  if (previousDate && previousDate !== currentDate) {
    return `${joined} (previously ${previousDate})`;
  }
  return joined;
}
