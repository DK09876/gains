'use client';

/**
 * Today: the workout under way, or a choice of which one to do. Finishing
 * shows how it went and any targets worth raising, then comes back here.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import PlaceTabs from '@/components/PlaceTabs';
import SessionView from '@/components/SessionView';
import Summary from '@/components/Summary';
import * as api from '@/lib/api';
import type { Session, WorkoutSummary } from '@/lib/db';
import { dayText } from '@/lib/format';
import { usePlace } from '@/lib/place';
import { DAY_NAMES, type DayPlan, today } from '@/lib/week';

export default function Today() {
  const [active, setActive] = useState<Session | null>(null);
  const [all, setWorkouts] = useState<WorkoutSummary[] | null>(null);
  const [finished, setFinished] = useState<api.SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [week, setWeek] = useState<DayPlan[]>([]);
  const place = usePlace();
  const workouts = all?.filter((w) => w.place === place) ?? null;

  const load = useCallback(() => {
    Promise.all([api.fetchSessions(), api.fetchWorkouts(), api.fetchSchedule()])
      .then(([sessions, found, schedule]) => {
        setError(null);
        setActive(sessions.active);
        setWorkouts(found);
        setWeek(schedule);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not reach the server'));
  }, []);

  useEffect(load, [load]);

  const start = async (id: string) => {
    setStarting(id);
    try {
      setActive(await api.startSession(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start that workout');
    } finally {
      setStarting(null);
    }
  };

  if (finished) {
    return (
      <div>
        <h1 className="text-2xl font-bold">{finished.session.workoutName} done</h1>
        <Summary result={finished} />
        <button onClick={() => { setFinished(null); load(); }} className="mt-6 w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-[var(--on-accent)]">
          Done
        </button>
      </div>
    );
  }

  if (active) {
    return (
      <SessionView
        key={active.id}
        session={active}
        onFinished={(result) => { setActive(null); setFinished(result); }}
        onDiscarded={() => { setActive(null); load(); }}
      />
    );
  }

  // The day's workout from Plan's week, if one is set and still exists.
  const day = today();
  const plan = week[day] ?? null;
  const planned = plan && plan !== 'rest' ? all?.find((w) => w.id === plan) : undefined;

  return (
    <div>
      <h1 className="text-2xl font-bold">Today&apos;s workout</h1>
      {planned ? (
        <button
          onClick={() => start(planned.id)}
          disabled={!!starting}
          className="mt-4 w-full rounded-2xl bg-[var(--accent)] p-4 text-left text-[var(--on-accent)] disabled:opacity-60"
        >
          <span className="block text-sm opacity-80">{DAY_NAMES[day]}</span>
          <span className="block text-xl font-bold">{planned.name}</span>
          <span className="mt-1 block text-sm opacity-80">
            {starting === planned.id ? 'Starting…' : `${planned.exerciseCount} exercise${planned.exerciseCount === 1 ? '' : 's'} · tap to start`}
          </span>
        </button>
      ) : plan === 'rest' ? (
        <p className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <span className="block text-sm text-[var(--muted)]">{DAY_NAMES[day]}</span>
          <span className="block text-xl font-bold">Rest day</span>
        </p>
      ) : null}
      <p className="mt-4 text-sm text-[var(--muted)]">{planned || plan === 'rest' ? 'Or pick another.' : 'Pick one to start.'}</p>
      <PlaceTabs />
      {error && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
      {!workouts && !error && <p className="mt-6 text-sm text-[var(--muted)]">Loading…</p>}
      {workouts?.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--border)] p-6 text-center">
          <p>No {place} workouts yet.</p>
          <Link href="/plan" className="mt-3 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--on-accent)]">
            Make one, or import your sheet
          </Link>
        </div>
      )}
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {workouts?.map((w) => (
          <li key={w.id}>
            <button
              onClick={() => start(w.id)}
              disabled={!!starting}
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left hover:border-[var(--accent)] disabled:opacity-60"
            >
              <span className="block text-lg font-semibold">{w.name}</span>
              <span className="mt-1 block text-sm text-[var(--muted)]">
                {w.exerciseCount} exercise{w.exerciseCount === 1 ? '' : 's'}
                {w.lastDone ? ` · last done ${dayText(w.lastDone).replace(/^(Today|Yesterday)$/, (d) => d.toLowerCase())}` : ' · not done yet'}
              </span>
              {starting === w.id && <span className="mt-2 block text-sm text-[var(--accent)]">Starting…</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
