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

import type { Media, MediaKind } from './media';
import type { SheetWorkout } from './sheet';
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

/** Where a workout is done: Today and Plan show one at a time, as tabs. */
export const PLACES = ['gym', 'home'] as const;
export type Place = (typeof PLACES)[number];
export const isPlace = (x: unknown): x is Place => PLACES.includes(x as Place);

export interface WorkoutSummary {
  id: string;
  name: string;
  notes: string;
  position: number;
  place: Place;
  exerciseCount: number;
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
    `SELECT id, workoutId, position, section, name, notes, sets, reps, targetWeight, weightNote
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
  return transaction(() => {
    const id = createWorkout(toProfile, workout.name, workout.notes, place ?? workout.place);
    for (const exercise of workout.exercises) {
      const copy = addExercise(id, exercise);
      for (const media of exercise.media) addMedia(copy, media);
    }
    return id;
  });
}

// --- exercises -----------------------------------------------------------

export type ExerciseFields = Partial<Pick<Exercise, 'section' | 'name' | 'notes' | 'sets' | 'reps' | 'targetWeight' | 'weightNote'>>;

export function addExercise(workoutId: string, fields: ExerciseFields): string {
  const id = randomUUID();
  const database = open();
  const { position } = database.get(
    'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM exercises WHERE workoutId = ?', [workoutId],
  ) as { position: number };
  database.run(
    `INSERT INTO exercises (id, workoutId, position, section, name, notes, sets, reps, targetWeight, weightNote, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, workoutId, position, fields.section ?? '', fields.name || 'New exercise', fields.notes ?? '',
     fields.sets ?? null, fields.reps ?? '', fields.targetWeight ?? null, fields.weightNote ?? '', now()],
  );
  database.run('UPDATE workouts SET updatedAt = ? WHERE id = ?', [now(), workoutId]);
  return id;
}

const EXERCISE_FIELDS = ['section', 'name', 'notes', 'sets', 'reps', 'targetWeight', 'weightNote'] as const;

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
        `INSERT INTO session_exercises (id, sessionId, exerciseId, position, section, name, notes, sets, reps, targetWeight, weightNote)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), id, e.id, e.position, e.section, e.name, e.notes, e.sets, e.reps, e.targetWeight, e.weightNote],
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

/** For each exercise, the sets from the latest finished session (other than this one) that did it. */
function lastTimes(profileId: string, exerciseIds: string[], exceptSession: string): Map<string, { date: string; sets: LoggedSet[] }> {
  const out = new Map<string, { date: string; sets: LoggedSet[] }>();
  if (!exerciseIds.length) return out;
  const database = open();
  const rows = database.all(`
    SELECT se.exerciseId, se.id AS entryId, s.finishedAt FROM session_exercises se
    JOIN sessions s ON s.id = se.sessionId
    WHERE s.profileId = ? AND s.finishedAt IS NOT NULL AND s.id != ?
      AND se.exerciseId IN (${exerciseIds.map(() => '?').join(',')})
      AND EXISTS (SELECT 1 FROM set_logs l WHERE l.entryId = se.id AND l.done = 1)
    ORDER BY s.finishedAt DESC
  `, [profileId, exceptSession, ...exerciseIds]) as Array<{ exerciseId: string; entryId: string; finishedAt: string }>;
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
    `SELECT id, exerciseId, position, section, name, notes, sets, reps, targetWeight, weightNote
     FROM session_exercises WHERE sessionId = ? ORDER BY position`, [id],
  ) as unknown as Array<Omit<SessionEntry, 'media' | 'logged' | 'last'>>;
  const logs = database.all(
    `SELECT l.* FROM set_logs l JOIN session_exercises se ON se.id = l.entryId WHERE se.sessionId = ? ORDER BY l.setNumber`, [id],
  ) as unknown as SetRow[];
  const ids = rows.map((r) => r.exerciseId).filter((x): x is string => !!x);
  const media = mediaFor(ids);
  const last = lastTimes(profileId, ids, id);
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

/** Current targets of these exercises; a deleted one is simply absent. */
export function currentTargets(exerciseIds: string[]): Map<string, number | null> {
  if (!exerciseIds.length) return new Map();
  const rows = open().all(
    `SELECT id, targetWeight FROM exercises WHERE id IN (${exerciseIds.map(() => '?').join(',')})`, exerciseIds,
  ) as Array<{ id: string; targetWeight: number | null }>;
  return new Map(rows.map((r) => [r.id, r.targetWeight]));
}
