'use client';

/**
 * After a workout: friends who haven't trained in a couple of days, with a
 * button that sends Spot after them. One push per friend per day.
 */

import { useEffect, useState } from 'react';

import * as api from '@/lib/api';
import type { Friend } from '@/lib/db';
import { dayText } from '@/lib/format';

const QUIET_DAYS = 2;

export default function SendSpot() {
  const [friends, setFriends] = useState<Array<Friend & { quiet: boolean }> | null>(null);
  const [said, setSaid] = useState<Record<string, string>>({});

  useEffect(() => {
    api.fetchFriends()
      .then((all) => {
        const cutoff = Date.now() - QUIET_DAYS * 86_400_000;
        setFriends(all.map((f) => ({ ...f, quiet: !f.lastTrained || Date.parse(f.lastTrained) < cutoff })));
      })
      .catch(() => setFriends([]));
  }, []);

  const quiet = friends?.filter((f) => f.quiet) ?? [];
  if (!quiet.length) return null;

  const send = async (id: string) => {
    setSaid((s) => ({ ...s, [id]: 'Sending…' }));
    const { message } = await api.sendSpot(id).catch(() => ({ message: 'Could not send' }));
    setSaid((s) => ({ ...s, [id]: message }));
  };

  return (
    <section className="mt-5 flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Slacking friends</h2>
      {quiet.map((f) => (
        <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-hover)] font-bold">{f.name.charAt(0).toUpperCase()}</span>
          <p className="min-w-0 flex-1 text-sm">
            <b>{f.name}</b> {f.lastTrained ? `last trained ${dayText(f.lastTrained).replace(/^(Today|Yesterday)$/, (d) => d.toLowerCase())}` : "hasn't logged a workout yet"}.
            {said[f.id] && <span className="block text-[var(--muted)]">{said[f.id]}</span>}
          </p>
          {!said[f.id] && !f.sentToday && (
            <button onClick={() => send(f.id)} className="shrink-0 rounded-xl border border-[var(--best)] px-3 py-2.5 text-sm font-bold text-[var(--best)]">Send {f.mascotName}</button>
          )}
          {f.sentToday && !said[f.id] && <span className="shrink-0 text-xs text-[var(--muted)]">Sent today</span>}
        </div>
      ))}
    </section>
  );
}
