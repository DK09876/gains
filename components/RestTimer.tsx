'use client';

/**
 * Rest between sets, in the bar above Back and Next. It keeps the time it
 * ends rather than counting, so it is right after the phone sleeps or the
 * page reloads, and it beeps when rest is over while Gains is open.
 */

import { useEffect, useState } from 'react';

import { clock } from '@/lib/kinds';

export interface Rest {
  endsAt: number;
  total: number;
  /** What comes after: "set 3", "Lat pull down". */
  then: string;
}

interface Props {
  rest: Rest;
  onAdd: (seconds: number) => void;
  onSkip: () => void;
}

/** How long "Rest's up" stays after the time runs out. */
const LINGER_MS = 2 * 60 * 1000;

export default function RestTimer({ rest, onAdd, onSkip }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const left = (rest.endsAt - now) / 1000;
  const over = left <= 0;
  useEffect(() => {
    if (now - rest.endsAt > LINGER_MS) onSkip();
  }, [now, rest.endsAt, onSkip]);

  return (
    <div role="timer" aria-live={over ? 'assertive' : 'off'} className="safe-x mx-auto mb-2 max-w-3xl">
      <div className={`flex flex-col gap-2 rounded-2xl border px-3.5 py-2.5 ${over ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs uppercase tracking-wide text-[var(--muted)]">{over ? `Rest's up · ${rest.then}` : `Rest · then ${rest.then}`}</p>
            <p className={`tabular text-3xl font-extrabold leading-tight ${over ? 'text-[var(--accent)]' : ''}`}>{over ? 'Go' : clock(Math.ceil(left))}</p>
          </div>
          {!over && <button onClick={() => onAdd(30)} className="h-11 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 text-sm">+30 s</button>}
          <button onClick={onSkip} className="h-11 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 text-sm">{over ? 'Dismiss' : 'Skip'}</button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, Math.max(0, (1 - left / rest.total) * 100))}%` }} />
        </div>
      </div>
    </div>
  );
}
