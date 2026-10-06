'use client';

/**
 * One exercise in the plan. Closed, it reads like the plan; open, every
 * field saves when you leave it, and clips can be uploaded from the phone
 * (a GIF or a video from the camera roll) or added as a link.
 */

import { useState } from 'react';

import MediaView from './MediaView';
import * as api from '@/lib/api';
import type { Exercise, Workout } from '@/lib/db';
import { targetText, UNIT } from '@/lib/format';
import { MAX_UPLOAD_MB, viewOf } from '@/lib/media';
import { formatWeight } from '@/lib/suggest';

interface Props {
  exercise: Exercise;
  sections: string[];
  open: boolean;
  onToggle: () => void;
  onChange: (workout: Workout) => void;
  onMove?: (by: number) => void;
  first: boolean;
  last: boolean;
}

type Field = 'name' | 'section' | 'sets' | 'reps' | 'targetWeight' | 'weightNote' | 'notes';

const asText = (e: Exercise): Record<Field, string> => ({
  name: e.name,
  section: e.section,
  sets: e.sets === null ? '' : String(e.sets),
  reps: e.reps,
  targetWeight: e.targetWeight === null ? '' : formatWeight(e.targetWeight),
  weightNote: e.weightNote,
  notes: e.notes,
});

const inputClass = 'w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--accent)]';

export default function ExerciseEditor({ exercise, sections, open, onToggle, onChange, onMove, first, last }: Props) {
  const [values, setValues] = useState(() => asText(exercise));
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const run = async (work: () => Promise<Workout>) => {
    setError(null);
    try {
      onChange(await work());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      return false;
    }
  };

  const saveField = async (field: Field) => {
    if (values[field] === asText(exercise)[field]) return;
    const ok = await run(() => api.updateExercise(exercise.id, { [field]: values[field] }));
    if (!ok) setValues(asText(exercise));
  };

  const field = (name: Field, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <input
        value={values[name]}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
        onBlur={() => saveField(name)}
        className={inputClass}
        {...props}
      />
    </label>
  );

  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center gap-1">
        <button onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 px-4 py-3 text-left">
          <span className="block truncate font-semibold">{exercise.name}</span>
          <span className="block truncate text-sm text-[var(--muted)]">
            {[targetText(exercise) || 'No target', exercise.media.length ? `${exercise.media.length} clip${exercise.media.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}
          </span>
        </button>
        {onMove && (
          <>
            <button onClick={() => onMove(-1)} disabled={first} aria-label={`Move ${exercise.name} up`} className="p-3 text-[var(--muted)] disabled:opacity-20">↑</button>
            <button onClick={() => onMove(1)} disabled={last} aria-label={`Move ${exercise.name} down`} className="p-3 pr-4 text-[var(--muted)] disabled:opacity-20">↓</button>
          </>
        )}
      </div>

      {open && (
        <div className="border-t border-[var(--border)] px-4 pb-4 pt-3">
          {error && <p role="alert" className="mb-3 text-sm text-[var(--danger)]">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {field('name', 'Name', { maxLength: 120 })}
            {field('section', 'Section (optional)', { list: `sections-${exercise.id}`, placeholder: 'e.g. Warm up', maxLength: 60 })}
            <datalist id={`sections-${exercise.id}`}>{sections.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {field('sets', 'Sets', { inputMode: 'numeric', placeholder: '3' })}
            {field('reps', 'Reps', { placeholder: '8-12', maxLength: 30 })}
            {field('targetWeight', `Target (${UNIT})`, { inputMode: 'decimal', placeholder: '–' })}
            {field('weightNote', 'Weight note', { placeholder: 'each side', maxLength: 60 })}
          </div>
          <label className="mt-3 block">
            <span className="text-xs text-[var(--muted)]">Notes</span>
            <textarea
              value={values.notes}
              onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
              onBlur={() => saveField('notes')}
              rows={2}
              maxLength={2000}
              className={inputClass}
            />
          </label>

          <div className="mt-4">
            <p className="text-xs text-[var(--muted)]">Clips</p>
            {exercise.media.length > 0 && (
              <ul className="mt-2 grid gap-3 sm:grid-cols-2">
                {exercise.media.map((m) => {
                  const view = viewOf(m);
                  return (
                    <li key={m.id} className="min-w-0 rounded-lg border border-[var(--border)] p-2">
                      <MediaView media={[m]} compact />
                      <div className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                        <span className="min-w-0 flex-1 truncate">{m.kind === 'upload' ? `Uploaded ${view.type === 'video' ? 'video' : 'image'}` : m.url}</span>
                        <button
                          onClick={() => confirm('Remove this clip?') && run(() => api.deleteMedia(exercise.id, m.id))}
                          className="shrink-0 rounded px-3 py-3 text-[var(--danger)] hover:bg-[var(--surface-hover)]"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className={`cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)] ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
                {uploading ? 'Uploading…' : 'Upload GIF or video'}
                <input
                  type="file"
                  accept="image/gif,image/webp,image/png,image/jpeg,video/*"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) { setError(`Keep clips under ${MAX_UPLOAD_MB} MB`); return; }
                    setUploading(true);
                    await run(() => api.uploadMedia(exercise.id, file));
                    setUploading(false);
                  }}
                />
              </label>
              <form
                className="flex min-w-[14rem] flex-1 gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (link.trim() && await run(() => api.addMediaUrl(exercise.id, link.trim()))) setLink('');
                }}
              >
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="or paste a YouTube / GIF link"
                  aria-label="Clip link"
                  inputMode="url"
                  className={`${inputClass} min-w-0 flex-1 text-sm`}
                />
                <button disabled={!link.trim()} className="rounded-lg border border-[var(--border)] px-3 text-sm disabled:opacity-40">Add</button>
              </form>
            </div>
          </div>

          <button
            onClick={() => confirm(`Delete ${exercise.name}? Past workouts keep what you logged.`) && run(() => api.deleteExercise(exercise.id))}
            className="mt-3 py-3 text-sm text-[var(--danger)]"
          >
            Delete exercise
          </button>
        </div>
      )}
    </li>
  );
}
