/**
 * Storage. One SQLite file, same shape as LifeOS and MTG Tracker on the same Pi.
 *
 * A profile owns workouts; a workout is an ordered list of exercises, each
 * with its target and any number of clips. A session is one time you did a
 * workout: starting one copies the workout's exercises into it, so editing
 * the plan later - renaming, reordering, deleting - never rewrites what you
 * actually did. Each copied exercise still points back at the original, for
 * its clips and for "last time".
 *
 * Profiles are separation, not security - anyone who can reach the app can
 * pick any profile, which is fine on a private tailnet.
 *
 * WASM SQLite, not the native addon: better-sqlite3 segfaults on the Pi
 * (Debian 13 aarch64), prebuilt and from source alike.
 */

import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';

import { Database } from 'node-sqlite3-wasm';

import { guessKind, type Kind } from './kinds';
import type { Drawing } from './mascot';
import type { Media, MediaKind } from './media';
import type { Place } from './places';
import type { DayPlan } from './week';

export { isPlace, PLACES, type Place } from './places';
import type { SheetWorkout } from './sheet';
import type { Tone } from './spot';
import type { LoggedSet } from './suggest';

const DB_PATH = process.env.GAINS_DB_PATH || `${process.cwd()}/data/gains.db`;

/** Uploaded clips live beside the database, so one folder is the whole backup. */
export const MEDIA_DIR = process.env.GAINS_MEDIA_DIR || join(dirname(DB_PATH), 'media');

let db: Database | null = null;

