'use client';

/**
 * Bring workouts in from a Google Sheet: File → Download → Comma-separated
 * values (.csv), then pick that file here. It is read first and shown, so
 * you can see what it found - and what it could not place - before adding.
 */

import { useState } from 'react';

import * as api from '@/lib/api';
import type { Place } from '@/lib/db';
import type { ParsedSheet } from '@/lib/sheet';

export default function ImportSheet({ place, onImported }: { place: Place; onImported: () => void }) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ParsedSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const read = async (text: string) => {
    setCsv(text);
    setError(null);
    setPreview(null);
    try {
      setPreview(await api.importSheet(text, true));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file');
    }
  };

  const add = async () => {
    setBusy(true);
    try {
      await api.importSheet(csv, false, place);
      setPreview(null);
      setCsv('');
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-[var(--muted)]">
        In Google Sheets: <b>File → Download → Comma-separated values</b>, then pick the file. Each workout&apos;s name goes in the
        first column with its exercises under it; weights like &ldquo;95 lbs&rdquo; and YouTube links are picked up.
      </p>
      <label className="mt-3 inline-block cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]">
        Choose CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) await read(await file.text());
          }}
        />
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      {preview && (
        <div className="mt-4 rounded-xl border border-[var(--border)] p-3">
          <p className="font-medium">Found {preview.workouts.length} workout{preview.workouts.length === 1 ? '' : 's'}:</p>
          <ul className="mt-2 text-sm">
            {preview.workouts.map((w, i) => (
              <li key={i} className="py-0.5">
                <b>{w.name}</b> <span className="text-[var(--muted)]">- {w.exercises.map((e) => e.name).join(', ')}</span>
              </li>
            ))}
          </ul>
          {preview.skipped.length > 0 && (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Left out (not under a workout name): {preview.skipped.map((s) => `“${s}”`).join(', ')}
            </p>
          )}
          <button onClick={add} disabled={busy} className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--on-accent)] disabled:opacity-50">
            {busy ? 'Adding…' : `Add ${preview.workouts.length} workout${preview.workouts.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  );
}
