'use client';

/** Gym / Home, above the workouts on Today and Plan. */

import type { Place } from '@/lib/db';
import { setPlace, usePlace } from '@/lib/place';

const TABS: Array<{ place: Place; label: string }> = [
  { place: 'gym', label: 'Gym' },
  { place: 'home', label: 'Home' },
];

export default function PlaceTabs() {
  const current = usePlace();
  return (
    <div role="tablist" aria-label="Where" className="mt-4 inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
      {TABS.map(({ place, label }) => (
        <button
          key={place}
          role="tab"
          aria-selected={current === place}
          onClick={() => setPlace(place)}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium ${current === place ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