function open(): Database {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.run(`CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL)`);
  db.run(`
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      profileId TEXT NOT NULL,
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  // Added after launch: where a workout is done. Older ones were all at the gym.
  if (!(db.all('PRAGMA table_info(workouts)') as Array<{ name: string }>).some((c) => c.name === 'place')) {
    db.run(`ALTER TABLE workouts ADD COLUMN place TEXT NOT NULL DEFAULT 'gym'`);
  }
  db.run(`CREATE INDEX IF NOT EXISTS idx_workouts_profile ON workouts (profileId)`);
  // One row per planned day; a null workout is a rest day, a missing row nothing planned.
  db.run(`
    CREATE TABLE IF NOT EXISTS schedule (
      profileId TEXT NOT NULL,
      weekday INTEGER NOT NULL,
      workoutId TEXT,
      PRIMARY KEY (profileId, weekday)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      workoutId TEXT NOT NULL,
      position INTEGER NOT NULL,
      section TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      sets INTEGER,
      reps TEXT NOT NULL DEFAULT '',
      targetWeight REAL,
      weightNote TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_exercises_workout ON exercises (workoutId)`);
  db.run(`
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      exerciseId TEXT NOT NULL,
      position INTEGER NOT NULL,
      kind TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      file TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_media_exercise ON media (exerciseId)`);
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      profileId TEXT NOT NULL,
      workoutId TEXT,
      workoutName TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      finishedAt TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions (profileId, startedAt)`);
  db.run(`
    CREATE TABLE IF NOT EXISTS session_exercises (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      exerciseId TEXT,
      position INTEGER NOT NULL,
      section TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      sets INTEGER,
      reps TEXT NOT NULL DEFAULT '',
      targetWeight REAL,
      weightNote TEXT NOT NULL DEFAULT ''
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_session_exercises_session ON session_exercises (sessionId)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_session_exercises_exercise ON session_exercises (exerciseId)`);
  // Added after launch: how each exercise is logged (kinds.ts) and its rest
  // between sets. Exercises that predate it get a kind from what they already
  // say - warm-ups are checked off, "45-60 s" is timed - once, here.
  const exerciseColumns = db.all('PRAGMA table_info(exercises)') as Array<{ name: string }>;
  if (!exerciseColumns.some((c) => c.name === 'kind')) {
    db.run(`ALTER TABLE exercises ADD COLUMN kind TEXT NOT NULL DEFAULT 'lift'`);
    db.run('ALTER TABLE exercises ADD COLUMN restSeconds INTEGER');
    const rows = db.all('SELECT id, section, reps FROM exercises') as Array<{ id: string; section: string; reps: string }>;
    for (const row of rows) db.run('UPDATE exercises SET kind = ? WHERE id = ?', [guessKind(row.section, row.reps), row.id]);
  }
  // Reminders: where to send them, what each person wants, and what was sent.
  db.run(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      profileId TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS reminder_prefs (
      profileId TEXT PRIMARY KEY,
      tone TEXT NOT NULL DEFAULT 'coach',
      dayTime TEXT NOT NULL DEFAULT '17:30',
      day INTEGER NOT NULL DEFAULT 1,
      friend INTEGER NOT NULL DEFAULT 1,
      week INTEGER NOT NULL DEFAULT 1,
      open INTEGER NOT NULL DEFAULT 1,
      rest INTEGER NOT NULL DEFAULT 0,
      mutedUntil TEXT,
      ignored INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      profileId TEXT NOT NULL,
      kind TEXT NOT NULL,
      key TEXT NOT NULL,
      lineId TEXT NOT NULL DEFAULT '',
      sentAt TEXT NOT NULL,
      openedAt TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_profile ON notifications (profileId, sentAt)`);
  // Mascots people drew and shared, for anyone to pick.
  db.run(`
    CREATE TABLE IF NOT EXISTS mascot_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      body TEXT NOT NULL,
      happy TEXT NOT NULL,
      coach TEXT NOT NULL,
      stern TEXT NOT NULL,
      cheer TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);
  // A profile's own mascot, drawn from a description; none means Spot.
  db.run(`
    CREATE TABLE IF NOT EXISTS mascots (
      profileId TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      body TEXT NOT NULL,
      happy TEXT NOT NULL,
      coach TEXT NOT NULL,
      stern TEXT NOT NULL,
      cheer TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);
  const entryColumns = db.all('PRAGMA table_info(session_exercises)') as Array<{ name: string }>;
  if (!entryColumns.some((c) => c.name === 'kind')) {
    db.run(`ALTER TABLE session_exercises ADD COLUMN kind TEXT NOT NULL DEFAULT 'lift'`);
    db.run('ALTER TABLE session_exercises ADD COLUMN restSeconds INTEGER');
    db.run(`UPDATE session_exercises SET kind = COALESCE((SELECT kind FROM exercises e WHERE e.id = session_exercises.exerciseId), 'lift')`);
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS set_logs (
      entryId TEXT NOT NULL,
      setNumber INTEGER NOT NULL,
      weight REAL,
      reps INTEGER,
      done INTEGER NOT NULL DEFAULT 0,
      loggedAt TEXT NOT NULL,
      PRIMARY KEY (entryId, setNumber)
    )
  `);
  return db;
}

const now = () => new Date().toISOString();

function transaction<T>(work: (database: Database) => T): T {
  const database = open();
  database.run('BEGIN');
  try {
    const result = work(database);
    database.run('COMMIT');
    return result;
  } catch (error) {
    database.run('ROLLBACK');
    throw error;
  }
}

// --- profiles ------------------------------------------------------------

export interface Profile {
  id: string;
  name: string;
}

export function listProfiles(): Profile[] {
  return open().all('SELECT id, name FROM profiles ORDER BY createdAt') as unknown as Profile[];
}

/** The profile id if it exists, else null - so a typo cannot create workouts nobody can see. */
export function knownProfile(id: string | null): string | null {
  if (!id) return null;
  const row = open().get('SELECT id FROM profiles WHERE id = ?', [id]) as { id: string } | null;
  return row?.id ?? null;
}

export function addProfile(id: string, name: string): Profile {
  open().run('INSERT INTO profiles (id, name, createdAt) VALUES (?, ?, ?)', [id, name, now()]);
  return { id, name };
}

/** "Kevin" becomes `kevin`, and a second "Kevin" `kevin-2` rather than joining the first one's workouts. */
export function createProfile(name: string): Profile {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lifter';
  let id = base;
  for (let n = 2; knownProfile(id); n++) id = `${base}-${n}`;
  return addProfile(id, name);
}

// --- workouts ------------------------------------------------------------

export interface WorkoutSummary {
  id: string;
  name: string;
  notes: string;
  position: number;
  place: Place;
  exerciseCount: number;
  /** How many of them are checked off rather than lifted - the warm-up, mostly. */
  checkCount: number;
  /** When this workout was last finished, if ever. */
  lastDone: string | null;
}

export interface Exercise {
  id: string;
  workoutId: string;
  position: number;
  section: string;
  name: string;
  notes: string;
  sets: number | null;
  reps: string;
  targetWeight: number | null;
  weightNote: string;
  kind: Kind;
  /** Seconds between sets; null for the default. */
  restSeconds: number | null;
  media: Media[];
}

export interface Workout extends WorkoutSummary {
  profileId: string;
  exercises: Exercise[];
}

export function listWorkouts(profileId: string): WorkoutSummary[] {
  return open().all(`
    SELECT w.id, w.name, w.notes, w.position, w.place,
           (SELECT COUNT(*) FROM exercises e WHERE e.workoutId = w.id) AS exerciseCount,
           (SELECT COUNT(*) FROM exercises e WHERE e.workoutId = w.id AND e.kind = 'check') AS checkCount,
           (SELECT MAX(s.finishedAt) FROM sessions s WHERE s.workoutId = w.id) AS lastDone
    FROM workouts w WHERE w.profileId = ?
    ORDER BY w.position, w.createdAt
  `, [profileId]) as unknown as WorkoutSummary[];
}

function mediaFor(exerciseIds: string[]): Map<string, Media[]> {
  const out = new Map<string, Media[]>();
  if (!exerciseIds.length) return out;
  const rows = open().all(
    `SELECT id, exerciseId, kind, url, file, mime FROM media WHERE exerciseId IN (${exerciseIds.map(() => '?').join(',')})
     ORDER BY position, createdAt`, exerciseIds,
  ) as unknown as Array<Media & { exerciseId: string }>;
  for (const { exerciseId, ...media } of rows) out.set(exerciseId, [...(out.get(exerciseId) ?? []), media]);
  return out;
}

/** A workout with its exercises and clips, only if it belongs to this profile. */
export function getWorkout(id: string, profileId: string): Workout | null {
  const summary = listWorkouts(profileId).find((w) => w.id === id);
  if (!summary) return null;
  const rows = open().all(
    `SELECT id, workoutId, position, section, name, notes, sets, reps, targetWeight, weightNote, kind, restSeconds
     FROM exercises WHERE workoutId = ? ORDER BY position, createdAt`, [id],
  ) as unknown as Array<Omit<Exercise, 'media'>>;
  const media = mediaFor(rows.map((r) => r.id));
  return { ...summary, profileId, exercises: rows.map((r) => ({ ...r, media: media.get(r.id) ?? [] })) };
}

export function createWorkout(profileId: string, name: string, notes = '', place: Place = 'gym'): string {
  const id = randomUUID();
  const { position } = open().get(
    'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM workouts WHERE profileId = ?', [profileId],
  ) as { position: number };
  open().run(
    'INSERT INTO workouts (id, profileId, name, notes, place, position, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, profileId, name, notes, place, position, now(), now()],
  );
  return id;
}

export function updateWorkout(id: string, change: { name?: string; notes?: string; place?: Place }): void {
  const database = open();
  if (change.place !== undefined) database.run('UPDATE workouts SET place = ?, updatedAt = ? WHERE id = ?', [change.place, now(), id]);
  if (change.name !== undefined) database.run('UPDATE workouts SET name = ?, updatedAt = ? WHERE id = ?', [change.name, now(), id]);
  if (change.notes !== undefined) database.run('UPDATE workouts SET notes = ?, updatedAt = ? WHERE id = ?', [change.notes, now(), id]);
}

/** Put this profile's workouts in this order; any not named keep their place after. */
export function reorderWorkouts(profileId: string, ids: string[]): void {
  const all = listWorkouts(profileId).map((w) => w.id);
  const order = [...ids.filter((id) => all.includes(id)), ...all.filter((id) => !ids.includes(id))];
  transaction((database) => order.forEach((id, i) => database.run('UPDATE workouts SET position = ? WHERE id = ?', [i, id])));
}

/**
 * Delete a workout and its exercises. Past sessions stay - they are a record
 * of what was done - and simply stop pointing at it. Returns the uploaded
 * files nothing uses any more, for the caller to remove from disk.
 */
export function deleteWorkout(id: string): string[] {
  return transaction((database) => {
    const exercises = (database.all('SELECT id FROM exercises WHERE workoutId = ?', [id]) as Array<{ id: string }>).map((e) => e.id);
    const files = exercises.flatMap((e) => removeExercise(database, e));
    database.run('UPDATE sessions SET workoutId = NULL WHERE workoutId = ?', [id]);
    database.run('DELETE FROM schedule WHERE workoutId = ?', [id]);
    database.run('DELETE FROM workouts WHERE id = ?', [id]);
    return orphans(database, files);
  });
}

/**
 * Copy a workout - from any profile - into this one: exercises, targets and
 * clips. Uploaded clips are shared rather than duplicated on disk; a file is
 * only removed when no clip anywhere uses it.
 */
export function copyWorkout(fromId: string, toProfile: string, place?: Place): string | null {
  const source = open().get('SELECT profileId FROM workouts WHERE id = ?', [fromId]) as { profileId: string } | null;
  const workout = source && getWorkout(fromId, source.profileId);
  if (!workout) return null;
  return transaction(() => copyInto(workout, toProfile, place ?? workout.place, true));
}

/** A workout's copy in another profile; the caller holds the transaction. */
function copyInto(workout: Workout, toProfile: string, place: Place, keepTargets: boolean): string {
  const id = createWorkout(toProfile, workout.name, workout.notes, place);
  for (const exercise of workout.exercises) {
    const copy = addExercise(id, keepTargets ? exercise : { ...exercise, targetWeight: null });
    for (const media of exercise.media) addMedia(copy, media);
  }
  return id;
}

export interface PlanSummary {
  id: string;
  name: string;
  workouts: number;
  /** The week, Sunday first: each day's workout name, "Rest", or "". */
  week: string[];
}

/** Every other profile with workouts to start from, for a new profile's first screen. */
export function plansToCopy(exceptProfile: string): PlanSummary[] {
  return listProfiles()
    .filter((p) => p.id !== exceptProfile)
    .map((p) => {
      const workouts = listWorkouts(p.id);
      const names = new Map(workouts.map((w) => [w.id, w.name]));
      const week = getSchedule(p.id).map((d) => (d === 'rest' ? 'Rest' : d ? names.get(d) ?? '' : ''));
      return { id: p.id, name: p.name, workouts: workouts.length, week };
    })
    .filter((p) => p.workouts > 0);
}

/**
 * Copy someone's whole plan into this profile: every workout in order, with
 * clips, and the week pointing at the copies. Target weights are left blank -
 * a friend lifts their own weights, and their first workout sets them.
 */
export function copyPlan(fromProfile: string, toProfile: string): number {
  const workouts = listWorkouts(fromProfile).map((w) => getWorkout(w.id, fromProfile)!);
  const week = getSchedule(fromProfile);
  return transaction((database) => {
    const ids = new Map(workouts.map((w) => [w.id, copyInto(w, toProfile, w.place, false)]));
    week.forEach((plan, weekday) => {
      if (plan === null) return;
      const mapped = plan === 'rest' ? null : ids.get(plan) ?? null;
      if (plan !== 'rest' && !mapped) return;
      database.run(
        `INSERT INTO schedule (profileId, weekday, workoutId) VALUES (?, ?, ?)
         ON CONFLICT (profileId, weekday) DO UPDATE SET workoutId = excluded.workoutId`,
        [toProfile, weekday, mapped],
      );
    });
    return ids.size;
  });
}

// --- the week ------------------------------------------------------------

/** This profile's week, Sunday first: each day's workout, 'rest', or null for nothing planned. */
export function getSchedule(profileId: string): DayPlan[] {
  const week: DayPlan[] = Array(7).fill(null);
  const rows = open().all('SELECT weekday, workoutId FROM schedule WHERE profileId = ?', [profileId]) as Array<{ weekday: number; workoutId: string | null }>;
  for (const row of rows) week[row.weekday] = row.workoutId ?? 'rest';
  return week;
}

/** Plan one day. A workout that is not this profile's is refused. */
export function setDay(profileId: string, weekday: number, plan: DayPlan): boolean {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return false;
  const database = open();
  if (plan === null) {
    database.run('DELETE FROM schedule WHERE profileId = ? AND weekday = ?', [profileId, weekday]);
    return true;
  }
  if (plan !== 'rest' && !database.get('SELECT 1 FROM workouts WHERE id = ? AND profileId = ?', [plan, profileId])) return false;
  database.run(
    `INSERT INTO schedule (profileId, weekday, workoutId) VALUES (?, ?, ?)
     ON CONFLICT (profileId, weekday) DO UPDATE SET workoutId = excluded.workoutId`,
    [profileId, weekday, plan === 'rest' ? null : plan],
  );
  return true;
}

// --- exercises -----------------------------------------------------------

export type ExerciseFields = Partial<Pick<Exercise, 'section' | 'name' | 'notes' | 'sets' | 'reps' | 'targetWeight' | 'weightNote' | 'kind' | 'restSeconds'>>;

export function addExercise(workoutId: string, fields: ExerciseFields): string {
  const id = randomUUID();
  const database = open();
  const { position } = database.get(
    'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM exercises WHERE workoutId = ?', [workoutId],
  ) as { position: number };
  database.run(
    `INSERT INTO exercises (id, workoutId, position, section, name, notes, sets, reps, targetWeight, weightNote, kind, restSeconds, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, workoutId, position, fields.section ?? '', fields.name || 'New exercise', fields.notes ?? '',
     fields.sets ?? null, fields.reps ?? '', fields.targetWeight ?? null, fields.weightNote ?? '',
     fields.kind ?? guessKind(fields.section ?? '', fields.reps ?? ''), fields.restSeconds ?? null, now()],
  );
  database.run('UPDATE workouts SET updatedAt = ? WHERE id = ?', [now(), workoutId]);
  return id;
}

const EXERCISE_FIELDS = ['section', 'name', 'notes', 'sets', 'reps', 'targetWeight', 'weightNote', 'kind', 'restSeconds'] as const;

export function updateExercise(id: string, change: ExerciseFields): void {
  const database = open();
  for (const field of EXERCISE_FIELDS) {
    if (change[field] !== undefined) database.run(`UPDATE exercises SET ${field} = ? WHERE id = ?`, [change[field] ?? null, id]);
  }
}

/** Which profile an exercise belongs to, through its workout - every exercise route checks this. */
export function exerciseOwner(id: string): { profileId: string; workoutId: string } | null {
  return open().get(
    'SELECT w.profileId, w.id AS workoutId FROM exercises e JOIN workouts w ON w.id = e.workoutId WHERE e.id = ?', [id],
  ) as { profileId: string; workoutId: string } | null;
}

export function reorderExercises(workoutId: string, ids: string[]): void {
  const all = (open().all('SELECT id FROM exercises WHERE workoutId = ? ORDER BY position, createdAt', [workoutId]) as Array<{ id: string }>).map((r) => r.id);
  const order = [...ids.filter((id) => all.includes(id)), ...all.filter((id) => !ids.includes(id))];
  transaction((database) => order.forEach((id, i) => database.run('UPDATE exercises SET position = ? WHERE id = ?', [i, id])));
}

function removeExercise(database: Database, id: string): string[] {
  const files = (database.all(`SELECT file FROM media WHERE exerciseId = ? AND kind = 'upload'`, [id]) as Array<{ file: string }>).map((m) => m.file);
  database.run('DELETE FROM media WHERE exerciseId = ?', [id]);
  database.run('DELETE FROM exercises WHERE id = ?', [id]);
  // Sessions keep their copy of it, as they do of a deleted workout.
  database.run('UPDATE session_exercises SET exerciseId = NULL WHERE exerciseId = ?', [id]);
  return files;
}

/** Delete an exercise; returns uploaded files nothing uses any more. */
export function deleteExercise(id: string): string[] {
  return transaction((database) => orphans(database, removeExercise(database, id)));
}

// --- media ---------------------------------------------------------------

export function addMedia(exerciseId: string, media: { kind: MediaKind; url?: string; file?: string; mime?: string }): Media {
  const database = open();
  const id = randomUUID();
  const { position } = database.get(
    'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM media WHERE exerciseId = ?', [exerciseId],
  ) as { position: number };
  const row: Media = { id, kind: media.kind, url: media.url ?? '', file: media.file ?? '', mime: media.mime ?? '' };
  database.run(
    'INSERT INTO media (id, exerciseId, position, kind, url, file, mime, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, exerciseId, position, row.kind, row.url, row.file, row.mime, now()],
  );
  return row;
}

/** Remove a clip from an exercise; returns its file if nothing else uses it. */
export function deleteMedia(exerciseId: string, mediaId: string): string[] {
  return transaction((database) => {
    const row = database.get('SELECT kind, file FROM media WHERE id = ? AND exerciseId = ?', [mediaId, exerciseId]) as { kind: string; file: string } | null;
    if (!row) return [];
    database.run('DELETE FROM media WHERE id = ?', [mediaId]);
    return row.kind === 'upload' ? orphans(database, [row.file]) : [];
  });
}

/** Of these files, the ones no clip refers to any more. */
function orphans(database: Database, files: string[]): string[] {
  return [...new Set(files)].filter((file) => !database.get('SELECT 1 FROM media WHERE file = ?', [file]));
}

// --- import --------------------------------------------------------------

/** Add the workouts read from a sheet to this profile, all or none. */
export function importWorkouts(profileId: string, workouts: SheetWorkout[], place: Place = 'gym'): string[] {
  return transaction(() => workouts.map((workout) => {
    const id = createWorkout(profileId, workout.name, '', place);
    for (const { urls, ...fields } of workout.exercises) {
      const exercise = addExercise(id, fields);
      for (const url of urls) addMedia(exercise, { kind: 'url', url });
    }
    return id;
  }));
}

// --- sessions ------------------------------------------------------------

export interface SessionEntry {
  id: string;
  exerciseId: string | null;
  position: number;
  section: string;
  name: string;
  notes: string;
  sets: number | null;
  reps: string;
  targetWeight: number | null;
  weightNote: string;
  kind: Kind;
  restSeconds: number | null;
  /** The exercise's clips as they are now; none if it has been deleted from the plan. */
  media: Media[];
  logged: LoggedSet[];
  /** The last finished session that did this exercise, for "last time". */
  last: { date: string; sets: LoggedSet[] } | null;
}

export interface Session {
  id: string;
  workoutId: string | null;
  workoutName: string;
  startedAt: string;
  finishedAt: string | null;
  entries: SessionEntry[];
}

export interface SessionSummary {
  id: string;
  workoutId: string | null;
  workoutName: string;
  startedAt: string;
  finishedAt: string | null;
  setsDone: number;
  exercisesDone: number;
}

/**
 * Start a workout: its exercises are copied into a new session. A session
 * already under way is returned instead - there is only ever one at a time,
 * so a second tap or a second phone cannot split one workout in two.
 */
export function startSession(profileId: string, workoutId: string): string | null {
  const active = activeSession(profileId);
  if (active) return active;
  const workout = getWorkout(workoutId, profileId);
  if (!workout) return null;
  return transaction((database) => {
    const id = randomUUID();
    database.run('INSERT INTO sessions (id, profileId, workoutId, workoutName, startedAt) VALUES (?, ?, ?, ?, ?)',
      [id, profileId, workoutId, workout.name, now()]);
    for (const e of workout.exercises) {
      database.run(
        `INSERT INTO session_exercises (id, sessionId, exerciseId, position, section, name, notes, sets, reps, targetWeight, weightNote, kind, restSeconds)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), id, e.id, e.position, e.section, e.name, e.notes, e.sets, e.reps, e.targetWeight, e.weightNote, e.kind, e.restSeconds],
      );
    }
    return id;
  });
}

