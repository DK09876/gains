'use client';

/**
 * Every lift and timed exercise you've logged, grouped by workout: where it
 * is now, how far it has come, and a small line of the trend. Open one for
 * the full chart.
 */

import { useEffect, useState } from 'react';

import ProgressChart, { metricOf } from './ProgressChart';
import * as api from '@/lib/api';
import type { ProgressSeries } from '@/lib/db';
import { formatWeight } from '@/lib/suggest';

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="w-16" />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const w = 64;
  const h = 24;
  const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * (w - 6), hi === lo ? h / 2 : 3 + (1 - (v - lo) / (hi - lo)) * (h - 6)]);
  const [ex, ey] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} aria-hidden="true" className="shrink-0">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ex} cy={ey} r="3" fill="var(--accent)" />
    </svg>
  );
}

export default function ProgressList() {
  const [series, setSeries] = useState<ProgressSeries[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.fetchProgress().then(setSeries).catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));
  }, []);

  if (error) return <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>;
  if (!series) return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  if (!series.length) return <p className="text-[var(--muted)]">Log a few workouts and each exercise&apos;s progress shows up here.</p>;

  const groups = [...new Set(series.map((s) => s.workoutName))];
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group} className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{group}</h2>
          <ul className="flex flex-col divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            {series.filter((s) => s.workoutName === group).map((s) => {
              const { value, text, unit } = metricOf(s);
              const first = s.points[0];
              const latest = s.points[s.points.length - 1];
              const change = value(latest) - value(first);
              return (
                <li key={s.exerciseId}>
                  <button onClick={() => setOpen((o) => (o === s.exerciseId ? null : s.exerciseId))} aria-expanded={open === s.exerciseId} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{s.name}</span>
                      <span className="block text-sm text-[var(--muted)]">
                        {text(latest)}
                        {s.points.length > 1 && change !== 0 ? ` · ${change > 0 ? '+' : '−'}${formatWeight(Math.abs(change))} ${unit} since ${new Date(first.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : s.points.length === 1 ? ' · once so far' : ' · steady'}
                      </span>
                    </span>
                    <Sparkline values={s.points.map(value)} />
                  </button>
                  {open === s.exerciseId && <div className="px-4 pb-4"><ProgressChart series={s} /></div>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
