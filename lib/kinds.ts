/**
 * What kind of thing an exercise is, which decides how it is logged:
 *
 *   lift   sets of weight × reps, with a rest timer between them
 *   timed  sets held for a number of seconds - a plank - with a countdown
 *   check  done or not - a walk, a stretch, mobility - one tap
 *
 * Client-safe: the plan editor and the workout screen both use it.
 */

export const KINDS = ['lift', 'timed', 'check'] as const;
export type Kind = (typeof KINDS)[number];
export const isKind = (x: unknown): x is Kind => KINDS.includes(x as Kind);

export const KIND_LABELS: Record<Kind, string> = { lift: 'Lift', timed: 'Timed', check: 'Check off' };

/** Seconds of rest between sets when an exercise does not say. */
export const DEFAULT_REST = 90;

const SECONDS = /\d+\s*(?:s|sec|secs|second|seconds)\b/i;
const WARM_UP = /warm/i;

/**
 * A sensible kind for an exercise from what is known about it: "45-60 s" is
 * held, anything in a warm-up section is checked off, everything else is lifted.
 */
export function guessKind(section: string, reps: string): Kind {
  if (SECONDS.test(reps)) return 'timed';
  if (WARM_UP.test(section)) return 'check';
  return 'lift';
}

/** The goal of a timed set in seconds - "45-60 s" aims for 45 - or null if it gives none. */
export function goalSeconds(reps: string): number | null {
  const m = /(\d+)/.exec(reps);
  return m ? Number(m[1]) : null;
}

/** "0:45", "1:05". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
