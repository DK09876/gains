'use client';

/**
 * A workout in progress, one exercise at a time: its clip, its target, what
 * you did last time, and the sets to tick off. "All exercises" jumps
 * anywhere; nothing forces the order the plan lists them in.
 *
 * Every set is saved as it is ticked, so closing the page, locking the phone
 * or switching devices picks up where you were. The screen is kept awake
 * where the browser allows it, since a phone that locks between sets means
 * unlocking it with chalky hands.
 */

import { useEffect, useState } from 'react';

import MediaView from './MediaView';
import SetList from './SetList';
import * as api from '@/lib/api';
import type { Session } from '@/lib/db';
import { dayText, durationText, setsText, targetText } from '@/lib/format';
import { usePendingCount } from '@/lib/outbox';
import type { LoggedSet } from '@/lib/suggest';

interface Props {
  session: Session;
  onFinished: (result: api.SessionResult) => void;
  onDiscarded: () => void;
}

const doneCount = (logged: LoggedSet[]) => logged.filter((s) => s.done).length;

const positionKey = (id: string) => `gains-position-${id}`;

function rememberedPosition(session: Session): number {
  try {
    const saved = Number(localStorage.getItem(positionKey(session.id)));
    if (Number.isInteger(saved) && saved >= 0 && saved < session.entries.length) return saved;
  } catch { /* storage unavailable: start from the first exercise not yet done */ }
  const next = session.entries.findIndex((e) => !doneCount(e.logged));
  return next === -1 ? 0 : next;
}

export default function SessionView({ session, onFinished, onDiscarded }: Props) {
  const [entries, setEntries] = useState(session.entries);
  const [index, setIndex] = useState(() => rememberedPosition(session));
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const [box] = useState(() => (typeof window === 'undefined' ? null : api.setOutbox()));
  const waiting = usePendingCount(box);

  // A set the server refused (the workout was thrown away elsewhere) is reported, not retried.
  useEffect(() => box?.onRefused(setError), [box]);

  useEffect(() => {
    try { localStorage.setItem(positionKey(session.id), String(index)); } catch { /* fine */ }
    window.scrollTo({ top: 0 });
  }, [index, session.id]);

  // The elapsed time in the header.
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Keep the screen on while working out; the lock is dropped when the tab hides, so take it again on return.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const take = () => {
      if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      document.removeEventListener('visibilitychange', take);
      lock?.release().catch(() => {});
    };
  }, []);

  const entry = entries[index];
  const total = entries.length;
  const exercisesDone = entries.filter((e) => doneCount(e.logged)).length;

  const finish = async () => {
    const left = total - exercisesDone;
    if (left && !confirm(`${left} exercise${left === 1 ? '' : 's'} not logged. Finish anyway?`)) return;
    setBusy(true);
    // Every set has to be on the Pi before the workout is closed and its suggestions worked out.
    await box?.flush();
    if (box?.count()) {
      setError('Some sets are still on this phone - finish once you have a connection again.');
      setBusy(false);
      return;
    }
    try {
      const result = await api.finishSession(session.id);
      try { localStorage.removeItem(positionKey(session.id)); } catch { /* fine */ }
      onFinished(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish');
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!confirm('Throw this workout away? Nothing from it will be kept.')) return;
    setBusy(true);
    try {
      await api.deleteSession(session.id);
      onDiscarded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not discard');
      setBusy(false);
    }
  };

  if (!total) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h1 className="text-lg font-semibold">{session.workoutName} has no exercises</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Add some on the Plan tab, then start it again.</p>
        <button onClick={discard} className="mt-4 rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Close it</button>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-[var(--muted)]">
            {session.workoutName} · {durationText(session.startedAt, null)} · {exercisesDone}/{total} done
          </p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--surface)]">
            <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${(exercisesDone / total) * 100}%` }} />
          </div>
        </div>
        <button
          onClick={() => setShowAll((s) => !s)}
          aria-expanded={showAll}
          className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm"
        >
          {showAll ? 'Close' : 'All exercises'}
        </button>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}

      {showAll && waiting > 0 && (
        <p role="status" className="mt-3 rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-300">
          No connection - {waiting} set{waiting === 1 ? ' is' : 's are'} saved on this phone and will send when you&apos;re back online.
        </p>
      )}

      {showAll ? (
        <div className="mt-4">
          <ol className="flex flex-col gap-1">
            {entries.map((e, i) => {
              const done = doneCount(e.logged);
              const showSection = e.section && e.section !== entries[i - 1]?.section;
              return (
                <li key={e.id}>
                  {showSection && <p className="mt-3 px-1 text-xs uppercase tracking-wide text-[var(--muted)]">{e.section}</p>}
                  <button
                    onClick={() => { setIndex(i); setShowAll(false); }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${i === index ? 'bg-[var(--surface-hover)]' : 'bg-[var(--surface)]'}`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'border border-[var(--border)] text-[var(--muted)]'}`}>
                      {done ? '✓' : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{e.name}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">{done ? setsText(e.logged) : targetText(e) || 'No target'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={finish} disabled={busy} className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[var(--on-accent)] disabled:opacity-50">Finish workout</button>
            <button onClick={discard} disabled={busy} className="rounded-xl px-4 py-3 text-sm text-[var(--danger)] disabled:opacity-50">Discard</button>
          </div>
        </div>
      ) : (
        <article className="mt-4">
          {entry.section && <p className="text-xs uppercase tracking-wide text-[var(--accent)]">{entry.section}</p>}
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">{entry.name}</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">Exercise {index + 1} of {total}</p>

          {entry.media.length > 0 && <div className="mt-3"><MediaView key={entry.id} media={entry.media} /></div>}

          <dl className="mt-1 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-[var(--surface)] px-3 py-2">
              <dt className="text-xs text-[var(--muted)]">Target</dt>
              <dd className="font-medium">{targetText(entry) || 'None set'}</dd>
            </div>
            <div className="rounded-xl bg-[var(--surface)] px-3 py-2">
              <dt className="text-xs text-[var(--muted)]">Last time{entry.last ? ` · ${dayText(entry.last.date)}` : ''}</dt>
              <dd className="tabular font-medium">{entry.last ? setsText(entry.last.sets) : 'First time'}</dd>
            </div>
          </dl>
          {entry.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--muted)]">{entry.notes}</p>}

          <div className="mt-3">
            <SetList
              key={entry.id}
              sessionId={session.id}
              entry={entry}
              onError={setError}
              onChange={(logged) => setEntries((all) => all.map((e) => (e.id === entry.id ? { ...e, logged } : e)))}
            />
          </div>
        </article>
      )}

      {!showAll && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--border)] bg-[var(--background)]/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          {waiting > 0 && (
            <p role="status" className="safe-x mx-auto mb-2 max-w-3xl text-sm text-amber-300">
              No connection - {waiting} set{waiting === 1 ? ' is' : 's are'} saved on this phone and will send when you&apos;re back online.
            </p>
          )}
          <div className="safe-x mx-auto flex max-w-3xl gap-2">
            <button
              onClick={() => setIndex((i) => i - 1)}
              disabled={index === 0}
              className="rounded-xl border border-[var(--border)] px-4 py-3 font-medium disabled:opacity-30"
            >
              ← Back
            </button>
            {index < total - 1 ? (
              <button onClick={() => setIndex((i) => i + 1)} className="flex-1 truncate rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[var(--on-accent)]">
                Next: {entries[index + 1].name}
              </button>
            ) : (
              <button onClick={finish} disabled={busy} className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[var(--on-accent)] disabled:opacity-50">
                Finish workout
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