export function activeSession(profileId: string): string | null {
  const row = open().get(
    'SELECT id FROM sessions WHERE profileId = ? AND finishedAt IS NULL ORDER BY startedAt DESC LIMIT 1', [profileId],
  ) as { id: string } | null;
  return row?.id ?? null;
}

type SetRow = { entryId: string; setNumber: number; weight: number | null; reps: number | null; done: number };
const toSet = (r: SetRow): LoggedSet => ({ setNumber: r.setNumber, weight: r.weight, reps: r.reps, done: r.done === 1 });

/**
 * For each exercise, the sets from the latest finished session before this
 * one started that did it - so an old workout in History compares with the
 * one before it, not with today.
 */
function lastTimes(profileId: string, exerciseIds: string[], exceptSession: string, before: string): Map<string, { date: string; sets: LoggedSet[] }> {
  const out = new Map<string, { date: string; sets: LoggedSet[] }>();
  if (!exerciseIds.length) return out;
  const database = open();
  const rows = database.all(`
    SELECT se.exerciseId, se.id AS entryId, s.finishedAt FROM session_exercises se
    JOIN sessions s ON s.id = se.sessionId
    WHERE s.profileId = ? AND s.finishedAt IS NOT NULL AND s.id != ? AND s.finishedAt <= ?
      AND se.exerciseId IN (${exerciseIds.map(() => '?').join(',')})
      AND EXISTS (SELECT 1 FROM set_logs l WHERE l.entryId = se.id AND l.done = 1)
    ORDER BY s.finishedAt DESC
  `, [profileId, exceptSession, before, ...exerciseIds]) as Array<{ exerciseId: string; entryId: string; finishedAt: string }>;
  for (const row of rows) {
    if (out.has(row.exerciseId)) continue;
    const sets = (database.all('SELECT * FROM set_logs WHERE entryId = ? AND done = 1 ORDER BY setNumber', [row.entryId]) as unknown as SetRow[]).map(toSet);
    out.set(row.exerciseId, { date: row.finishedAt, sets });
  }
  return out;
}

