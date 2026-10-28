'use client';

/**
 * This week at a glance, Monday to Sunday: what each day is for, which were
 * done and which were missed. On Plan each day is a button that changes it.
 */

import type { StripDay } from '@/lib/week';

interface Props {
  days: StripDay[];
  done: number;
  planned: number;
  /** When given, days are buttons: Plan uses this to change a day. */
  onPick?: (day: StripDay) => void;
  title?: string;
}

const STATE_LABEL: Record<StripDay['state'], string> = {
  done: 'done', missed: 'missed', today: 'today', upcoming: '', rest: '', free: '',
};

function cellClass(day: StripDay): string {
  if (day.state === 'done') return 'bg-[var(--accent)] text-[var(--on-accent)] border-transparent';
  if (day.isToday) return 'border-2 border-[var(--accent)] bg-[var(--surface)]';
  if (day.state === 'missed') return 'border border-dashed border-[var(--muted)]/60 text-[var(--muted)]';
  if (day.state === 'rest' || day.state === 'free') return 'border border-transparent bg-[var(--surface)] text-[var(--muted)]';
  return 'border border-transparent bg-[var(--surface)]';
}

export default function WeekStrip({ days, done, planned, onPick, title = 'This week' }: Props) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</h2>
        {planned > 0 && (
          <span className="text-sm"><b className="text-[var(--accent)]">{done}</b> of {planned} planned day{planned === 1 ? '' : 's'}</span>
        )}
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const body = (
            <>
              <span className={`text-[11px] font-semibold ${day.isToday && day.state !== 'done' ? 'text-[var(--accent)]' : ''}`}>{day.letter}</span>
              <span className="w-full truncate px-0.5 text-center text-[11px] leading-tight">{day.label || '–'}</span>
              <span className={`h-3.5 text-[10px] leading-none ${day.isToday && day.state !== 'done' ? 'text-[var(--accent)]' : ''}`}>
                {day.state === 'done' ? '✓' : STATE_LABEL[day.state]}
              </span>
            </>
          );
          const label = `${day.letter}: ${day.label || 'nothing planned'}${STATE_LABEL[day.state] ? `, ${STATE_LABEL[day.state]}` : ''}`;
          return (
            <li key={day.weekday}>
              {onPick ? (
                <button onClick={() => onPick(day)} aria-label={`${label}. Change`} className={`flex min-h-[64px] w-full flex-col items-center gap-0.5 rounded-xl py-2 ${cellClass(day)}`}>{body}</button>
              ) : (
                <div aria-label={label} className={`flex min-h-[64px] flex-col items-center gap-0.5 rounded-xl py-2 ${cellClass(day)}`}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
