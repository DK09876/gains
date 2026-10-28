'use client';

/**
 * A run of exercises that are only done or not - a walk, McGill's big 3, hip
 * CARs - on one screen, one tap each. No weights, no reps, and they never
 * count as skipped: the point of a warm-up is to have done it.
 */

import { useState } from 'react';

import MediaView from './MediaView';
import * as api from '@/lib/api';
import type { SessionEntry } from '@/lib/db';
import type { LoggedSet } from '@/lib/suggest';

interface Props {
  sessionId: string;
  entries: SessionEntry[];
  onChange: (entryId: string, logged: LoggedSet[]) => void;
}

const isDone = (e: SessionEntry) => e.logged.some((s) => s.done);

/** "Get loose, then lift" for a warm-up; plainer for any other section. */
export const checklistTitle = (section: string) => (/warm/i.test(section) ? 'Get loose, then lift' : 'Check these off');

export default function CheckList({ sessionId, entries, onChange }: Props) {
  const [clip, setClip] = useState<string | null>(null);
  const done = entries.filter(isDone).length;
  const section = entries[0]?.section || 'Checklist';

  const toggle = (entry: SessionEntry) => {
    const set: LoggedSet = { setNumber: 1, weight: null, reps: null, done: !isDone(entry) };
    onChange(entry.id, [set]);
    void api.setOutbox().put(sessionId, entry.id, set);
    if (set.done && navigator.vibrate) navigator.vibrate(15);
  };

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-[var(--accent)]">{section} · {done} of {entries.length} done</p>
      <h1 className="text-xl font-bold leading-tight sm:text-2xl">{checklistTitle(section)}</h1>
      <ol className="mt-4 flex flex-col gap-2.5">
        {entries.map((entry) => {
          const on = isDone(entry);
          return (
            <li
              key={entry.id}
              className={`rounded-2xl border p-3 ${on ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10' : 'border-[var(--border)] bg-[var(--surface)]'}`}
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{entry.name}</p>
                  {entry.notes && <p className="mt-0.5 text-sm text-[var(--muted)]">{entry.notes}</p>}
                  {entry.media.length > 0 && (
                    <button
                      onClick={() => setClip((c) => (c === entry.id ? null : entry.id))}
                      aria-expanded={clip === entry.id}
                      className="-ml-1 mt-1 px-1 py-2 text-sm text-[var(--accent)]"
                    >
                      {clip === entry.id ? 'Hide clip' : entry.media.length === 1 ? 'Show clip' : `Show ${entry.media.length} clips`}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => toggle(entry)}
                  aria-pressed={on}
                  aria-label={on ? `${entry.name} done - tap to undo` : `Mark ${entry.name} done`}
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-xl font-bold ${on ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
                >
                  ✓
                </button>
              </div>
              {clip === entry.id && <div className="mt-3"><MediaView media={entry.media} /></div>}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm text-[var(--muted)]">One tap each. These never count as skipped.</p>
    </div>
  );
}