export function getSession(id: string, profileId: string): Session | null {
  const database = open();
  const session = database.get(
    'SELECT id, workoutId, workoutName, startedAt, finishedAt FROM sessions WHERE id = ? AND profileId = ?', [id, profileId],
  ) as Omit<Session, 'entries'> | null;
  if (!session) return null;
  const rows = database.all(
    `SELECT id, exerciseId, position, section, name, notes, sets, reps, targetWeight, weightNote, kind, restSeconds
     FROM session_exercises WHERE sessionId = ? ORDER BY position`, [id],
  ) as unknown as Array<Omit<SessionEntry, 'media' | 'logged' | 'last'>>;
  const logs = database.all(
    `SELECT l.* FROM set_logs l JOIN session_exercises se ON se.id = l.entryId WHERE se.sessionId = ? ORDER BY l.setNumber`, [id],
  ) as unknown as SetRow[];
  const ids = rows.map((r) => r.exerciseId).filter((x): x is string => !!x);
  const media = mediaFor(ids);
  const last = lastTimes(profileId, ids, id, session.startedAt);
  return {
    ...session,
    entries: rows.map((r) => ({
      ...r,
      media: (r.exerciseId && media.get(r.exerciseId)) || [],
      logged: logs.filter((l) => l.entryId === r.id).map(toSet),
      last: (r.exerciseId && last.get(r.exerciseId)) || null,
    })),
  };
}

