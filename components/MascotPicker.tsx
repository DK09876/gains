'use client';

/**
 * Choosing a mascot: one of the built-in ones (a cute and a swole version of
 * eight animals), one a friend drew and shared, or your own - describe it and
 * it is drawn in a few seconds. Your own can be added to the presets so
 * friends can pick it too.
 */

import { useEffect, useState } from 'react';

import Spot from './Spot';
import * as api from '@/lib/api';
import type { SharedMascot } from '@/lib/db';
import { MOODS, type Drawing } from '@/lib/mascot';
import { mascotChanged, useMyMascot } from '@/lib/mascot-client';
import { useProfile } from '@/lib/profile';

type Tab = 'presets' | 'shared' | 'draw';
type Choice = Drawing & { description: string; fresh?: boolean };

const MOOD_LABELS = { happy: 'Happy', coach: 'Coach', stern: 'Yelling', cheer: 'Cheering' } as const;

function Moods({ drawing }: { drawing: Drawing | null }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {MOODS.map((m) => (
        <div key={m} className="flex flex-col items-center gap-1">
          <Spot drawing={drawing} mood={m} size={64} label={`${drawing?.name ?? 'Spot'}, ${MOOD_LABELS[m]}`} />
          <span className="text-[11px] text-[var(--muted)]">{MOOD_LABELS[m]}</span>
        </div>
      ))}
    </div>
  );
}

export default function MascotPicker() {
  const me = useProfile();
  const mine = useMyMascot();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('presets');
  const [presets, setPresets] = useState<{ builtIn: api.Preset[]; shared: SharedMascot[] } | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [description, setDescription] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open || presets) return;
    api.fetchPresets().then(setPresets).catch((e) => setError(e instanceof Error ? e.message : 'Could not load mascots'));
  }, [open, presets]);

  const current = mine?.mascot ?? null;

  const draw = async () => {
    setError(null);
    setDrawing(true);
    setChoice(null);
    try {
      const { drawing: d, left } = await api.drawMascot(description);
      setChoice({ ...d, description, fresh: true });
      setNote(left <= 3 ? `${left} drawing${left === 1 ? '' : 's'} left today.` : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draw that');
    } finally {
      setDrawing(false);
    }
  };

  const use = async () => {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      await api.saveMascot(choice, choice.description);
      if (choice.fresh && share) await api.sharePreset(choice, choice.description);
      mascotChanged();
      setPresets(null);
      setOpen(false);
      setChoice(null);
      setNote(choice.fresh && share ? `${choice.name} is yours, and in the presets for everyone.` : `${choice.name} is your mascot now.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that');
    } finally {
      setBusy(false);
    }
  };

  const backToSpot = async () => {
    await api.resetMascot().catch(() => {});
    mascotChanged();
    setNote('Spot is back.');
  };

  const unshare = async (id: string) => {
    try {
      await api.unsharePreset(id);
      setPresets((p) => p && { ...p, shared: p.shared.filter((s) => s.id !== id) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove it');
    }
  };

  const card = (d: Choice, sub: string, key: string, remove?: () => void, title = d.name) => {
    const picked = choice?.body === d.body;
    return (
      <li key={key} className="relative">
        <button
          onClick={() => setChoice(d)}
          aria-pressed={picked}
          className={`flex w-full flex-col items-center gap-1 rounded-2xl border p-2 ${picked ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] bg-[var(--surface)]'}`}
        >
          <Spot drawing={d} mood="happy" size={56} label={d.name} />
          <span className="w-full truncate text-center text-xs font-semibold">{title}</span>
          <span className="w-full truncate text-center text-[10px] text-[var(--muted)]">{sub}</span>
        </button>
        {remove && <button onClick={remove} aria-label={`Remove ${d.name} from the presets`} className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)] text-xs text-[var(--muted)]">✕</button>}
      </li>
    );
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Your mascot</h2>
      {!open && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="font-bold">{current?.name ?? 'Spot'}</p>
          <Moods drawing={current} />
          <div className="flex gap-2">
            <button onClick={() => { setOpen(true); setNote(null); }} className="flex-1 rounded-xl bg-[var(--accent)] py-3 font-bold text-[var(--on-accent)]">Change mascot</button>
            {current && <button onClick={backToSpot} className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm">Back to Spot</button>}
          </div>
        </div>
      )}
      {note && !open && <p role="status" className="text-sm text-[var(--accent)]">{note}</p>}

      {open && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div role="tablist" aria-label="Mascots" className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--background)] p-1">
            {([['presets', 'Presets'], ['shared', 'Friends\' picks'], ['draw', 'Draw your own']] as const).map(([t, label]) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setChoice(null); setError(null); }}
                className={`rounded-lg py-2.5 text-xs font-semibold ${tab === t ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--muted)]'}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'presets' && (
            !presets ? <p className="text-sm text-[var(--muted)]">Loading…</p> : (
              <ul className="grid grid-cols-4 gap-2">
                {presets.builtIn.map((p) => {
                  const [animal, style] = p.id.split('-');
                  return card({ ...p, description: p.description }, style, p.id, undefined, animal.charAt(0).toUpperCase() + animal.slice(1));
                })}
              </ul>
            )
          )}

          {tab === 'shared' && (
            !presets ? <p className="text-sm text-[var(--muted)]">Loading…</p> : presets.shared.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Nobody has shared one yet. Draw your own and it shows up here for everyone.</p>
            ) : (
              <ul className="grid grid-cols-4 gap-2">
                {presets.shared.map((s) => card(s, `by ${s.createdBy === me ? 'you' : s.createdByName}`, s.id, s.createdBy === me ? () => unshare(s.id) : undefined))}
              </ul>
            )
          )}

          {tab === 'draw' && (
            mine && !mine.canDraw ? <p className="text-sm text-[var(--muted)]">Drawing mascots isn&apos;t set up on this server.</p> : (
              <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (!drawing && description.trim().length >= 3) void draw(); }}>
                <label htmlFor="mascot-description" className="text-sm">Describe your mascot</label>
                <textarea
                  id="mascot-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  maxLength={200}
                  placeholder="a grumpy kettlebell with a mohawk"
                  className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--accent)]"
                />
                <button disabled={drawing || description.trim().length < 3} className="rounded-xl bg-[var(--accent)] py-3 font-bold text-[var(--on-accent)] disabled:opacity-50">
                  {drawing ? 'Drawing… about 15 seconds' : choice ? 'Draw it again' : 'Draw it'}
                </button>
              </form>
            )
          )}

          {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}

          {choice && (
            <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3">
              {choice.fresh ? (
                <label className="flex flex-col gap-1 text-sm">
                  Name
                  <input value={choice.name} maxLength={24} onChange={(e) => setChoice({ ...choice, name: e.target.value })}
                    className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--accent)]" />
                </label>
              ) : <p className="font-bold">{choice.name}</p>}
              <Moods drawing={choice} />
              {choice.fresh && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
                  Add to presets so friends can pick it
                </label>
              )}
              {note && <p className="text-xs text-[var(--muted)]">{note}</p>}
              <button onClick={use} disabled={busy} className="rounded-xl bg-[var(--accent)] py-3 font-bold text-[var(--on-accent)] disabled:opacity-50">
                {busy ? 'Saving…' : `Use ${choice.name || 'this'}`}
              </button>
            </div>
          )}

          <button onClick={() => { setOpen(false); setChoice(null); setError(null); }} className="py-2 text-sm text-[var(--muted)]">Cancel</button>
        </div>
      )}
    </section>
  );
}
