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

describe('copying a whole plan', () => {
  it('copies every workout, clips and week, without the weights', async () => {
    const { db, workout, squat } = await withLegs();
    db.addMedia(squat, { kind: 'url', url: 'https://youtu.be/abcdefgh' });
    const push = db.createWorkout('dk', 'Push');
    db.setDay('dk', 1, workout);
    db.setDay('dk', 2, push);
    db.setDay('dk', 4, 'rest');
    db.addProfile('sam', 'Sam');
    expect(db.plansToCopy('sam')).toEqual([{ id: 'dk', name: 'DK', workouts: 2, week: ['', 'Legs', 'Push', '', 'Rest', '', ''] }]);
    expect(db.plansToCopy('dk')).toEqual([]);

    expect(db.copyPlan('dk', 'sam')).toBe(2);
    const mine = db.listWorkouts('sam');
    expect(mine.map((w) => w.name)).toEqual(['Legs', 'Push']);
    const legs = db.getWorkout(mine[0].id, 'sam')!;
    expect(legs.exercises.map((e) => [e.name, e.targetWeight, e.sets])).toEqual([['Squat', null, 3], ['Lunges', null, null]]);
    expect(legs.exercises[0].media[0].url).toBe('https://youtu.be/abcdefgh');
    expect(db.getSchedule('sam')).toEqual([null, mine[0].id, mine[1].id, null, 'rest', null, null]);
    // The original is untouched.
    expect(db.getWorkout(workout, 'dk')!.exercises[0].targetWeight).toBe(95);
  });
});

