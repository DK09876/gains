'use client';

/**
 * Your mascot and reminders: which mascot, how loud it is, which reminders he sends and when,
 * and turning notifications on for this phone. Every change saves at once.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import MascotPicker from '@/components/MascotPicker';
import Spot, { type Mood } from '@/components/Spot';
import * as api from '@/lib/api';
import { useMascotName } from '@/lib/mascot-client';
import { notifyState, turnOn, type NotifyState } from '@/lib/notify';
import { pickLine, TONE_LABELS, TONE_NOTES, TONES, type Tone } from '@/lib/spot';

const MOODS: Record<Tone, Mood> = { hype: 'happy', coach: 'coach', drill: 'stern' };

const TOGGLES = [
  ['day', 'Training day', "If a planned day hasn't started by your time"],
  ['friend', 'Friends finishing', 'When someone else finishes a workout'],
  ['week', 'Monday kick-off', "Last week's tally and what's first"],
  ['open', 'Workout left open', '2 hours after your last set'],
  ['rest', "Rest's up", 'When rest ends, even with the phone locked'],
] as const;

export default function Reminders() {
  const [state, setState] = useState<api.Reminders | null>(null);
  const [phone, setPhone] = useState<NotifyState>('unsupported');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const name = useMascotName();

  useEffect(() => {
    api.fetchReminders()
      .then((r) => { setState(r); setPhone(notifyState()); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));
  }, []);

  if (!state) return error ? <p role="alert" className="text-[var(--danger)]">{error}</p> : <p className="text-sm text-[var(--muted)]">Loading…</p>;
  const { prefs } = state;
  const { muted } = state;

  const save = async (change: Parameters<typeof api.updateReminders>[0]) => {
    setError(null);
    try {
      setState(await api.updateReminders(change));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };

  const enable = async () => {
    setError(null);
    setNote(null);
    try {
      const next = await turnOn(state.publicKey);
      setPhone(next);
      setState(await api.fetchReminders());
      if (next === 'on') setNote('Notifications are on for this phone.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn notifications on');
    }
  };

  const test = async () => {
    setError(null);
    try {
      await api.testPush();
      setNote('Sent. It should arrive in a few seconds.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send');
    }
  };

  const sample = muted ? "Fine. I'll be quiet until tomorrow." : pickLine('day', prefs.tone, { workout: 'Pull' }, [], 1).text;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/" className="-ml-1 inline-block px-1 py-3 text-sm text-[var(--muted)]">← Today</Link>
        <h1 className="text-2xl font-bold">Mascot and reminders</h1>
      </div>

      <section className="flex items-center gap-3">
        <Spot mood={muted ? 'coach' : MOODS[prefs.tone]} size={76} />
        <p className="flex-1 rounded-2xl rounded-tl-sm border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">{sample}</p>
      </section>

      <MascotPicker />

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">How loud?</h2>
        <div role="radiogroup" aria-label="Spot's tone" className="grid grid-cols-3 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1">
          {TONES.map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={prefs.tone === t}
              onClick={() => save({ tone: t })}
              className={`rounded-xl py-3 text-sm font-bold ${prefs.tone === t ? 'bg-[var(--best)] text-[#0f1211]' : 'text-[var(--muted)]'}`}
            >
              {TONE_LABELS[t]}
            </button>
          ))}
        </div>
        <p className="text-sm text-[var(--muted)]">{TONE_NOTES[prefs.tone]}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">This phone</h2>
        {!state.canPush ? (
          <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">Notifications aren&apos;t set up on the server yet.</p>
        ) : phone === 'install-first' ? (
          <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
            On an iPhone, notifications only work once Gains is on your Home Screen: tap <b>Share</b>, then <b>Add to Home Screen</b>, and open Gains from there.
          </p>
        ) : phone === 'unsupported' ? (
          <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">This browser can&apos;t receive notifications.</p>
        ) : phone === 'denied' ? (
          <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">Notifications are blocked for Gains. Allow them in your phone&apos;s Settings, under Notifications, then come back.</p>
        ) : phone === 'on' ? (
          <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="flex-1 text-sm">Notifications are on{state.phones > 1 ? ` (${state.phones} phones)` : ''}.</p>
            <button onClick={test} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm">Send a test</button>
          </div>
        ) : (
          <button onClick={enable} className="rounded-2xl bg-[var(--accent)] py-3.5 font-bold text-[var(--on-accent)]">Turn on notifications</button>
        )}
        {note && <p role="status" className="text-sm text-[var(--accent)]">{note}</p>}
        {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      </section>

      <section className="flex flex-col divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        {TOGGLES.map(([key, label, hint]) => (
          <div key={key} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p>{label}</p>
              <p className="text-xs text-[var(--muted)]">
                {hint}
                {key === 'day' && prefs.day && (
                  <>
                    {' · '}
                    <label className="inline-flex items-center gap-1">
                      at
                      <input
                        type="time"
                        value={prefs.dayTime}
                        onChange={(e) => e.target.value && save({ dayTime: e.target.value })}
                        className="rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[var(--foreground)]"
                      />
                    </label>
                  </>
                )}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={prefs[key]}
              aria-label={label}
              onClick={() => save({ [key]: !prefs[key] })}
              className={`relative h-[30px] w-[50px] shrink-0 rounded-full ${prefs[key] ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}
            >
              <span className={`absolute top-[3px] h-6 w-6 rounded-full bg-white transition-[left] ${prefs[key] ? 'left-[23px]' : 'left-[3px]'}`} />
            </button>
          </div>
        ))}
      </section>

      <button
        onClick={() => save({ mute: muted ? null : 'today' })}
        className="rounded-2xl border border-[var(--border)] py-3.5"
      >
        {muted ? `${name} is muted until tomorrow · Unmute` : `Mute ${name} for today`}
      </button>
      <p className="text-center text-xs text-[var(--muted)]">At most one reminder a day besides rest and friends. If three go unopened, {name} stops until you next open Gains.</p>
    </div>
  );
}
