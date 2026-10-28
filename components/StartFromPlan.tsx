'use client';

/**
 * A new profile's first screen. Rather than an empty app and a hunt through
 * Plan, it offers a friend's whole plan - workouts, clips and week - in one
 * tap, or a blank start.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import Spot from './Spot';
import * as api from '@/lib/api';
import type { PlanSummary } from '@/lib/db';
import { useProfileName } from '@/lib/profile';
import { WEEK_ORDER } from '@/lib/week';

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function StartFromPlan({ onCopied }: { onCopied: () => void }) {
  const name = useProfileName();
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.fetchPlans().then(setPlans).catch((e) => setError(e instanceof Error ? e.message : 'Could not load plans'));
  }, []);

  const copy = async (from: string) => {
    setCopying(from);
    setError(null);
    try {
      await api.copyPlan(from);
      onCopied();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not copy that plan');
      setCopying(null);
    }
  };

  const days = (p: PlanSummary) => p.week.filter((d) => d && d !== 'Rest').length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <Spot mood="happy" size={64} />
        <div>
          <h1 className="text-2xl font-extrabold">Welcome{name ? `, ${name}` : ''}</h1>
          <p className="mt-1 text-[var(--muted)]">Gains walks you through each workout, remembers your weights, and tells you when to go up.</p>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      {!plans && !error && <p className="text-sm text-[var(--muted)]">Loading…</p>}

      {plans && plans.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Start from a friend&apos;s plan</h2>
          {plans.map((p, i) => (
            <div key={p.id} className={`flex flex-col gap-3 rounded-2xl p-4 ${i === 0 ? 'border-2 border-[var(--accent)] bg-[var(--accent)]/5' : 'border border-[var(--border)] bg-[var(--surface)]'}`}>
              <div className="flex items-center gap-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-full font-extrabold ${i === 0 ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--surface-hover)]'}`}>{p.name.charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{p.name}&apos;s plan</p>
                  <p className="text-sm text-[var(--muted)]">{p.workouts} workout{p.workouts === 1 ? '' : 's'}{days(p) ? ` · ${days(p)} day${days(p) === 1 ? '' : 's'} a week` : ''} · clips included</p>
                </div>
              </div>
              {days(p) > 0 && (
                <ol className="grid grid-cols-7 gap-1 text-center text-[11px]" aria-label={`${p.name}'s week`}>
                  {WEEK_ORDER.map((d) => (
                    <li key={d} className={`rounded-md py-1.5 ${p.week[d] && p.week[d] !== 'Rest' ? 'bg-[var(--surface-hover)]' : 'text-[var(--muted)]'}`}>
                      {LETTERS[d]}<br /><span className="block truncate px-0.5">{p.week[d] || '–'}</span>
                    </li>
                  ))}
                </ol>
              )}
              <button
                onClick={() => copy(p.id)}
                disabled={!!copying}
                className={`rounded-xl py-3 font-bold disabled:opacity-60 ${i === 0 ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'border border-[var(--border)]'}`}
              >
                {copying === p.id ? 'Copying…' : `Use ${p.name}'s plan`}
              </button>
              {i === 0 && <p className="text-center text-xs text-[var(--muted)]">You get your own copy, with no weights. Your first workout sets them.</p>}
            </div>
          ))}
        </section>
      )}

      <Link href="/plan" className="py-3 text-center text-[var(--muted)]">Start empty and build my own</Link>
    </div>
  );
}
