'use client';

/**
 * The week, at the top of Plan: tap a day to give it a workout, rest, or
 * nothing. Today starts from it. A change is saved at once and can be undone.
 */

import { useEffect, useState } from 'react';

import WeekStrip from './WeekStrip';
import * as api from '@/lib/api';
import type { SessionSummary, WorkoutSummary } from '@/lib/db';
import { DAY_NAMES, type DayPlan, type StripDay, weekStrip } from '@/lib/week';

interface Props {
  workouts: WorkoutSummary[];
  schedule: DayPlan[];
  history: SessionSummary[];
  onChange: (schedule: DayPlan[]) => void;
}

export default function WeekPlan({ workouts, schedule, history, onChange }: Props) {
  // Only ever rendered in the browser, once Plan has loaded: the phone's day is today.
  const [now] = useState(() => new Date());
  const [picking, setPicking] = useState<StripDay | null>(null);
  const [toast, setToast] = useState<{ text: string; undo: DayPlan; weekday: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const strip = weekStrip(schedule, workouts, history, now);

  const set = async (weekday: number, plan: DayPlan, undoable = true) => {
    const before = schedule[weekday] ?? null;
    setPicking(null);
    setError(null);
    onChange(schedule.map((p, i) => (i === weekday ? plan : p)));
    try {
      onChange(await api.setDay(weekday, plan));
      const label = plan === 'rest' ? 'a rest day' : plan ? workouts.find((w) => w.id === plan)?.name : 'free';
      if (undoable) setToast({ text: `${DAY_NAMES[weekday]} is now ${label}. Saved.`, undo: before, weekday });
    } catch (e) {
      onChange(schedule);
      setError(e instanceof Error ? e.message : 'Could not save that day');
    }
  };

  return (
    <div>
      <WeekStrip days={strip.days} done={strip.done} planned={strip.planned} onPick={setPicking} title="Your week" />
      <p className="mt-1.5 text-xs text-[var(--muted)]">Tap a day to change it. Today starts from this.</p>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>}

      {picking && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button aria-label="Close" onClick={() => setPicking(null)} className="absolute inset-0 bg-black/60" />
          <section role="dialog" aria-modal="true" aria-labelledby="day-title" className="relative max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-[var(--border)] bg-[var(--surface)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
            <h2 id="day-title" className="text-lg font-bold">{DAY_NAMES[picking.weekday]}</h2>
            <ul className="mt-3 flex flex-col gap-1.5">
              {workouts.map((w) => (
                <li key={w.id}>
                  <button onClick={() => set(picking.weekday, w.id)} className={`flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left ${picking.workoutId === w.id ? 'bg-[var(--accent)] font-bold text-[var(--on-accent)]' : 'bg-[var(--background)]'}`}>
                    <span>{w.name}{w.place === 'home' ? ' (home)' : ''}</span>
                    {picking.workoutId === w.id && <span>✓</span>}
                  </button>
                </li>
              ))}
              <li>
                <button onClick={() => set(picking.weekday, 'rest')} className={`w-full rounded-xl px-4 py-3.5 text-left ${picking.label === 'Rest' ? 'bg-[var(--accent)] font-bold text-[var(--on-accent)]' : 'bg-[var(--background)]'}`}>Rest day</button>
              </li>
              <li>
                <button onClick={() => set(picking.weekday, null)} className="w-full rounded-xl px-4 py-3.5 text-left text-[var(--muted)]">Nothing planned</button>
              </li>
            </ul>
          </section>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-[var(--foreground)] px-4 py-3 text-[var(--background)] shadow-lg">
          <span className="flex-1">{toast.text}</span>
          <button onClick={() => { set(toast.weekday, toast.undo, false); setToast(null); }} className="px-2 py-2 font-bold text-[#2f5d9e]">Undo</button>
        </div>
      )}
    </div>
  );
}