describe('the week', () => {
  it('plans days with this profile\'s workouts or rest, and forgets a deleted workout', async () => {
    const { db, workout } = await withLegs();
    db.addProfile('kevin', 'Kevin');
    const theirs = db.createWorkout('kevin', 'Push');
    expect(db.setDay('dk', 1, workout)).toBe(true);
    expect(db.setDay('dk', 4, 'rest')).toBe(true);
    expect(db.setDay('dk', 2, theirs)).toBe(false);
    expect(db.setDay('dk', 7, 'rest')).toBe(false);
    expect(db.getSchedule('dk')).toEqual([null, workout, null, null, 'rest', null, null]);
    expect(db.getSchedule('kevin')).toEqual(Array(7).fill(null));
    db.setDay('dk', 1, 'rest');
    expect(db.getSchedule('dk')[1]).toBe('rest');
    db.setDay('dk', 1, workout);
    db.setDay('dk', 4, null);
    db.deleteWorkout(workout);
    expect(db.getSchedule('dk')).toEqual(Array(7).fill(null));
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

describe('exercise kinds', () => {
  it('are guessed for new exercises and can be changed', async () => {
    const db = await load();
    db.addProfile('dk', 'DK');
    const w = db.createWorkout('dk', 'Legs');
    const walk = db.addExercise(w, { name: 'Walk', section: 'Warm up' });
    const plank = db.addExercise(w, { name: 'Plank', section: 'Warm up', reps: '45-60 s', sets: 3 });
    const squat = db.addExercise(w, { name: 'Squat', section: 'Workout', restSeconds: 120 });
    const kinds = () => db.getWorkout(w, 'dk')!.exercises.map((e) => [e.name, e.kind, e.restSeconds]);
    expect(kinds()).toEqual([['Walk', 'check', null], ['Plank', 'timed', null], ['Squat', 'lift', 120]]);
    db.updateExercise(walk, { kind: 'lift' });
    expect(db.getWorkout(w, 'dk')!.exercises[0].kind).toBe('lift');
    void plank; void squat;
  });

  it('are given to exercises and open workouts that predate them, once', async () => {
    const { Database } = await import('node-sqlite3-wasm');
    const old = new Database(process.env.GAINS_DB_PATH!);
    old.run(`CREATE TABLE exercises (id TEXT PRIMARY KEY, workoutId TEXT NOT NULL, position INTEGER NOT NULL, section TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', sets INTEGER, reps TEXT NOT NULL DEFAULT '', targetWeight REAL,
      weightNote TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL)`);
    old.run(`CREATE TABLE session_exercises (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, exerciseId TEXT, position INTEGER NOT NULL,
      section TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', sets INTEGER, reps TEXT NOT NULL DEFAULT '',
      targetWeight REAL, weightNote TEXT NOT NULL DEFAULT '')`);
    old.run(`INSERT INTO exercises VALUES ('walk', 'w', 0, 'Warm up', 'Walk', '', NULL, '', NULL, '', 'x'),
      ('plank', 'w', 1, 'Warm up', 'Plank', '', 3, '45-60 s', NULL, '', 'x'), ('squat', 'w', 2, 'Workout', 'Squat', '', 3, '8', 95, '', 'x')`);
    old.run(`INSERT INTO session_exercises VALUES ('e1', 's', 'walk', 0, 'Warm up', 'Walk', '', NULL, '', NULL, '')`);
    old.close();
    const db = await load();
    db.addProfile('dk', 'DK');
    const raw = new (await import('node-sqlite3-wasm')).Database(process.env.GAINS_DB_PATH!);
    expect(raw.all('SELECT id, kind FROM exercises ORDER BY position')).toEqual([
      { id: 'walk', kind: 'check' }, { id: 'plank', kind: 'timed' }, { id: 'squat', kind: 'lift' },
    ]);
    expect(raw.get('SELECT kind FROM session_exercises')).toEqual({ kind: 'check' });
    raw.close();
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

  it('copy each exercise\'s kind and rest when started', async () => {
    const { db, workout, squat } = await withLegs();
    db.updateExercise(squat, { restSeconds: 150 });
    const id = db.startSession('dk', workout)!;
    expect(db.getSession(id, 'dk')!.entries.map((e) => [e.name, e.kind, e.restSeconds])).toEqual([['Squat', 'lift', 150], ['Lunges', 'lift', null]]);
  });

  it('left open too long are closed: thrown away if empty, finished at their last set if not', async () => {
    const { db, workout } = await withLegs();
    const empty = db.startSession('dk', workout)!;
    const raw = new (await import('node-sqlite3-wasm')).Database(process.env.GAINS_DB_PATH!);
    raw.run(`UPDATE sessions SET startedAt = '2026-01-01T10:00:00.000Z' WHERE id = ?`, [empty]);
    expect(db.closeStale('dk', 12 * 3600_000)).toBe(1);
    expect(db.getSession(empty, 'dk')).toBeNull();

    const used = db.startSession('dk', workout)!;
    db.logSet(used, db.getSession(used, 'dk')!.entries[0].id, { setNumber: 1, weight: 95, reps: 8, done: true });
    raw.run(`UPDATE sessions SET startedAt = '2026-01-01T10:00:00.000Z' WHERE id = ?`, [used]);
    raw.run(`UPDATE set_logs SET loggedAt = '2026-01-01T10:20:00.000Z'`);
    raw.close();
    db.closeStale('dk', 12 * 3600_000);
    expect(db.getSession(used, 'dk')!.finishedAt).toBe('2026-01-01T10:20:00.000Z');
    expect(db.activeSession('dk')).toBeNull();
    // A workout started a moment ago is left alone.
    const fresh = db.startSession('dk', workout)!;
    expect(db.closeStale('dk', 12 * 3600_000)).toBe(0);
    expect(db.activeSession('dk')).toBe(fresh);
  });

  it('know the best ever done before them, and compare History with the workout before', async () => {
    const { db, workout, squat } = await withLegs();
    const raw = new (await import('node-sqlite3-wasm')).Database(process.env.GAINS_DB_PATH!);
    const done = (weight: number, day: string) => {
      const id = db.startSession('dk', workout)!;
      db.logSet(id, db.getSession(id, 'dk')!.entries[0].id, { setNumber: 1, weight, reps: 8, done: true });
      db.finishSession(id);
      raw.run('UPDATE sessions SET startedAt = ?, finishedAt = ? WHERE id = ?', [`${day}T10:00:00.000Z`, `${day}T11:00:00.000Z`, id]);
      return id;
    };
    done(100, '2026-10-01');
    const middle = done(90, '2026-10-08');
    done(110, '2026-10-15');
    raw.close();
    expect(db.bestsBefore('dk', [{ id: squat, kind: 'lift' }], '2026-10-08T10:00:00.000Z').get(squat)).toBe(100);
    expect(db.bestsBefore('dk', [{ id: squat, kind: 'lift' }], '2026-10-20T00:00:00.000Z').get(squat)).toBe(110);
    // The middle workout's "last time" is the one before it, not the newest.
    expect(db.getSession(middle, 'dk')!.entries[0].last?.sets[0].weight).toBe(100);
  });

  it('chart each exercise by its top set per workout, oldest first', async () => {
    const { db, workout, squat } = await withLegs();
    const raw = new (await import('node-sqlite3-wasm')).Database(process.env.GAINS_DB_PATH!);
    for (const [day, sets] of [['2026-10-01', [[95, 8], [100, 6]]], ['2026-10-08', [[100, 8], [100, 10]]]] as const) {
      const id = db.startSession('dk', workout)!;
      const entry = db.getSession(id, 'dk')!.entries[0].id;
      sets.forEach(([weight, reps], i) => db.logSet(id, entry, { setNumber: i + 1, weight, reps, done: true }));
      db.finishSession(id);
      raw.run('UPDATE sessions SET startedAt = ? WHERE id = ?', [`${day}T10:00:00.000Z`, id]);
    }
    raw.close();
    const [series] = db.progressSeries('dk');
    expect(series).toMatchObject({ exerciseId: squat, name: 'Squat', workoutName: 'Legs' });
    expect(series.points.map((p) => [p.date.slice(0, 10), p.weight, p.reps])).toEqual([['2026-10-01', 100, 6], ['2026-10-08', 100, 10]]);
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