/** Record one set as it stands - weight, reps, and whether it is done. */
export function logSet(sessionId: string, entryId: string, set: LoggedSet): boolean {
  const database = open();
  if (!database.get('SELECT 1 FROM session_exercises WHERE id = ? AND sessionId = ?', [entryId, sessionId])) return false;
  database.run(
    `INSERT INTO set_logs (entryId, setNumber, weight, reps, done, loggedAt) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(entryId, setNumber) DO UPDATE SET weight = excluded.weight, reps = excluded.reps, done = excluded.done, loggedAt = excluded.loggedAt`,
    [entryId, set.setNumber, set.weight, set.reps, set.done ? 1 : 0, now()],
  );
  return true;
}

/** Remove a set, and renumber the ones after it so there is never a gap. */
export function deleteSet(sessionId: string, entryId: string, setNumber: number): void {
  transaction((database) => {
    if (!database.get('SELECT 1 FROM session_exercises WHERE id = ? AND sessionId = ?', [entryId, sessionId])) return;
    database.run('DELETE FROM set_logs WHERE entryId = ? AND setNumber = ?', [entryId, setNumber]);
    const later = database.all('SELECT setNumber FROM set_logs WHERE entryId = ? AND setNumber > ? ORDER BY setNumber', [entryId, setNumber]) as Array<{ setNumber: number }>;
    for (const { setNumber: n } of later) database.run('UPDATE set_logs SET setNumber = ? WHERE entryId = ? AND setNumber = ?', [n - 1, entryId, n]);
  });
}

