'use client';

/**
 * What a finished workout did. It leads with what went up - new bests, a
 * heavier top set, more reps - because that is the reason to come back; then
 * the targets worth raising (nothing changes unless you tap); then every
 * exercise, with the warm-up as one line.
 */

import { useState } from 'react';

import * as api from '@/lib/api';
import { durationText, setsText, UNIT } from '@/lib/format';
import type { Progress } from '@/lib/progress';
import { formatWeight } from '@/lib/suggest';

interface Props {
  result: api.SessionResult;
  /** This week so far, when the summary is shown straight after finishing. */
  week?: { done: number; planned: number };
}

function change(p: Progress): React.ReactNode {
  const w = (n: number | null) => formatWeight(n ?? 0);
  if (p.kind === 'timed') return <>{p.before.reps} → <b className="text-[var(--foreground)]">{p.now.reps}</b> s</>;
  if ((p.now.weight ?? 0) > (p.before.weight ?? 0)) return <>{w(p.before.weight)} → <b className="text-[var(--foreground)]">{w(p.now.weight)}</b> {UNIT}</>;
  return <>{p.before.reps} → <b className="text-[var(--foreground)]">{p.now.reps}</b> reps at {w(p.now.weight)} {UNIT}</>;
}

const Star = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
    <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="var(--best)" />
  </svg>
);
const Up = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
    <path d="M5 15l7-7 7 7" stroke="var(--accent)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Summary({ result, week }: Props) {
  const { session, suggestions, progress } = result;
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const isDone = (e: (typeof session.entries)[number]) => e.logged.some((s) => s.done);
  // Check-off exercises are one line together; only what has sets is counted and listed.
  const checks = session.entries.filter((e) => e.kind === 'check');
  const work = session.entries.filter((e) => e.kind !== 'check');
  const done = work.filter(isDone);
  const bests = progress.filter((p) => p.best).length;

  const apply = async (exerciseId: string, to: number) => {
    setError(null);
    try {
      await api.updateExercise(exerciseId, { targetWeight: to });
      setApplied((a) => new Set(a).add(exerciseId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the target');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className={`text-2xl font-extrabold ${bests ? 'text-[var(--best)]' : ''}`}>{bests}</p>
          <p className="text-xs text-[var(--muted)]">new best{bests === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="whitespace-nowrap text-xl font-extrabold leading-8">{session.finishedAt ? durationText(session.startedAt, session.finishedAt) : '–'}</p>
          <p className="text-xs text-[var(--muted)]">{done.length} of {work.length} exercises</p>
        </div>
        {week && week.planned > 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-2xl font-extrabold text-[var(--accent)]">{week.done}<span className="text-sm font-semibold text-[var(--muted)]">/{week.planned}</span></p>
            <p className="text-xs text-[var(--muted)]">days this week</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-2xl font-extrabold">{done.reduce((n, e) => n + e.logged.filter((s) => s.done).length, 0)}</p>
            <p className="text-xs text-[var(--muted)]">sets</p>
          </div>
        )}
      </div>

      {progress.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">What went up</h2>
          {progress.map((p) => (
            <div key={p.exerciseId} className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
              {p.best ? <Star /> : <Up />}
              <span className="min-w-0 flex-1 truncate">{p.name}{p.best && <span className="sr-only"> (new best)</span>}</span>
              <span className="tabular shrink-0 text-sm text-[var(--muted)]">{change(p)}</span>
            </div>
          ))}
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-4">
          <h2 className="font-semibold">Raise your targets?</h2>
          <p className="mt-0.5 text-sm text-[var(--muted)]">You went heavier than planned. Nothing changes unless you say so.</p>
          {error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
          <ul className="mt-3 flex flex-col gap-2">
            {suggestions.map((s) => (
              <li key={s.exerciseId} className="flex items-center gap-3 rounded-lg bg-[var(--surface)] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="tabular text-sm text-[var(--muted)]">
                    {s.from === null ? 'No target' : `${formatWeight(s.from)} ${UNIT}`} → <span className="text-[var(--foreground)]">{formatWeight(s.to)} {UNIT}</span>
                  </p>
                </div>
                {applied.has(s.exerciseId) ? (
                  <span className="text-sm text-[var(--accent)]">Updated ✓</span>
                ) : (
                  <button onClick={() => apply(s.exerciseId, s.to)} className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-3 text-sm font-semibold text-[var(--on-accent)]">
                    Set to {formatWeight(s.to)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="flex flex-col divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {checks.length > 0 && (
          <li className="flex items-baseline gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate">{/warm/i.test(checks[0].section) ? 'Warm-ups' : 'Checked off'}</span>
            <span className="tabular shrink-0 text-right text-sm text-[var(--muted)]">{checks.filter(isDone).length} of {checks.length} done</span>
          </li>
        )}
        {work.map((e) => (
          <li key={e.id} className="flex items-baseline gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            <span className="tabular shrink-0 text-right text-sm text-[var(--muted)]">
              {isDone(e) ? setsText(e.logged, e.kind) : <span className="opacity-60">skipped</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
