/** How targets, sets and dates read on screen. */

import { formatWeight, type LoggedSet } from './suggest';

export const UNIT = 'lb';

export function weightText(weight: number | null, note = ''): string {
  if (weight === null) return note;
  return [`${formatWeight(weight)} ${UNIT}`, note].filter(Boolean).join(' ');
}

/** "3 × 10 · 95 lb each" - whichever parts are set. */
export function targetText(t: { sets: number | null; reps: string; targetWeight: number | null; weightNote: string }): string {
  const volume = t.sets && t.reps ? `${t.sets} × ${t.reps}` : t.sets ? `${t.sets} sets` : t.reps ? `${t.reps} reps` : '';
  return [volume, weightText(t.targetWeight, t.weightNote)].filter(Boolean).join(' · ');
}

/** "95×10, 100×8" - the sets that were done. */
export function setsText(sets: LoggedSet[]): string {
  return sets.filter((s) => s.done).map((s) => {
    const w = s.weight !== null ? formatWeight(s.weight) : '';
    const r = s.reps !== null ? String(s.reps) : '';
    return w && r ? `${w}×${r}` : w ? `${w} ${UNIT}` : r ? `${r} reps` : '✓';
  }).join(', ');
}

export function dayText(iso: string): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function durationText(fromIso: string, toIso: string | null): string {
  const minutes = Math.max(0, Math.round(((toIso ? new Date(toIso) : new Date()).getTime() - new Date(fromIso).getTime()) / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** The first whole number in a reps target - "8-12" starts at 8. */
export const repsGuess = (reps: string): number | null => {
  const m = /\d+/.exec(reps);
  return m ? Number(m[0]) : null;
};