/**
 * Close this profile's workouts left open longer than `maxAgeMs`: one with
 * nothing done is thrown away, one with sets is finished as of its last set.
 * Returns how many were closed.
 */
export function closeStale(profileId: string, maxAgeMs: number): number {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const stale = open().all(
    'SELECT id, startedAt FROM sessions WHERE profileId = ? AND finishedAt IS NULL AND startedAt < ?', [profileId, cutoff],
  ) as Array<{ id: string; startedAt: string }>;
  for (const { id, startedAt } of stale) {
    const last = open().get(
      `SELECT MAX(l.loggedAt) AS at FROM set_logs l JOIN session_exercises se ON se.id = l.entryId WHERE se.sessionId = ? AND l.done = 1`, [id],
    ) as { at: string | null };
    if (last.at) open().run('UPDATE sessions SET finishedAt = ? WHERE id = ?', [last.at < startedAt ? startedAt : last.at, id]);
    else deleteSession(id);
  }
  return stale.length;
}

export function finishSession(id: string): void {
  open().run('UPDATE sessions SET finishedAt = COALESCE(finishedAt, ?) WHERE id = ?', [now(), id]);
}

export function deleteSession(id: string): void {
  transaction((database) => {
    database.run('DELETE FROM set_logs WHERE entryId IN (SELECT id FROM session_exercises WHERE sessionId = ?)', [id]);
    database.run('DELETE FROM session_exercises WHERE sessionId = ?', [id]);
    database.run('DELETE FROM sessions WHERE id = ?', [id]);
  });
}

export function listSessions(profileId: string, limit = 100): SessionSummary[] {
  return open().all(`
    SELECT s.id, s.workoutId, s.workoutName, s.startedAt, s.finishedAt,
           (SELECT COUNT(*) FROM set_logs l JOIN session_exercises se ON se.id = l.entryId WHERE se.sessionId = s.id AND l.done = 1) AS setsDone,
           (SELECT COUNT(DISTINCT se.id) FROM set_logs l JOIN session_exercises se ON se.id = l.entryId WHERE se.sessionId = s.id AND l.done = 1) AS exercisesDone
    FROM sessions s WHERE s.profileId = ? AND s.finishedAt IS NOT NULL
    ORDER BY s.startedAt DESC LIMIT ?
  `, [profileId, limit]) as unknown as SessionSummary[];
}

/**
 * Per exercise, the most ever done before `before`: heaviest weight for a
 * lift, longest hold in seconds for a timed exercise. For spotting new bests.
 */
export function bestsBefore(profileId: string, exercises: Array<{ id: string; kind: Kind }>, before: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const { id, kind } of exercises) {
    if (kind === 'check') continue;
    const row = open().get(
      `SELECT MAX(${kind === 'timed' ? 'l.reps' : 'l.weight'}) AS best FROM set_logs l
       JOIN session_exercises se ON se.id = l.entryId JOIN sessions s ON s.id = se.sessionId
       WHERE s.profileId = ? AND se.exerciseId = ? AND l.done = 1 AND s.finishedAt IS NOT NULL AND s.finishedAt <= ?`,
      [profileId, id, before],
    ) as { best: number | null };
    if (row.best !== null) out.set(id, row.best);
  }
  return out;
}

/** Current targets of these exercises; a deleted one is simply absent. */
export function currentTargets(exerciseIds: string[]): Map<string, number | null> {
  if (!exerciseIds.length) return new Map();
  const rows = open().all(
    `SELECT id, targetWeight FROM exercises WHERE id IN (${exerciseIds.map(() => '?').join(',')})`, exerciseIds,
  ) as Array<{ id: string; targetWeight: number | null }>;
  return new Map(rows.map((r) => [r.id, r.targetWeight]));
}

// --- reminders -------------------------------------------------------------

export interface ReminderPrefs {
  tone: Tone;
  /** "17:30": when a planned day that hasn't started gets its nudge. */
  dayTime: string;
  day: boolean;
  friend: boolean;
  week: boolean;
  open: boolean;
  rest: boolean;
  /** Spot is quiet until then. */
  mutedUntil: string | null;
  /** Nudges in a row that were never opened; at 3, nudges stop until the app is opened. */
  ignored: number;
}

const DEFAULT_PREFS: ReminderPrefs = { tone: 'coach', dayTime: '17:30', day: true, friend: true, week: true, open: true, rest: false, mutedUntil: null, ignored: 0 };
const FLAGS = ['day', 'friend', 'week', 'open', 'rest'] as const;

export function getPrefs(profileId: string): ReminderPrefs {
  const row = open().get('SELECT * FROM reminder_prefs WHERE profileId = ?', [profileId]) as Record<string, unknown> | null;
  if (!row) return { ...DEFAULT_PREFS };
  return {
    tone: row.tone as Tone,
    dayTime: row.dayTime as string,
    ...Object.fromEntries(FLAGS.map((f) => [f, row[f] === 1])) as Pick<ReminderPrefs, (typeof FLAGS)[number]>,
    mutedUntil: (row.mutedUntil as string | null) ?? null,
    ignored: row.ignored as number,
  };
}

export function setPrefs(profileId: string, change: Partial<ReminderPrefs>): ReminderPrefs {
  const next = { ...getPrefs(profileId), ...change };
  open().run(
    `INSERT INTO reminder_prefs (profileId, tone, dayTime, day, friend, week, open, rest, mutedUntil, ignored)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(profileId) DO UPDATE SET tone = excluded.tone, dayTime = excluded.dayTime, day = excluded.day,
       friend = excluded.friend, week = excluded.week, open = excluded.open, rest = excluded.rest,
       mutedUntil = excluded.mutedUntil, ignored = excluded.ignored`,
    [profileId, next.tone, next.dayTime, ...FLAGS.map((f) => (next[f] ? 1 : 0)), next.mutedUntil, next.ignored],
  );
  return next;
}

