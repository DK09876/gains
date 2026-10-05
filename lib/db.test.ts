/**
 * Storage: profiles keep workouts apart, sessions are a record that editing
 * the plan never rewrites, and uploaded files go only when nothing uses them.
 *
 * Each test gets its own database file. DB_PATH is read when the module
 * loads, so the module is re-imported after pointing it somewhere new.
 */

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SheetWorkout } from './sheet';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gains-db-'));
  vi.stubEnv('GAINS_DB_PATH', join(dir, 'gains.db'));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

const load = () => import('./db');

async function withLegs() {
  const db = await load();
  db.addProfile('dk', 'DK');
  const workout = db.createWorkout('dk', 'Legs');
  const squat = db.addExercise(workout, { name: 'Squat', sets: 3, reps: '8', targetWeight: 95 });
  const lunge = db.addExercise(workout, { name: 'Lunges', targetWeight: 10, weightNote: 'each' });
  return { db, workout, squat, lunge };
}

describe('profiles', () => {
  it('keep each profile\'s workouts to itself', async () => {
    const { db, workout } = await withLegs();
    db.addProfile('kevin', 'Kevin');
    expect(db.listWorkouts('kevin')).toEqual([]);
    expect(db.getWorkout(workout, 'kevin')).toBeNull();
    expect(db.getWorkout(workout, 'dk')?.exercises.map((e) => e.name)).toEqual(['Squat', 'Lunges']);
  });

  it('get an id from the name, and a second one of the same name its own', async () => {
    const db = await load();
    expect(db.createProfile('Kévin').id).toBe('kevin');
    expect(db.createProfile('Kevin').id).toBe('kevin-2');
  });
});

describe('workouts', () => {
  it('reorder, with any not named keeping their place after', async () => {
    const db = await load();
    db.addProfile('dk', 'DK');
    const [a, b, c] = ['A', 'B', 'C'].map((n) => db.createWorkout('dk', n));
    db.reorderWorkouts('dk', [c, a]);
    expect(db.listWorkouts('dk').map((w) => w.id)).toEqual([c, a, b]);
  });

  it('copy into another profile with their exercises and clips', async () => {
    const { db, workout, squat } = await withLegs();
    db.addMedia(squat, { kind: 'upload', file: 'f.gif', mime: 'image/gif' });
    db.addProfile('kevin', 'Kevin');
    const copy = db.copyWorkout(workout, 'kevin')!;
    const theirs = db.getWorkout(copy, 'kevin')!;
    expect(theirs.exercises.map((e) => [e.name, e.targetWeight])).toEqual([['Squat', 95], ['Lunges', 10]]);
    expect(theirs.exercises[0].media[0]).toMatchObject({ kind: 'upload', file: 'f.gif' });
    // Separate from here on: changing the copy leaves the original alone.
    db.updateExercise(theirs.exercises[0].id, { targetWeight: 50 });
    expect(db.getWorkout(workout, 'dk')!.exercises[0].targetWeight).toBe(95);
  });

  it('are at the gym unless made at home, and can move between them', async () => {
    const db = await load();
    db.addProfile('dk', 'DK');
    const gym = db.createWorkout('dk', 'Push');
    const home = db.createWorkout('dk', 'Bodyweight', '', 'home');
    expect(db.listWorkouts('dk').map((w) => [w.name, w.place])).toEqual([['Push', 'gym'], ['Bodyweight', 'home']]);
    db.updateWorkout(gym, { place: 'home' });
    expect(db.getWorkout(gym, 'dk')!.place).toBe('home');
    db.addProfile('kevin', 'Kevin');
    expect(db.getWorkout(db.copyWorkout(home, 'kevin')!, 'kevin')!.place).toBe('home');
    expect(db.getWorkout(db.copyWorkout(home, 'kevin', 'gym')!, 'kevin')!.place).toBe('gym');
    expect(db.getWorkout(db.importWorkouts('dk', [{ name: 'Legs', exercises: [] }], 'home')[0], 'dk')!.place).toBe('home');
  });

  it('made before there were places are at the gym', async () => {
    const { Database } = await import('node-sqlite3-wasm');
    const old = new Database(process.env.GAINS_DB_PATH!);
    old.run(`CREATE TABLE workouts (id TEXT PRIMARY KEY, profileId TEXT NOT NULL, name TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`);
    old.run(`INSERT INTO workouts VALUES ('w1', 'dk', 'Legs', '', 0, 'x', 'x')`);
    old.close();
    const db = await load();
    db.addProfile('dk', 'DK');
    expect(db.listWorkouts('dk')).toMatchObject([{ id: 'w1', place: 'gym' }]);
  });

  it('import from a sheet, clips and all', async () => {
    const db = await load();
    db.addProfile('dk', 'DK');
    const sheet: SheetWorkout[] = [{
      name: 'Push',
      exercises: [{ name: 'Bench', section: '', notes: '', targetWeight: 10, weightNote: 'each side', urls: ['https://youtu.be/abcdefgh'] }],
    }];
    const [id] = db.importWorkouts('dk', sheet);
    const push = db.getWorkout(id, 'dk')!;
    expect(push.exercises[0]).toMatchObject({ name: 'Bench', targetWeight: 10, weightNote: 'each side' });
    expect(push.exercises[0].media[0]).toMatchObject({ kind: 'url', url: 'https://youtu.be/abcdefgh' });
  });
});

