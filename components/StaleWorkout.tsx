'use client';

/**
 * A workout started hours ago and never finished. Rather than drop you back
 * into it with a timer reading "22 h", Today asks what happened: throw it away
 * if nothing was done, finish it if something was, or carry on.
 */

import { useState } from 'react';

import * as api from '@/lib/api';
import type { Session } from '@/lib/db';
import { dayText } from '@/lib/format';

interface Props {
  session: Session;
  onCarryOn: () => void;
  onDiscarded: () => void;
  onFinished: (result: api.SessionResult) => void;
}

/** Older than this, a workout in progress is probably one that was forgotten. */
export const STALE_AFTER_MS = 4 * 60 * 60 * 1000;

export default function StaleWorkout({ session, onCarryOn, onDiscarded, onFinished }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sets = session.entries.reduce((n, e) => n + e.logged.filter((s) => s.done).length, 0);
  const started = new Date(session.startedAt);
  const day = dayText(session.startedAt);
  const when = `${/^(Today|Yesterday)$/.test(day) ? day.toLowerCase() : day} at ${started.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  };
  const discard = () => run(async () => { await api.deleteSession(session.id); onDiscarded(); });
  const finish = () => run(async () => onFinished(await api.finishSession(session.id)));

  return (
    <section role="dialog" aria-labelledby="stale-title" className="mt-6 flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h1 id="stale-title" className="text-xl font-bold leading-tight">You left {session.workoutName} open</h1>
      <p className="text-[var(--muted)]">
        Started {when}. {sets ? `You logged ${sets} set${sets === 1 ? '' : 's'}.` : "Nothing was logged, so there's nothing to keep."}
      </p>
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      {sets ? (
        <button onClick={finish} disabled={busy} className="rounded-xl bg-[var(--accent)] py-3.5 font-bold text-[var(--on-accent)] disabled:opacity-50">
          Finish it with what I logged
        </button>
      ) : (
        <button onClick={discard} disabled={busy} className="rounded-xl bg-[var(--accent)] py-3.5 font-bold text-[var(--on-accent)] disabled:opacity-50">
          Throw it away and see today
        </button>
      )}
      <button onClick={onCarryOn} disabled={busy} className="rounded-xl border border-[var(--border)] py-3.5 font-semibold disabled:opacity-50">
        Carry on with {session.workoutName}
      </button>
      {sets > 0 && (
        <button onClick={discard} disabled={busy} className="py-2 text-sm text-[var(--danger)] disabled:opacity-50">Throw it away instead</button>
      )}
      <p className="text-center text-xs text-[var(--muted)]">Workouts left open close by themselves after 12 hours, keeping any sets you logged.</p>
    </section>
  );
}
