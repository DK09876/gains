'use client';

/**
 * Today: the workout under way, or a choice of which one to do. Finishing
 * shows how it went and any targets worth raising, then comes back here.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import PlaceTabs from '@/components/PlaceTabs';
import SessionView from '@/components/SessionView';
import StaleWorkout, { STALE_AFTER_MS } from '@/components/StaleWorkout';
import StartFromPlan from '@/components/StartFromPlan';
import Summary from '@/components/Summary';
import WeekStrip from '@/components/WeekStrip';
import * as api from '@/lib/api';
import type { Session, SessionSummary, WorkoutSummary } from '@/lib/db';
import { usePlace } from '@/lib/place';
import { DAY_NAMES, type DayPlan, weekStrip, workoutWeekNote } from '@/lib/week';

export default function Today() {
  const [active, setActive] = useState<Session | null>(null);
  const [all, setWorkouts] = useState<WorkoutSummary[] | null>(null);
  const [finished, setFinished] = useState<api.SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [week, setWeek] = useState<DayPlan[]>([]);
  const [history, setHistory] = useState<SessionSummary[]>([]);
  // Read once per load: the phone's own day decides what today is.
  const [now, setNow] = useState<Date | null>(null);
  // A workout in progress that was started long ago: ask about it before resuming it.
  const [stale, setStale] = useState(false);
  const place = usePlace();
  const workouts = all?.filter((w) => w.place === place) ?? null;

  const load = useCallback(() => {
    // Sets left on this phone by a dropped connection go first, so the workout loads with them.
    api.setOutbox().flush().catch(() => {}).then(() => Promise.all([api.fetchSessions(), api.fetchWorkouts(), api.fetchSchedule()])
      .then(([sessions, found, schedule]) => {
        setError(null);
        setActive(sessions.active);
        setStale(!!sessions.active && Date.now() - Date.parse(sessions.active.startedAt) > STALE_AFTER_MS);
        setWorkouts(found);
        setWeek(schedule);
        setHistory(sessions.history);
        setNow(new Date());
      }))
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

  // The week including the workout just finished, which the strip has not caught up with yet.
  const finishedWeek = (() => {
    if (!finished || !now || !all) return undefined;
    const before = weekStrip(week, all, history, now);
    const counted = before.days.find((d) => d.isToday)?.state === 'done';
    const trained = finished.session.entries.some((e) => e.logged.some((s) => s.done));
    return { done: before.done + (trained && !counted ? 1 : 0), planned: before.planned };
  })();

  if (finished) {
    return (
      <div>
        <h1 className="mb-4 text-3xl font-extrabold">{finished.session.workoutName} done</h1>
        <Summary result={finished} week={finishedWeek} />
        <button onClick={() => { setFinished(null); load(); }} className="mt-6 w-full rounded-xl bg-[var(--accent)] py-3 font-semibold text-[var(--on-accent)]">
          Done
        </button>
      </div>
    );
  }

  if (active && stale) {
    return (
      <StaleWorkout
        session={active}
        onCarryOn={() => setStale(false)}
        onDiscarded={() => { setActive(null); setStale(false); load(); }}
        onFinished={(result) => { setActive(null); setStale(false); setFinished(result); }}
      />
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

  // A brand new profile: offer a friend's whole plan instead of an empty screen.
  if (all && all.length === 0) return <StartFromPlan onCopied={load} />;

  // The day's workout from Plan's week, if one is set and still exists.
  const strip = now && all ? weekStrip(week, all, history, now) : null;
  const todayCell = strip?.days.find((d) => d.isToday);
  const plan = now ? week[now.getDay()] ?? null : null;
  const planned = plan && plan !== 'rest' ? all?.find((w) => w.id === plan) : undefined;
  const others = workouts?.filter((w) => w.id !== planned?.id) ?? null;
  const showPlaces = !!all?.some((w) => w.place === 'home') || place === 'home';

  return (
    <div className="flex flex-col gap-5">
      {strip && strip.planned > 0 && <WeekStrip days={strip.days} done={strip.done} planned={strip.planned} />}

      {planned && now ? (
        <button
          onClick={() => start(planned.id)}
          disabled={!!starting}
          className="w-full rounded-3xl bg-[var(--accent)] p-5 text-left text-[var(--on-accent)] disabled:opacity-60"
        >
          <span className="block text-sm opacity-80">{DAY_NAMES[now.getDay()]}{todayCell?.state === 'done' ? ' · trained already' : ''}</span>
          <span className="block text-3xl font-extrabold">{planned.name}</span>
          <span className="mt-1 block text-sm opacity-85">{countText(planned)}</span>
          <span className="mt-3 inline-block rounded-xl bg-[var(--on-accent)] px-5 py-2.5 font-bold text-[var(--accent)]">
            {starting === planned.id ? 'Starting…' : `Start ${planned.name}`}
          </span>
        </button>
      ) : plan === 'rest' && now ? (
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <span className="block text-sm text-[var(--muted)]">{DAY_NAMES[now.getDay()]}</span>
          <span className="block text-3xl font-extrabold">Rest day</span>
          <span className="mt-1 block text-sm text-[var(--muted)]">Recovery is part of the plan. Or pick something below.</span>
        </div>
      ) : (
        <h1 className="text-2xl font-bold">Today&apos;s workout</h1>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{planned || plan === 'rest' ? 'Or do something else' : 'Pick one to start'}</h2>
        {showPlaces && <PlaceTabs />}
        {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
        {!workouts && !error && <p className="text-sm text-[var(--muted)]">Loading…</p>}
        {workouts?.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center">
            <p>No {place} workouts yet.</p>
            <Link href="/plan" className="mt-3 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--on-accent)]">
              Make one, or import your sheet
            </Link>
          </div>
        )}
        {others && others.length > 0 && (
          <ul className="flex flex-col divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            {others.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => start(w.id)}
                  disabled={!!starting}
                  className="flex w-full items-baseline justify-between gap-3 px-4 py-3.5 text-left disabled:opacity-60"
                >
                  <span className="font-semibold">{w.name}</span>
                  <span className="text-sm text-[var(--muted)]">
                    {starting === w.id ? 'Starting…' : strip ? workoutWeekNote(w.id, strip.days) : countText(w)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** "2 warm-ups · 8 exercises". */
function countText(w: WorkoutSummary): string {
  const lifts = w.exerciseCount - w.checkCount;
  return [w.checkCount ? `${w.checkCount} warm-up${w.checkCount === 1 ? '' : 's'}` : '', `${lifts} exercise${lifts === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
}
