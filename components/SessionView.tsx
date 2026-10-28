'use client';

/**
 * A workout in progress, a page at a time: a run of warm-ups as one
 * checklist, then each lift or timed set on its own page with its clip, its
 * target and what you did last time. "All exercises" jumps anywhere; nothing
 * forces the order the plan lists them in.
 *
 * Ticking a set starts the rest timer. Every set is saved as it is ticked, so
 * closing the page, locking the phone or switching devices picks up where you
 * were. The screen is kept awake where the browser allows it, since a phone
 * that locks between sets means unlocking it with chalky hands.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import CheckList from './CheckList';
import { useConfirm } from './Confirm';
import MediaView from './MediaView';
import RestTimer, { type Rest } from './RestTimer';
import SetList from './SetList';
import TimedList from './TimedList';
import * as api from '@/lib/api';
import { msUntil, nowMs, primeAudio, scheduleBeep } from '@/lib/beep';
import type { Session, SessionEntry } from '@/lib/db';
import { dayText, durationText, setsText, targetText } from '@/lib/format';
import { DEFAULT_REST } from '@/lib/kinds';
import { usePendingCount } from '@/lib/outbox';
import { useProfileName } from '@/lib/profile';
import { pageName, pagesOf, type Page } from '@/lib/pages';
import type { LoggedSet } from '@/lib/suggest';

interface Props {
  session: Session;
  onFinished: (result: api.SessionResult) => void;
  onDiscarded: () => void;
}

const isDone = (e: SessionEntry) => e.logged.some((s) => s.done);

const positionKey = (id: string) => `gains-position-${id}`;
const restKey = (id: string) => `gains-rest-${id}`;

function rememberedPage(session: Session, pages: Page[]): number {
  try {
    const raw = localStorage.getItem(positionKey(session.id));
    const saved = Number(raw);
    if (raw !== null && Number.isInteger(saved) && saved >= 0 && saved < pages.length) return saved;
  } catch { /* storage unavailable: start from the first page not yet done */ }
  const next = pages.findIndex((p) => p.entries.some((e) => !isDone(e)));
  return next === -1 ? 0 : next;
}

function rememberedRest(id: string): Rest | null {
  try {
    const rest = JSON.parse(localStorage.getItem(restKey(id)) ?? 'null') as Rest | null;
    return rest && rest.endsAt > Date.now() - 60_000 ? rest : null;
  } catch {
    return null;
  }
}

