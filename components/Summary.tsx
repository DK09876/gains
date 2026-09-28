'use client';

/**
 * What a finished workout did, and the targets it suggests raising. Nothing
 * changes unless you tap to accept - a suggestion is only a suggestion.
 */

import { useState } from 'react';

import * as api from '@/lib/api';
import { durationText, setsText, targetText, UNIT } from '@/lib/format';
import { formatWeight } from '@/lib/suggest';

export default function Summary({ result }: { result: api.SessionResult }) {
  const { session, suggestions } = result;
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const done = session.entries.filter((e) => e.logged.some((s) => s.done));
  const sets = done.reduce((n, e) => n + e.logged.filter((s) => s.done).length, 0);

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
    <div>
      {session.finishedAt && (
        <p className="text-sm text-[var(--muted)]">
          {durationText(session.startedAt, session.finishedAt)} · {done.length} exercise{done.length === 1 ? '' : 's'} · {sets} set{sets === 1 ? '' : 's'}
        </p>
      )}

      {suggestions.length > 0 && (
        <section className="mt-4 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-4">
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
                  <button onClick={() => apply(s.exerciseId, s.to)} className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--on-accent)]">
                    Set to {formatWeight(s.to)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="mt-4 flex flex-col divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {session.entries.map((e) => (
          <li key={e.id} className="flex items-baseline gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            <span className="tabular shrink-0 text-right text-sm text-[var(--muted)]">
              {e.logged.some((s) => s.done) ? setsText(e.logged) : <span className="opacity-60">skipped{targetText(e) ? ` · ${targetText(e)}` : ''}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
