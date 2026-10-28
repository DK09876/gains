/**
 * What went up in a workout, against the time before: a heavier top set, more
 * reps at the same weight, a longer hold. A set heavier (or longer) than any
 * before it is a new best - but a first time is a first time, not a best.
 */

import type { Kind } from './kinds';
import type { LoggedSet } from './suggest';

export interface Progress {
  exerciseId: string;
  name: string;
  kind: Kind;
  /** The best set done today and the time before; weight null for a timed set. */
  now: { weight: number | null; reps: number | null };
  before: { weight: number | null; reps: number | null };
  /** Heavier, or longer, than anything ever logged for it before. */
  best: boolean;
}

/** The set that counts: heaviest, then most reps - or for a timed set, longest. */
export function topSet(sets: LoggedSet[], kind: Kind): { weight: number | null; reps: number | null } | null {
  const done = sets.filter((s) => s.done);
  if (!done.length) return null;
  const score = (s: LoggedSet) => (kind === 'timed' ? [s.reps ?? 0, 0] : [s.weight ?? 0, s.reps ?? 0]);
  const top = done.reduce((a, b) => {
    const [a1, a2] = score(a);
    const [b1, b2] = score(b);
    return b1 > a1 || (b1 === a1 && b2 > a2) ? b : a;
  });
  return { weight: kind === 'timed' ? null : top.weight, reps: top.reps };
}

export function progressOf(
  entries: Array<{ exerciseId: string | null; name: string; kind: Kind; logged: LoggedSet[]; last: { sets: LoggedSet[] } | null }>,
  /** Per exercise, the most ever lifted (or held, in seconds) before this workout. */
  bestBefore: Map<string, number>,
): Progress[] {
  const out: Progress[] = [];
  for (const e of entries) {
    if (!e.exerciseId || e.kind === 'check' || !e.last) continue;
    const now = topSet(e.logged, e.kind);
    const before = topSet(e.last.sets, e.kind);
    if (!now || !before) continue;
    const measure = (s: { weight: number | null; reps: number | null }) => (e.kind === 'timed' ? s.reps ?? 0 : s.weight ?? 0);
    const up = measure(now) > measure(before)
      || (e.kind === 'lift' && (now.weight ?? 0) === (before.weight ?? 0) && (now.reps ?? 0) > (before.reps ?? 0));
    if (!up) continue;
    const previous = bestBefore.get(e.exerciseId);
    out.push({ exerciseId: e.exerciseId, name: e.name, kind: e.kind, now, before, best: previous !== undefined && measure(now) > previous });
  }
  // Bests first, then the rest in workout order.
  return [...out.filter((p) => p.best), ...out.filter((p) => !p.best)];
}
