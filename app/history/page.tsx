'use client';

/**
 * Workouts you have finished, newest first. Open one to see every set, and
 * any targets it still suggests raising.
 */

import { useEffect, useState } from 'react';

import Summary from '@/components/Summary';
import * as api from '@/lib/api';
import type { SessionSummary } from '@/lib/db';
import { dayText, durationText } from '@/lib/format';

export default function History() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<api.SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.fetchSessions().then((s) => setSessions(s.history)).catch((e) => setError(e.message));
  }, []);

  const toggle = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    setDetail(null);
    try {
      setDetail(await api.fetchSession(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load it');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this workout from your history?')) return;
    try {
      await api.deleteSession(id);
      setSessions((s) => s?.filter((x) => x.id !== id) ?? null);
      setOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">History</h1>
      {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      {!sessions && !error && <p className="mt-4 text-sm text-[var(--muted)]">Loading…</p>}
      {sessions?.length === 0 && <p className="mt-4 text-[var(--muted)]">Nothing yet - finish a workout and it shows up here.</p>}
      <ul className="mt-4 flex flex-col gap-2">
        {sessions?.map((s) => (
          <li key={s.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <button onClick={() => toggle(s.id)} aria-expanded={open === s.id} className="flex w-full items-baseline gap-3 px-4 py-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{s.workoutName}</span>
                <span className="block text-sm text-[var(--muted)]">
                  {s.exercisesDone} exercise{s.exercisesDone === 1 ? '' : 's'} · {s.setsDone} set{s.setsDone === 1 ? '' : 's'} · {durationText(s.startedAt, s.finishedAt)}
                </span>
              </span>
              <span className="shrink-0 text-sm text-[var(--muted)]">{dayText(s.startedAt)}</span>
            </button>
            {open === s.id && (
              <div className="border-t border-[var(--border)] px-4 pb-4 pt-2">
                {detail?.session.id === s.id ? <Summary result={detail} /> : <p className="py-2 text-sm text-[var(--muted)]">Loading…</p>}
                <button onClick={() => remove(s.id)} className="mt-2 py-3 text-sm text-[var(--danger)]">Delete from history</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
