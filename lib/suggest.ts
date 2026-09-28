/**
 * Suggesting new targets after a workout - only suggesting: nothing changes
 * until you say so.
 *
 * An exercise gets a suggestion when a set you ticked off was heavier than
 * its target, or when it has no target yet. A lighter day suggests nothing,
 * since one tired session is not a reason to lower the bar.
 */

export interface LoggedSet {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  done: boolean;
}

export interface Suggestion {
  exerciseId: string;
  name: string;
  from: number | null;
  to: number;
}

/** The heaviest set actually done, or null if none was done with a weight. */
export function topWeight(sets: LoggedSet[]): number | null {
  const weights = sets.filter((s) => s.done && s.weight !== null && s.weight > 0).map((s) => s.weight as number);
  return weights.length ? Math.max(...weights) : null;
}

export function suggestTargets(
  entries: Array<{ exerciseId: string | null; name: string; targetWeight: number | null; sets: LoggedSet[] }>,
  /** Targets as they are now, which may have changed since the session started. */
  current: Map<string, number | null>,
): Suggestion[] {
  const out: Suggestion[] = [];
  for (const entry of entries) {
    // An exercise deleted from the plan since has nothing to update.
    if (!entry.exerciseId || !current.has(entry.exerciseId)) continue;
    const top = topWeight(entry.sets);
    const target = current.get(entry.exerciseId) ?? null;
    if (top !== null && (target === null || top > target)) {
      out.push({ exerciseId: entry.exerciseId, name: entry.name, from: target, to: top });
    }
  }
  return out;
}

/** "95", "22.5" - weights without a trailing ".0". */
export const formatWeight = (w: number) => String(Math.round(w * 100) / 100);
