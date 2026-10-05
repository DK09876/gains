'use client';

/** One workout's plan: its name and notes, and its exercises in order. */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Fragment, useEffect, useState } from 'react';

import ExerciseEditor from '@/components/ExerciseEditor';
import * as api from '@/lib/api';
import type { Workout } from '@/lib/db';
import { PLACES } from '@/lib/places';
import { setPlace } from '@/lib/place';

export default function WorkoutPlan() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.fetchWorkout(id)
      .then((w) => { setWorkout(w); setName(w.name); setNotes(w.notes); })
      .catch((e) => setError(e.message));
  }, [id]);

  if (!workout) {
    return error
      ? <div><p role="alert" className="text-[var(--danger)]">{error}</p><Link href="/plan" className="mt-3 inline-block text-[var(--accent)]">← Plan</Link></div>
      : <p className="text-sm text-[var(--muted)]">Loading…</p>;
  }

  const save = async (change: { name?: string; notes?: string; place?: Workout['place'] }) => {
    setError(null);
    try {
      setWorkout(await api.updateWorkout(workout.id, change));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setName(workout.name);
      setNotes(workout.notes);
    }
  };

  const move = async (index: number, by: number) => {
    const order = workout.exercises.map((e) => e.id);
    [order[index], order[index + by]] = [order[index + by], order[index]];
    try {
      setWorkout(await api.reorderExercises(workout.id, order));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reorder');
    }
  };

  const sections = [...new Set(workout.exercises.map((e) => e.section).filter(Boolean))];

  return (
    <div>
      <Link href="/plan" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">← Plan</Link>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== workout.name ? save({ name }) : setName(workout.name)}
        aria-label="Workout name"
        maxLength={80}
        className="mt-2 w-full rounded-lg border border-transparent bg-transparent px-1 text-2xl font-bold outline-none hover:border-[var(--border)] focus:border-[var(--accent)]"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== workout.notes && save({ notes })}
        placeholder="Notes for this workout"
        aria-label="Workout notes"
        rows={notes ? 2 : 1}
        className="mt-1 w-full resize-y rounded-lg border border-transparent bg-transparent px-1 text-sm text-[var(--muted)] outline-none hover:border-[var(--border)] focus:border-[var(--accent)]"
      />
      <label className="mt-1 flex items-center gap-2 px-1 text-sm text-[var(--muted)]">
        Done at
        <select
          value={workout.place}
          onChange={(e) => {
            const place = e.target.value as Workout['place'];
            setPlace(place);
            save({ place });
          }}
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)]"
        >
          {PLACES.map((p) => <option key={p} value={p}>{p === 'gym' ? 'Gym' : 'Home'}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>}

      <ul className="mt-4 flex flex-col gap-2">
        {workout.exercises.map((exercise, i) => (
          <Fragment key={exercise.id}>
            {exercise.section && exercise.section !== workout.exercises[i - 1]?.section && (
              <li className="mt-3 px-1 text-xs uppercase tracking-wide text-[var(--muted)]">{exercise.section}</li>
            )}
            <ExerciseEditor
              exercise={exercise}
              sections={sections}
              open={open === exercise.id}
              onToggle={() => setOpen((o) => (o === exercise.id ? null : exercise.id))}
              onChange={setWorkout}
              onMove={(by) => move(i, by)}
              first={i === 0}
              last={i === workout.exercises.length - 1}
            />
          </Fragment>
        ))}
      </ul>

      <form
        className="mt-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          try {
            const result = await api.addExercise(workout.id, { name: newName.trim() });
            setWorkout(result.workout);
            setOpen(result.id);
            setNewName('');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not add it');
          }
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add an exercise"
          aria-label="New exercise name"
          maxLength={120}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--accent)]"
        />
        <button disabled={!newName.trim()} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--on-accent)] disabled:opacity-50">Add</button>
      </form>

      <button
        onClick={async () => {
          if (!confirm(`Delete ${workout.name}? Past workouts keep what you logged.`)) return;
          try {
            await api.deleteWorkout(workout.id);
            router.push('/plan');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not delete');
          }
        }}
        className="mt-10 text-sm text-[var(--danger)]"
      >
        Delete this workout
      </button>
    </div>
  );
}