describe('uploaded files', () => {
  it('are only handed back for removal once no clip uses them', async () => {
    const { db, workout, squat } = await withLegs();
    const clip = db.addMedia(squat, { kind: 'upload', file: 'shared.mp4', mime: 'video/mp4' });
    db.addProfile('kevin', 'Kevin');
    const copy = db.copyWorkout(workout, 'kevin')!;
    expect(db.deleteMedia(squat, clip.id)).toEqual([]);
    expect(db.deleteWorkout(copy)).toEqual(['shared.mp4']);
  });

  it('are not removed through another exercise', async () => {
    const { db, squat, lunge } = await withLegs();
    const clip = db.addMedia(squat, { kind: 'upload', file: 'x.gif', mime: 'image/gif' });
    expect(db.deleteMedia(lunge, clip.id)).toEqual([]);
    expect(db.getWorkout(db.exerciseOwner(squat)!.workoutId, 'dk')!.exercises[0].media).toHaveLength(1);
  });
});

describe('sessions', () => {
  it('copy the workout, so editing the plan later does not rewrite them', async () => {
    const { db, workout, squat } = await withLegs();
    const id = db.startSession('dk', workout)!;
    db.updateExercise(squat, { name: 'Back squat', targetWeight: 135 });
    db.deleteExercise(squat);
    const session = db.getSession(id, 'dk')!;
    expect(session.entries[0]).toMatchObject({ name: 'Squat', targetWeight: 95, exerciseId: null });
  });

  it('allow one at a time: starting again returns the one under way', async () => {
    const { db, workout } = await withLegs();
    const first = db.startSession('dk', workout);
    expect(db.startSession('dk', workout)).toBe(first);
    expect(db.activeSession('dk')).toBe(first);
    db.finishSession(first!);
    expect(db.activeSession('dk')).toBeNull();
  });

  it('keep sets as logged, and renumber when one is removed', async () => {
    const { db, workout } = await withLegs();
    const id = db.startSession('dk', workout)!;
    const entry = db.getSession(id, 'dk')!.entries[0].id;
    db.logSet(id, entry, { setNumber: 1, weight: 95, reps: 8, done: true });
    db.logSet(id, entry, { setNumber: 2, weight: 100, reps: 8, done: true });
    db.logSet(id, entry, { setNumber: 3, weight: 105, reps: 5, done: true });
    db.logSet(id, entry, { setNumber: 2, weight: 100, reps: 6, done: true });
    db.deleteSet(id, entry, 2);
    expect(db.getSession(id, 'dk')!.entries[0].logged.map((s) => [s.setNumber, s.weight, s.reps])).toEqual([[1, 95, 8], [2, 105, 5]]);
  });

  it('refuse a set for an exercise in another session', async () => {
    const { db, workout } = await withLegs();
    const a = db.startSession('dk', workout)!;
    const entry = db.getSession(a, 'dk')!.entries[0].id;
    db.finishSession(a);
    const b = db.startSession('dk', workout)!;
    expect(db.logSet(b, entry, { setNumber: 1, weight: 1, reps: 1, done: true })).toBe(false);
  });

  it('show last time from the latest finished session that did the exercise', async () => {
    const { db, workout, squat } = await withLegs();
    const first = db.startSession('dk', workout)!;
    db.logSet(first, db.getSession(first, 'dk')!.entries[0].id, { setNumber: 1, weight: 95, reps: 8, done: true });
    db.finishSession(first);
    // A later session that skipped squats does not hide the one that did them.
    const skipped = db.startSession('dk', workout)!;
    db.finishSession(skipped);

    const now = db.startSession('dk', workout)!;
    const [squatEntry, lungeEntry] = db.getSession(now, 'dk')!.entries;
    expect(squatEntry.exerciseId).toBe(squat);
    expect(squatEntry.last?.sets.map((s) => s.weight)).toEqual([95]);
    expect(lungeEntry.last).toBeNull();
  });

  it('are listed newest first once finished, and belong to their profile', async () => {
    const { db, workout } = await withLegs();
    const id = db.startSession('dk', workout)!;
    db.logSet(id, db.getSession(id, 'dk')!.entries[0].id, { setNumber: 1, weight: 95, reps: 8, done: true });
    expect(db.listSessions('dk')).toEqual([]);
    db.finishSession(id);
    expect(db.listSessions('dk')).toMatchObject([{ id, workoutName: 'Legs', setsDone: 1, exercisesDone: 1 }]);
    db.addProfile('kevin', 'Kevin');
    expect(db.getSession(id, 'kevin')).toBeNull();
    db.deleteSession(id);
    expect(db.listSessions('dk')).toEqual([]);
  });

  it('outlive their workout being deleted', async () => {
    const { db, workout } = await withLegs();
    const id = db.startSession('dk', workout)!;
    db.finishSession(id);
    db.deleteWorkout(workout);
    expect(db.getSession(id, 'dk')).toMatchObject({ workoutId: null, workoutName: 'Legs' });
    expect(db.getSession(id, 'dk')!.entries).toHaveLength(2);
  });
});
