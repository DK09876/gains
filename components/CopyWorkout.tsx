'use client';

/** Copy a workout from someone else's profile into yours - targets, clips and all - to make it your own. */

import { useEffect, useState } from 'react';

import * as api from '@/lib/api';
import type { Profile, WorkoutSummary } from '@/lib/db';
import { useProfile } from '@/lib/profile';

export default function CopyWorkout({ onCopied }: { onCopied: () => void }) {
  const me = useProfile();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [from, setFrom] = useState('');
  const [theirs, setTheirs] = useState<WorkoutSummary[] | null>(null);
  const [copied, setCopied] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.fetchProfiles().then((all) => setProfiles(all.filter((p) => p.id !== me))).catch(() => {});
  }, [me]);

  useEffect(() => {
    if (!from) return;
    let live = true;
    api.fetchWorkouts(from).then((w) => { if (live) setTheirs(w); }).catch((e) => setError(e.message));
    return () => { live = false; };
  }, [from]);

  if (!profiles.length) return <p className="text-sm text-[var(--muted)]">Nobody else is using Gains yet.</p>;

  return (
    <div>
      <select
        value={from}
        onChange={(e) => { setTheirs(null); setFrom(e.target.value); }}
        aria-label="Whose workouts"
        className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
      >
        <option value="">Whose workouts?</option>
        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
      {theirs?.length === 0 && <p className="mt-3 text-sm text-[var(--muted)]">They have no workouts yet.</p>}
      <ul className="mt-3 flex flex-col gap-2">
        {theirs?.map((w) => (
          <li key={w.id} className="flex items-center gap-3 rounded-lg bg-[var(--surface)] px-3 py-2">
            <span className="min-w-0 flex-1 truncate">{w.name} <span className="text-sm text-[var(--muted)]">· {w.exerciseCount} exercises</span></span>
            {copied.has(w.id) ? (
              <span className="text-sm text-[var(--accent)]">Copied ✓</span>
            ) : (
              <button
                onClick={async () => {
                  try {
                    await api.copyWorkout(w.id);
                    setCopied((c) => new Set(c).add(w.id));
                    onCopied();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Could not copy');
                  }
                }}
                className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
              >
                Copy
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