export interface PushSubscriptionRow { endpoint: string; p256dh: string; auth: string }

export function saveSubscription(profileId: string, sub: PushSubscriptionRow): void {
  open().run(
    `INSERT INTO push_subscriptions (endpoint, profileId, p256dh, auth, createdAt) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET profileId = excluded.profileId, p256dh = excluded.p256dh, auth = excluded.auth`,
    [sub.endpoint, profileId, sub.p256dh, sub.auth, now()],
  );
}

export function deleteSubscription(endpoint: string): void {
  open().run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
}

export function subscriptionsFor(profileId: string): PushSubscriptionRow[] {
  return open().all('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE profileId = ?', [profileId]) as unknown as PushSubscriptionRow[];
}

/** Profiles that have at least one phone to send to. */
export function profilesWithPush(): string[] {
  return (open().all('SELECT DISTINCT profileId FROM push_subscriptions') as Array<{ profileId: string }>).map((r) => r.profileId);
}

export function logNotification(profileId: string, kind: string, key: string, lineId: string, at: Date = new Date()): string {
  const id = randomUUID();
  open().run('INSERT INTO notifications (id, profileId, kind, key, lineId, sentAt) VALUES (?, ?, ?, ?, ?, ?)', [id, profileId, kind, key, lineId, at.toISOString()]);
  return id;
}

export function wasSent(profileId: string, kind: string, key: string): boolean {
  return !!open().get('SELECT 1 FROM notifications WHERE profileId = ? AND kind = ? AND key = ?', [profileId, kind, key]);
}

/** How many of these kinds were sent since a moment - for "one nudge a day". */
export function sentSince(profileId: string, kinds: string[], since: string): number {
  const row = open().get(
    `SELECT COUNT(*) AS n FROM notifications WHERE profileId = ? AND sentAt >= ? AND kind IN (${kinds.map(() => '?').join(',')})`,
    [profileId, since, ...kinds],
  ) as { n: number };
  return row.n;
}

/** The last nudge sent, to tell whether it was opened. */
export function lastNotification(profileId: string, kinds: string[]): { id: string; openedAt: string | null } | null {
  return open().get(
    `SELECT id, openedAt FROM notifications WHERE profileId = ? AND kind IN (${kinds.map(() => '?').join(',')}) ORDER BY sentAt DESC LIMIT 1`,
    [profileId, ...kinds],
  ) as { id: string; openedAt: string | null } | null;
}

export function recentLines(profileId: string, limit = 30): string[] {
  return (open().all('SELECT lineId FROM notifications WHERE profileId = ? ORDER BY sentAt DESC LIMIT ?', [profileId, limit]) as Array<{ lineId: string }>).map((r) => r.lineId);
}

/** A notification was tapped: it counts as heard, and Spot's patience resets. */
export function markOpened(id: string): void {
  const row = open().get('SELECT profileId FROM notifications WHERE id = ?', [id]) as { profileId: string } | null;
  if (!row) return;
  open().run('UPDATE notifications SET openedAt = COALESCE(openedAt, ?) WHERE id = ?', [now(), id]);
  open().run('UPDATE reminder_prefs SET ignored = 0 WHERE profileId = ?', [row.profileId]);
}

/** When this profile last started a workout, and when it last finished one with sets. */
export function trainingDates(profileId: string): { lastStarted: string | null; lastTrained: string | null } {
  const started = open().get('SELECT MAX(startedAt) AS at FROM sessions WHERE profileId = ?', [profileId]) as { at: string | null };
  const trained = open().get(
    `SELECT MAX(s.startedAt) AS at FROM sessions s WHERE s.profileId = ? AND s.finishedAt IS NOT NULL
       AND EXISTS (SELECT 1 FROM session_exercises se JOIN set_logs l ON l.entryId = se.id WHERE se.sessionId = s.id AND l.done = 1)`,
    [profileId],
  ) as { at: string | null };
  return { lastStarted: started.at, lastTrained: trained.at };
}

/** The workout in progress, and when anything last happened in it. */
export function openWorkout(profileId: string): { id: string; workoutName: string; lastActivity: string } | null {
  const row = open().get(
    `SELECT s.id, s.workoutName, COALESCE((SELECT MAX(l.loggedAt) FROM set_logs l JOIN session_exercises se ON se.id = l.entryId WHERE se.sessionId = s.id), s.startedAt) AS lastActivity
     FROM sessions s WHERE s.profileId = ? AND s.finishedAt IS NULL ORDER BY s.startedAt DESC LIMIT 1`,
    [profileId],
  ) as { id: string; workoutName: string; lastActivity: string } | null;
  return row ?? null;
}

export interface Friend { id: string; name: string; lastTrained: string | null; sentToday: boolean; mascotName: string }

/** Everyone else, with when they last trained and whether you already sent Spot today. */
export function friendsOf(profileId: string, since: string): Friend[] {
  return listProfiles().filter((p) => p.id !== profileId).map((p) => ({
    ...p,
    lastTrained: trainingDates(p.id).lastTrained,
    sentToday: wasSentSince(p.id, 'sent', profileId, since),
    mascotName: mascotName(p.id),
  }));
}

function wasSentSince(profileId: string, kind: string, key: string, since: string): boolean {
  return !!open().get('SELECT 1 FROM notifications WHERE profileId = ? AND kind = ? AND key = ? AND sentAt >= ?', [profileId, kind, key, since]);
}

// --- progress ----------------------------------------------------------------

export interface ProgressPoint { date: string; weight: number | null; reps: number | null }

