'use client';

/** Your workouts: make one, put them in order, import a sheet, or copy a friend's. */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import CopyWorkout from '@/components/CopyWorkout';
import ImportSheet from '@/components/ImportSheet';
import * as api from '@/lib/api';
import type { WorkoutSummary } from '@/lib/db';

export default function Plan() {
  const router = useRouter();
  const [workouts, setWorkouts] = useState<WorkoutSummary[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.fetchWorkouts().then(setWorkouts).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const move = async (index: number, by: number) => {
    if (!workouts) return;
    const order = workouts.map((w) => w.id);
    [order[index], order[index + by]] = [order[index + by], order[index]];
    setWorkouts(order.map((id) => workouts.find((w) => w.id === id)!));
    try {
      setWorkouts(await api.reorderWorkouts(order));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reorder');
      load();
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Plan</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Your workouts, their exercises, targets and clips.</p>
      {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}

      <ul className="mt-5 flex flex-col gap-2">
        {workouts?.map((w, i) => (
          <li key={w.id} className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <Link href={`/plan/${w.id}`} className="min-w-0 flex-1 px-4 py-3">
              <span className="block truncate font-semibold">{w.name}</span>
              <span className="block text-sm text-[var(--muted)]">{w.exerciseCount} exercise{w.exerciseCount === 1 ? '' : 's'}</span>
            </Link>
            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${w.name} up`} className="p-3 text-[var(--muted)] disabled:opacity-20">↑</button>
            <button onClick={() => move(i, 1)} disabled={i === workouts.length - 1} aria-label={`Move ${w.name} down`} className="p-3 pr-4 text-[var(--muted)] disabled:opacity-20">↓</button>
          </li>
        ))}
      </ul>

      <form
        className="mt-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          try {
            const id = await api.createWorkout(name.trim());
            router.push(`/plan/${id}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create it');
          }
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New workout, e.g. Push Day"
          aria-label="New workout name"
          maxLength={80}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--accent)]"
        />
        <button disabled={!name.trim()} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--on-accent)] disabled:opacity-50">Add</button>
      </form>

      <details className="mt-8 rounded-xl border border-[var(--border)] p-4" open={workouts?.length === 0}>
        <summary className="cursor-pointer font-medium">Import from Google Sheets</summary>
        <div className="mt-3"><ImportSheet onImported={load} /></div>
      </details>

      <details className="mt-3 rounded-xl border border-[var(--border)] p-4">
        <summary className="cursor-pointer font-medium">Copy a friend&apos;s workout</summary>
        <div className="mt-3"><CopyWorkout onCopied={load} /></div>
      </details>
    </div>
  );
}
