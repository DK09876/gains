'use client';

/**
 * Spot's line at the top of Today: what today is, in the tone each person
 * picked. The line is chosen from the date, so it stays put through the day
 * instead of changing on every visit.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import Spot, { type Mood } from './Spot';
import * as api from '@/lib/api';
import { daySeed, pickLine, TONE_LABELS, type Moment, type Tone } from '@/lib/spot';

const MOODS: Record<Tone, Mood> = { hype: 'happy', coach: 'coach', drill: 'stern' };

export function useTone(): { tone: Tone; muted: boolean } | null {
  const [state, setState] = useState<{ tone: Tone; muted: boolean } | null>(null);
  useEffect(() => {
    api.fetchReminders().then((r) => setState({ tone: r.prefs.tone, muted: r.muted })).catch(() => setState({ tone: 'coach', muted: false }));
  }, []);
  return state;
}

export default function SpotLine({ moment, vars, now }: { moment: Moment; vars: Record<string, string | number>; now: Date }) {
  const tone = useTone();
  if (!tone || tone.muted) return null;
  const line = pickLine(moment, tone.tone, vars, [], daySeed(now));
  return (
    <section className="flex items-start gap-3">
      <Spot mood={moment === 'doneToday' ? 'happy' : MOODS[tone.tone]} size={50} />
      <div className="flex-1 rounded-2xl rounded-tl-sm border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
        <p className="leading-snug">{line.text}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">Spot · {TONE_LABELS[tone.tone]} · <Link href="/reminders" className="underline">change</Link></p>
      </div>
    </section>
  );
}