export interface ProgressSeries {
  exerciseId: string;
  name: string;
  kind: Kind;
  workoutName: string;
  /** The best set of each finished workout that did it, oldest first. */
  points: ProgressPoint[];
}

/**
 * Every lift and timed exercise in this profile's plan with what was done in
 * each finished workout: the top set (heaviest, then most reps; longest for a
 * timed one). For the progress charts.
 */
export function progressSeries(profileId: string): ProgressSeries[] {
  const rows = open().all(`
    SELECT e.id AS exerciseId, e.name, e.kind, w.name AS workoutName, s.startedAt AS date, se.id AS entryId,
           l.weight, l.reps
    FROM exercises e
    JOIN workouts w ON w.id = e.workoutId
    JOIN session_exercises se ON se.exerciseId = e.id
    JOIN sessions s ON s.id = se.sessionId
    JOIN set_logs l ON l.entryId = se.id AND l.done = 1
    WHERE w.profileId = ? AND s.finishedAt IS NOT NULL AND e.kind != 'check'
    ORDER BY w.position, e.position, s.startedAt
  `, [profileId]) as Array<{ exerciseId: string; name: string; kind: Kind; workoutName: string; date: string; entryId: string; weight: number | null; reps: number | null }>;
  const series = new Map<string, ProgressSeries & { byEntry: Map<string, ProgressPoint> }>();
  for (const r of rows) {
    const s = series.get(r.exerciseId) ?? { exerciseId: r.exerciseId, name: r.name, kind: r.kind, workoutName: r.workoutName, points: [], byEntry: new Map() };
    series.set(r.exerciseId, s);
    const best = s.byEntry.get(r.entryId);
    const better = !best || (r.kind === 'timed'
      ? (r.reps ?? 0) > (best.reps ?? 0)
      : (r.weight ?? 0) > (best.weight ?? 0) || ((r.weight ?? 0) === (best.weight ?? 0) && (r.reps ?? 0) > (best.reps ?? 0)));
    if (better) s.byEntry.set(r.entryId, { date: r.date, weight: r.kind === 'timed' ? null : r.weight, reps: r.reps });
  }
  // Two workouts of it on one day are one point: that day's best.
  const better = (kind: Kind, a: ProgressPoint, b: ProgressPoint) => (kind === 'timed'
    ? (a.reps ?? 0) > (b.reps ?? 0)
    : (a.weight ?? 0) > (b.weight ?? 0) || ((a.weight ?? 0) === (b.weight ?? 0) && (a.reps ?? 0) > (b.reps ?? 0)));
  return [...series.values()].map(({ byEntry, ...s }) => {
    const byDay = new Map<string, ProgressPoint>();
    for (const p of byEntry.values()) {
      const day = p.date.slice(0, 10);
      const held = byDay.get(day);
      if (!held || better(s.kind, p, held)) byDay.set(day, p);
    }
    return { ...s, points: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)) };
  });
}

// --- mascots -----------------------------------------------------------------

export type Mascot = Drawing & { description: string };

/** This profile's own mascot, or null for Spot. */
export function getMascot(profileId: string): Mascot | null {
  const row = open().get('SELECT * FROM mascots WHERE profileId = ?', [profileId]) as Record<string, string> | null;
  if (!row) return null;
  return { name: row.name, description: row.description, body: row.body, faces: { happy: row.happy, coach: row.coach, stern: row.stern, cheer: row.cheer } };
}

/** Save a drawing that has already been cleaned. */
export function setMascot(profileId: string, mascot: Mascot): void {
  open().run(
    `INSERT INTO mascots (profileId, name, description, body, happy, coach, stern, cheer, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(profileId) DO UPDATE SET name = excluded.name, description = excluded.description, body = excluded.body,
       happy = excluded.happy, coach = excluded.coach, stern = excluded.stern, cheer = excluded.cheer, createdAt = excluded.createdAt`,
    [profileId, mascot.name, mascot.description, mascot.body, mascot.faces.happy, mascot.faces.coach, mascot.faces.stern, mascot.faces.cheer, now()],
  );
}

export function clearMascot(profileId: string): void {
  open().run('DELETE FROM mascots WHERE profileId = ?', [profileId]);
}

/** What this profile's mascot is called: its own, or Spot. */
export const mascotName = (profileId: string) => getMascot(profileId)?.name ?? 'Spot';

export interface SharedMascot extends Mascot { id: string; createdBy: string; createdByName: string }

/** Mascots people drew and shared, newest first. */
export function sharedMascots(): SharedMascot[] {
  const names = new Map(listProfiles().map((p) => [p.id, p.name]));
  return (open().all('SELECT * FROM mascot_presets ORDER BY createdAt DESC') as Array<Record<string, string>>).map((r) => ({
    id: r.id, name: r.name, description: r.description, body: r.body,
    faces: { happy: r.happy, coach: r.coach, stern: r.stern, cheer: r.cheer },
    createdBy: r.createdBy, createdByName: names.get(r.createdBy) ?? 'someone',
  }));
}

export function shareMascot(profileId: string, mascot: Mascot): string {
  const id = randomUUID();
  open().run(
    'INSERT INTO mascot_presets (id, name, description, body, happy, coach, stern, cheer, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, mascot.name, mascot.description, mascot.body, mascot.faces.happy, mascot.faces.coach, mascot.faces.stern, mascot.faces.cheer, profileId, now()],
  );
  return id;
}

/** Take a shared mascot out of the gallery - only its creator can. People already using it keep their copy. */
export function unshareMascot(profileId: string, id: string): boolean {
  const row = open().get('SELECT createdBy FROM mascot_presets WHERE id = ?', [id]) as { createdBy: string } | null;
  if (row?.createdBy !== profileId) return false;
  open().run('DELETE FROM mascot_presets WHERE id = ?', [id]);
  return true;
}