export default function SessionView({ session, onFinished, onDiscarded }: Props) {
  const [entries, setEntries] = useState(session.entries);
  const pages = pagesOf(entries);
  const [index, setIndex] = useState(() => rememberedPage(session, pagesOf(session.entries)));
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rest, setRest] = useState<Rest | null>(() => (typeof window === 'undefined' ? null : rememberedRest(session.id)));
  const cancelBeep = useRef<() => void>(() => {});
  const [, tick] = useState(0);
  const [box] = useState(() => (typeof window === 'undefined' ? null : api.setOutbox()));
  const waiting = usePendingCount(box);
  const confirm = useConfirm();
  const profileName = useProfileName();
  // Bumped when the sets are reloaded from the Pi, so the lists start again from what is saved.
  const [version, setVersion] = useState(0);
  // The workout no longer exists on the Pi - finished or thrown away on another phone.
  const [gone, setGone] = useState(false);

  // A set the Pi refused is reported, and the screen goes back to what was really saved
  // rather than showing a tick that isn't there.
  useEffect(() => box?.onRefused((message) => {
    setError(`That set wasn't saved: ${message}`);
    api.fetchSession(session.id)
      .then((r) => { setEntries(r.session.entries); setVersion((v) => v + 1); })
      .catch(() => setGone(true));
  }), [box, session.id]);

  useEffect(() => {
    try { localStorage.setItem(positionKey(session.id), String(index)); } catch { /* fine */ }
    window.scrollTo({ top: 0 });
  }, [index, session.id]);

  useEffect(() => {
    try {
      if (rest) localStorage.setItem(restKey(session.id), JSON.stringify(rest));
      else localStorage.removeItem(restKey(session.id));
    } catch { /* fine */ }
  }, [rest, session.id]);
  useEffect(() => () => cancelBeep.current(), []);

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

  const startRest = (entry: SessionEntry, nextSet: number | null) => {
    const seconds = entry.restSeconds ?? DEFAULT_REST;
    cancelBeep.current();
    if (!seconds) { setRest(null); return; }
    const following = pages[index + 1];
    const then = nextSet ? `set ${nextSet}` : following ? pageName(following) : 'finish';
    primeAudio();
    cancelBeep.current = scheduleBeep(seconds * 1000);
    setRest({ endsAt: nowMs() + seconds * 1000, total: seconds, then });
  };
  const addRest = (seconds: number) => {
    if (!rest) return;
    cancelBeep.current();
    const next = { ...rest, endsAt: rest.endsAt + seconds * 1000, total: rest.total + seconds };
    cancelBeep.current = scheduleBeep(msUntil(next.endsAt));
    setRest(next);
  };
  const skipRest = useCallback(() => { cancelBeep.current(); setRest(null); }, []);

  const updateEntry = (id: string, logged: LoggedSet[]) =>
    setEntries((all) => all.map((e) => (e.id === id ? { ...e, logged } : e)));

  const total = entries.length;
  const exercisesDone = entries.filter(isDone).length;
  // Only what has sets counts as skipped; a warm-up left unticked is not a failure.
  const liftsLeft = entries.filter((e) => e.kind !== 'check' && !isDone(e)).length;

  const finish = async () => {
    if (!entries.some(isDone)) {
      // Nothing to keep: finishing would only put an empty workout in History.
      const away = await confirm({ title: 'Nothing logged yet', body: 'Throw this workout away instead of saving an empty one?', action: 'Throw it away', cancel: 'Keep going', danger: true });
      if (away) await discard(true);
      return;
    }
    if (liftsLeft && !(await confirm({
      title: `${liftsLeft} exercise${liftsLeft === 1 ? '' : 's'} not logged`,
      body: 'They will show as skipped.',
      action: 'Finish anyway',
      cancel: 'Keep going',
    }))) return;
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
      try { localStorage.removeItem(positionKey(session.id)); localStorage.removeItem(restKey(session.id)); } catch { /* fine */ }
      onFinished(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish');
      setBusy(false);
    }
  };

  const discard = async (sure = false) => {
    if (!sure && !(await confirm({ title: 'Throw this workout away?', body: 'Nothing from it will be kept.', action: 'Throw it away', danger: true }))) return;
    setBusy(true);
    try {
      await api.deleteSession(session.id);
      onDiscarded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not discard');
      setBusy(false);
    }
  };

  if (gone) {
    return (
      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h1 className="text-lg font-bold">This workout was closed somewhere else</h1>
        <p className="mt-1 text-[var(--muted)]">It was finished or thrown away on another phone, so the last tick wasn&apos;t saved.</p>
        <button onClick={onDiscarded} className="mt-4 w-full rounded-xl bg-[var(--accent)] py-3 font-bold text-[var(--on-accent)]">Back to Today</button>
      </div>
    );
  }

  if (!total) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h1 className="text-lg font-semibold">{session.workoutName} has no exercises</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Add some on the Plan tab, then start it again.</p>
        <button onClick={() => discard()} className="mt-4 rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Close it</button>
      </div>
    );
  }

  const page = pages[Math.min(index, pages.length - 1)];
  const entry = page.entries[0];
  const nextPage = pages[index + 1];

  return (
    <div className={rest ? 'pb-48' : 'pb-24'}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-[var(--muted)]">
            {profileName ? `${profileName} · ` : ''}{session.workoutName} · {durationText(session.startedAt, null)} · {exercisesDone}/{total} done
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
              const done = isDone(e);
              const showSection = e.section && e.section !== entries[i - 1]?.section;
              const at = pages.findIndex((p) => p.entries.includes(e));
              return (
                <li key={e.id}>
                  {showSection && <p className="mt-3 px-1 text-xs uppercase tracking-wide text-[var(--muted)]">{e.section}</p>}
                  <button
                    onClick={() => { setIndex(at); setShowAll(false); }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${at === index ? 'bg-[var(--surface-hover)]' : 'bg-[var(--surface)]'}`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'border border-[var(--border)] text-[var(--muted)]'}`}>
                      {done ? '✓' : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{e.name}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">{done ? setsText(e.logged, e.kind) : e.kind === 'check' ? 'Check off' : targetText(e) || 'No target'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={finish} disabled={busy} className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[var(--on-accent)] disabled:opacity-50">Finish workout</button>
            <button onClick={() => discard()} disabled={busy} className="rounded-xl px-4 py-3 text-sm text-[var(--danger)] disabled:opacity-50">Discard</button>
          </div>
        </div>
      ) : page.checklist ? (
        <article className="mt-4">
          <CheckList key={version} sessionId={session.id} entries={page.entries} onChange={updateEntry} />
        </article>
      ) : (
        <article className="mt-4">
          {entry.section && <p className="text-xs uppercase tracking-wide text-[var(--accent)]">{entry.section}</p>}
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">{entry.name}</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">{index + 1} of {pages.length}</p>

          {entry.media.length > 0 && <div className="mt-3"><MediaView key={entry.id} media={entry.media} /></div>}

          <dl className="mt-1 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-[var(--surface)] px-3 py-2">
              <dt className="text-xs text-[var(--muted)]">Target</dt>
              <dd className="font-medium">{targetText(entry) || 'None set'}</dd>
            </div>
            <div className="rounded-xl bg-[var(--surface)] px-3 py-2">
              <dt className="text-xs text-[var(--muted)]">Last time{entry.last ? ` · ${dayText(entry.last.date)}` : ''}</dt>
              <dd className="tabular font-medium">{entry.last ? setsText(entry.last.sets, entry.kind) : 'No history yet'}</dd>
            </div>
          </dl>
          {entry.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--muted)]">{entry.notes}</p>}

          <div className="mt-3">
            {entry.kind === 'timed' ? (
              <TimedList
                key={`${entry.id}-${version}`}
                sessionId={session.id}
                entry={entry}
                onChange={(logged) => updateEntry(entry.id, logged)}
                onSetDone={(nextSet) => startRest(entry, nextSet)}
              />
            ) : (
              <SetList
                key={`${entry.id}-${version}`}
                sessionId={session.id}
                entry={entry}
                onError={setError}
                onChange={(logged) => updateEntry(entry.id, logged)}
                onSetDone={(nextSet) => startRest(entry, nextSet)}
              />
            )}
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
          {rest && <RestTimer rest={rest} onAdd={addRest} onSkip={skipRest} />}
          <div className="safe-x mx-auto flex max-w-3xl gap-2">
            <button
              onClick={() => setIndex((i) => i - 1)}
              disabled={index === 0}
              className="rounded-xl border border-[var(--border)] px-4 py-3 font-medium disabled:opacity-30"
            >
              ← Back
            </button>
            {nextPage ? (
              <button onClick={() => setIndex((i) => i + 1)} className="flex-1 truncate rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[var(--on-accent)]">
                {page.checklist && !nextPage.checklist ? `Start: ${pageName(nextPage)}` : `Next: ${pageName(nextPage)}`}
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
