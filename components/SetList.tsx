'use client';

/**
 * The sets for one exercise: weight, reps, and a tick when it is done.
 *
 * Rows start filled in with a best guess - the set above, else what you did
 * last time, else the target - so the usual case is one tap on the tick.
 * A row is only saved once it is ticked or was saved before; until then it
 * is a suggestion, and changing a row carries down to the untouched ones
 * below it, so setting the weight once sets it for every set.
 */

import { useEffect, useRef, useState } from 'react';

import * as api from '@/lib/api';
import type { SessionEntry } from '@/lib/db';
import { repsGuess, UNIT } from '@/lib/format';
import { formatWeight, type LoggedSet } from '@/lib/suggest';

interface Row {
  weight: string;
  reps: string;
  done: boolean;
  /** Stored on the server - changes to it are saved; an unsaved row is only a suggestion. */
  saved: boolean;
}

const DEFAULT_SETS = 3;
const STEP = 5;

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : formatWeight(n));
const num = (s: string): number | null => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s));

function initialRows(entry: SessionEntry): Row[] {
  const count = Math.max(entry.sets ?? DEFAULT_SETS, ...entry.logged.map((s) => s.setNumber));
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    const logged = entry.logged.find((s) => s.setNumber === i + 1);
    if (logged) {
      rows.push({ weight: str(logged.weight), reps: str(logged.reps), done: logged.done, saved: true });
      continue;
    }
    const above = rows[i - 1];
    const last = entry.last?.sets[i] ?? entry.last?.sets.at(-1);
    rows.push({
      weight: above?.weight ?? str(last?.weight ?? entry.targetWeight),
      reps: above?.reps ?? str(last?.reps ?? repsGuess(entry.reps)),
      done: false,
      saved: false,
    });
  }
  return rows;
}

export const toLogged = (rows: Row[]): LoggedSet[] =>
  rows.map((r, i) => ({ setNumber: i + 1, weight: num(r.weight), reps: num(r.reps), done: r.done })).filter((_, i) => rows[i].saved);

interface Props {
  sessionId: string;
  entry: SessionEntry;
  onChange: (logged: LoggedSet[]) => void;
  onError: (message: string) => void;
}

export default function SetList({ sessionId, entry, onChange, onError }: Props) {
  const [rows, setRows] = useState<Row[]>(() => initialRows(entry));
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const save = (index: number, row: Row, delay = 0) => {
    clearTimeout(timers.current.get(index));
    const run = () => api.logSet(sessionId, entry.id, {
      setNumber: index + 1, weight: num(row.weight), reps: num(row.reps), done: row.done,
    }).catch((e) => onError(e instanceof Error ? e.message : 'Could not save that set'));
    if (delay) timers.current.set(index, setTimeout(run, delay));
    else void run();
  };

  const commit = (next: Row[]) => {
    setRows(next);
    onChange(toLogged(next));
  };

  const edit = (index: number, field: 'weight' | 'reps', value: string) => {
    const next = rows.map((r, i) => {
      if (i === index) return { ...r, [field]: value };
      // Untouched rows below follow, so one change sets every remaining set.
      if (i > index && !r.saved) return { ...r, [field]: value };
      return r;
    });
    commit(next);
    if (next[index].saved) save(index, next[index], 600);
  };

  const step = (index: number, by: number) => {
    const current = num(rows[index].weight) ?? 0;
    edit(index, 'weight', formatWeight(Math.max(0, current + by)));
  };

  const toggle = (index: number) => {
    const row = { ...rows[index], done: !rows[index].done, saved: true };
    commit(rows.map((r, i) => (i === index ? row : r)));
    save(index, row);
    if (row.done && navigator.vibrate) navigator.vibrate(15);
  };

  const addSet = () => {
    const last = rows.at(-1);
    commit([...rows, { weight: last?.weight ?? '', reps: last?.reps ?? '', done: false, saved: false }]);
  };

  const removeSet = () => {
    const index = rows.length - 1;
    if (index < 0) return;
    clearTimeout(timers.current.get(index));
    if (rows[index].saved) {
      api.deleteSet(sessionId, entry.id, index + 1).catch((e) => onError(e instanceof Error ? e.message : 'Could not remove that set'));
    }
    commit(rows.slice(0, index));
  };

  return (
    <div>
      <div className="grid grid-cols-[1.5rem_1fr_4.5rem_3rem] items-center gap-2 px-1 pb-1 text-xs uppercase tracking-wide text-[var(--muted)]">
        <span>Set</span>
        <span className="text-center">{UNIT}</span>
        <span className="text-center">Reps</span>
        <span />
      </div>
      <ol className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <li
            key={i}
            className={`grid grid-cols-[1.5rem_1fr_4.5rem_3rem] items-center gap-2 rounded-xl border px-1 py-1.5 ${row.done ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10' : 'border-[var(--border)] bg-[var(--surface)]'}`}
          >
            <span className="tabular text-center text-sm text-[var(--muted)]">{i + 1}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => step(i, -STEP)} aria-label={`Set ${i + 1}: ${STEP} ${UNIT} lighter`} className="h-10 w-9 shrink-0 rounded-lg bg-[var(--background)] text-lg text-[var(--muted)] active:bg-[var(--surface-hover)]">−</button>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={row.weight}
                onChange={(e) => edit(i, 'weight', e.target.value)}
                aria-label={`Set ${i + 1} weight`}
                placeholder="–"
                className="tabular h-10 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] text-center text-lg font-semibold outline-none focus:border-[var(--accent)]"
              />
              <button onClick={() => step(i, STEP)} aria-label={`Set ${i + 1}: ${STEP} ${UNIT} heavier`} className="h-10 w-9 shrink-0 rounded-lg bg-[var(--background)] text-lg text-[var(--muted)] active:bg-[var(--surface-hover)]">+</button>
            </div>
            <input
              type="number"
              inputMode="numeric"
              value={row.reps}
              onChange={(e) => edit(i, 'reps', e.target.value)}
              aria-label={`Set ${i + 1} reps`}
              placeholder="–"
              className="tabular h-10 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] text-center text-lg outline-none focus:border-[var(--accent)]"
            />
            <button
              onClick={() => toggle(i)}
              aria-label={row.done ? `Set ${i + 1} done - tap to undo` : `Mark set ${i + 1} done`}
              aria-pressed={row.done}
              className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 text-lg font-bold ${row.done ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
            >
              ✓
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex gap-2 text-sm">
        <button onClick={addSet} className="rounded-lg px-3 py-2 text-[var(--accent)] hover:bg-[var(--surface)]">+ Add set</button>
        {rows.length > 0 && (
          <button onClick={removeSet} className="rounded-lg px-3 py-2 text-[var(--muted)] hover:bg-[var(--surface)]">Remove last</button>
        )}
      </div>
    </div>
  );
}
