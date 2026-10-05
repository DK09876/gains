'use client';

/** The week, on Plan: pick each day's workout, or rest. Today starts from it. */

import { useEffect, useState } from 'react';

import * as api from '@/lib/api';
import type { WorkoutSummary } from '@/lib/db';
import { DAY_NAMES, type DayPlan, today, WEEK_ORDER } from '@/lib/week';

export default function WeekPlan({ workouts }: { workouts: WorkoutSummary[] }) {
  const [week, setWeek] = useState<DayPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.fetchSchedule().then(setWeek).catch((e) => setError(e.message));
  }, []);

  if (!week) return error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null;

  const change = async (day: number, plan: DayPlan) => {
    setWeek(week.map((p, i) => (i === day ? plan : p)));
    try {
      setWeek(await api.setDay(day, plan));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {WEEK_ORDER.map((day) => (
          <li key={day} className="flex items-center gap-3">
            <span className={`w-24 shrink-0 text-sm ${day === today() ? 'font-semibold text-[var(--accent)]' : ''}`}>{DAY_NAMES[day]}</span>
            <select
              value={week[day] ?? ''}
              onChange={(e) => change(day, e.target.value || null)}
              aria-label={`Workout for ${DAY_NAMES[day]}`}
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              <option value="">Nothing planned</option>
              <option value="rest">Rest</option>
              {workouts.map((w) => <option key={w.id} value={w.id}>{w.name}{w.place === 'home' ? ' (home)' : ''}</option>)}
            </select>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
