'use client';

/**
 * Sets that are held rather than lifted - a plank, 3 × 45-60 s. A countdown
 * runs to the goal and keeps counting past it, so "Stop here" logs how long
 * the set really lasted. Each set's seconds can also be typed, for a set done
 * without the timer.
 */

import { useEffect, useRef, useState } from 'react';

import * as api from '@/lib/api';
import { primeAudio, scheduleBeep } from '@/lib/beep';
import type { SessionEntry } from '@/lib/db';
import { clock, goalSeconds } from '@/lib/kinds';
import type { LoggedSet } from '@/lib/suggest';

interface Props {
  sessionId: string;
  entry: SessionEntry;
  onChange: (logged: LoggedSet[]) => void;
  onSetDone?: (nextSet: number | null) => void;
}

interface Row { seconds: string; done: boolean }

const DEFAULT_SETS = 3;
const DEFAULT_GOAL = 30;
const R = 92;
const RING = 2 * Math.PI * R;

function initialRows(entry: SessionEntry): Row[] {
  const count = Math.max(entry.sets ?? DEFAULT_SETS, ...entry.logged.map((s) => s.setNumber));
  return Array.from({ length: count }, (_, i) => {
    const logged = entry.logged.find((s) => s.setNumber === i + 1);
    return { seconds: logged?.reps != null ? String(logged.reps) : '', done: !!logged?.done };
  });
}

export default function TimedList({ sessionId, entry, onChange, onSetDone }: Props) {
  const [rows, setRows] = useState<Row[]>(() => initialRows(entry));
  const [goal, setGoal] = useState(() => goalSeconds(entry.reps) ?? DEFAULT_GOAL);
  // Running: when it started, less any time spent paused.
  const [run, setRun] = useState<{ startedAt: number; pausedFor: number; pausedAt: number | null } | null>(null);
  const [now, setNow] = useState(0);
  const cancelBeep = useRef<() => void>(() => {});

  useEffect(() => {
    if (!run || run.pausedAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [run]);
  useEffect(() => () => cancelBeep.current(), []);

  const active = rows.findIndex((r) => !r.done);
  const elapsed = run ? Math.max(0, ((run.pausedAt ?? now) - run.startedAt - run.pausedFor) / 1000) : 0;
  const left = goal - elapsed;

  const save = (next: Row[], index: number) => {
    setRows(next);
    const logged = next
      .map((r, i) => ({ setNumber: i + 1, weight: null, reps: r.seconds === '' ? null : Number(r.seconds), done: r.done }))
      .filter((s, i) => next[i].done || next[i].seconds !== '');
    onChange(logged);
    const row = next[index];
    void api.setOutbox().put(sessionId, entry.id, { setNumber: index + 1, weight: null, reps: row.seconds === '' ? null : Number(row.seconds), done: row.done });
  };

  const finishSet = (index: number, seconds: number) => {
    const next = rows.map((r, i) => (i === index ? { seconds: String(Math.round(seconds)), done: true } : r));
    save(next, index);
    const after = next.findIndex((r) => !r.done);
    onSetDone?.(after === -1 ? null : after + 1);
    if (navigator.vibrate) navigator.vibrate(15);
  };

  const start = () => {
    primeAudio();
    cancelBeep.current = scheduleBeep(goal * 1000);
    const at = Date.now();
    setNow(at);
    setRun({ startedAt: at, pausedFor: 0, pausedAt: null });
  };
  const pause = () => {
    if (!run) return;
    if (run.pausedAt) {
      setRun({ ...run, pausedFor: run.pausedFor + Date.now() - run.pausedAt, pausedAt: null });
      cancelBeep.current = scheduleBeep(Math.max(0, left) * 1000);
    } else {
      cancelBeep.current();
      setRun({ ...run, pausedAt: Date.now() });
    }
  };
  const addFifteen = () => {
    setGoal((g) => g + 15);
    if (run && !run.pausedAt) { cancelBeep.current(); cancelBeep.current = scheduleBeep((left + 15) * 1000); }
  };
  const stop = () => {
    cancelBeep.current();
    if (active !== -1) finishSet(active, elapsed);
    setRun(null);
  };

  const progress = Math.min(1, elapsed / goal);

  return (
    <div>
      {active !== -1 && (
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-[200px] w-[200px]">
            <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label={left >= 0 ? `${Math.ceil(left)} seconds left` : `${Math.floor(-left)} seconds past the goal`}>
              <circle cx="100" cy="100" r={R} fill="none" stroke="var(--surface-hover)" strokeWidth="12" />
              <circle cx="100" cy="100" r={R} fill="none" stroke="var(--accent)" strokeWidth="12" strokeLinecap="round"
                strokeDasharray={RING} strokeDashoffset={RING * (1 - progress)} transform="rotate(-90 100 100)" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`tabular text-5xl font-extrabold ${left < 0 ? 'text-[var(--accent)]' : ''}`}>{left >= 0 ? clock(Math.ceil(left)) : `+${clock(-left)}`}</span>
              <span className="mt-1 text-sm text-[var(--muted)]">set {active + 1} of {rows.length} · goal {goal} s</span>
            </div>
          </div>
          <div className="grid w-full grid-cols-3 gap-2">
            {run ? (
              <>
                <button onClick={pause} className="h-12 rounded-xl border border-[var(--border)] bg-[var(--surface)]">{run.pausedAt ? 'Resume' : 'Pause'}</button>
                <button onClick={addFifteen} className="h-12 rounded-xl border border-[var(--border)] bg-[var(--surface)]">+15 s</button>
                <button onClick={stop} className="h-12 rounded-xl bg-[var(--accent)] font-bold text-[var(--on-accent)]">Stop here</button>
              </>
            ) : (
              <button onClick={start} className="col-span-3 h-12 rounded-xl bg-[var(--accent)] text-lg font-bold text-[var(--on-accent)]">Start set {active + 1}</button>
            )}
          </div>
        </div>
      )}

      <ol className="mt-4 flex flex-col gap-2">
        {rows.map((row, i) => (
          <li key={i} className={`flex items-center gap-3 rounded-xl border px-3 py-1.5 ${row.done ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10' : i === active ? 'border-[var(--accent)] bg-[var(--surface)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
            <span className="w-12 text-sm text-[var(--muted)]">Set {i + 1}</span>
            <label className="flex flex-1 items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={row.seconds}
                onChange={(e) => save(rows.map((r, j) => (j === i ? { ...r, seconds: e.target.value.replace('-', '') } : r)), i)}
                aria-label={`Set ${i + 1} seconds`}
                placeholder="–"
                className="tabular h-10 w-20 rounded-lg border border-[var(--border)] bg-[var(--background)] text-center text-lg outline-none focus:border-[var(--accent)]"
              />
              <span className="text-sm text-[var(--muted)]">seconds</span>
            </label>
            <button
              onClick={() => (row.done ? save(rows.map((r, j) => (j === i ? { ...r, done: false } : r)), i) : finishSet(i, Number(row.seconds) || goal))}
              aria-pressed={row.done}
              aria-label={row.done ? `Set ${i + 1} done - tap to undo` : `Mark set ${i + 1} done`}
              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-lg font-bold ${row.done ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
            >
              ✓
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
