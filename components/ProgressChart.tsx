'use client';

/**
 * One exercise's progress: its top set in every workout, as a line over time.
 * Dates are spaced as they happened, so a two-week gap looks like one. Drag
 * or tap along it to read any workout; "Every workout" lists them all.
 *
 * One series, so no legend - the heading says what it is - and the only
 * label on the chart is the latest value at the end of the line.
 */

import { useEffect, useRef, useState } from 'react';

import type { ProgressPoint, ProgressSeries } from '@/lib/db';
import { UNIT } from '@/lib/format';
import { formatWeight } from '@/lib/suggest';

/** What the line plots: weight for a lift, reps for a bodyweight one, seconds when timed. */
export function metricOf(series: ProgressSeries): { value: (p: ProgressPoint) => number; unit: string; text: (p: ProgressPoint) => string } {
  if (series.kind === 'timed') return { value: (p) => p.reps ?? 0, unit: 's', text: (p) => `${p.reps ?? 0} s` };
  if (series.points.every((p) => !p.weight)) return { value: (p) => p.reps ?? 0, unit: 'reps', text: (p) => `${p.reps ?? 0} reps` };
  return { value: (p) => p.weight ?? 0, unit: UNIT, text: (p) => `${formatWeight(p.weight ?? 0)} ${UNIT}${p.reps ? ` × ${p.reps}` : ''}` };
}

/** Round tick values covering [lo, hi]: steps of 1, 2, 2.5 or 5 × a power of ten. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (lo === hi) { lo -= 5; hi += 5; }
  const raw = (hi - lo) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw)!;
  const start = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let v = Math.max(0, start); v <= hi + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1] < hi) ticks.push(Math.round((ticks[ticks.length - 1] + step) * 100) / 100);
  return ticks;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const H = 200;
const PAD = { left: 36, right: 52, top: 14, bottom: 26 };

export default function ProgressChart({ series }: { series: ProgressSeries }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { value, text, unit } = metricOf(series);
  const points = series.points;
  const values = points.map(value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const times = points.map((p) => Date.parse(p.date));
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const xs = times.map(x);
  const ys = values.map(y);
  const line = xs.map((px, i) => `${i ? 'L' : 'M'}${px},${ys[i]}`).join(' ');
  const area = `${line} L${xs[xs.length - 1]},${PAD.top + plotH} L${xs[0]},${PAD.top + plotH} Z`;
  const last = points.length - 1;

  const pick = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left;
    let best = 0;
    xs.forEach((cx, i) => { if (Math.abs(cx - px) < Math.abs(xs[best] - px)) best = i; });
    setHover(best);
  };

  const shown = hover ?? null;

  return (
    <figure className="m-0">
      <div
        ref={box}
        className="relative touch-pan-y select-none"
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <svg width={width} height={H} role="img" aria-label={`${series.name}: ${text(points[0])} on ${shortDate(points[0].date)}, ${text(points[last])} on ${shortDate(points[last].date)}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted)" className="tabular">{formatWeight(t)}</text>
            </g>
          ))}
          <text x={PAD.left} y={H - 6} fontSize="11" fill="var(--muted)">{shortDate(points[0].date)}</text>
          {last > 0 && <text x={width - PAD.right} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor="end">{shortDate(points[last].date)}</text>}

          {last > 0 && <path d={area} fill="var(--accent)" fillOpacity="0.1" />}
          {last > 0 && <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          {shown !== null && <line x1={xs[shown]} x2={xs[shown]} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--muted)" strokeWidth="1" />}
          {xs.map((cx, i) => (
            <circle key={i} cx={cx} cy={ys[i]} r={i === shown || i === last ? 5 : 4} fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          ))}
          <text x={xs[last] + 9} y={ys[last]} dy="0.32em" fontSize="12" fontWeight="700" fill="var(--foreground)" className="tabular">
            {formatWeight(values[last])}{unit === UNIT ? '' : ` ${unit}`}
          </text>
        </svg>
        {shown !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(xs[shown] - 60, 0), width - 130) }}
          >
            <p className="text-[var(--muted)]">{shortDate(points[shown].date)}</p>
            <p className="tabular font-semibold">{text(points[shown])}</p>
          </div>
        )}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-[var(--muted)]">Every workout</summary>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-xs text-[var(--muted)]"><th className="py-1 font-medium">Date</th><th className="py-1 text-right font-medium">Top set</th></tr></thead>
          <tbody>
            {[...points].reverse().map((p, i) => (
              <tr key={i} className="border-t border-[var(--border)]"><td className="py-1.5">{shortDate(p.date)}</td><td className="tabular py-1.5 text-right">{text(p)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
