/**
 * Client-side calls into our own API, with errors that say something.
 * Every call says which profile it is for; data routes refuse one that does not.
 */

import type { Exercise, ExerciseFields, Friend, Mascot, Place, PlanSummary, SharedMascot, Profile, ProgressSeries, ReminderPrefs, Session, SessionSummary, Workout, WorkoutSummary } from './db';
import { outbox } from './outbox';
import { getProfile } from './profile';
import type { Progress } from './progress';
import type { Drawing } from './mascot';
import type { ParsedSheet } from './sheet';
import type { LoggedSet, Suggestion } from './suggest';
import type { DayPlan } from './week';

const url = (path: string) => {
  const profile = getProfile();
  if (!profile) return `/api/${path}`;
  return `/api/${path}${path.includes('?') ? '&' : '?'}profile=${encodeURIComponent(profile)}`;
};

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { error?: string }).error || `Request failed (${response.status})`);
  }
  return body as T;
}

const send = <T>(path: string, method: string, body?: object) =>
  fetch(url(path), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then(json<T>);

// --- profiles --------------------------------------------------------------

export const fetchProfiles = () =>
  fetch(url('profiles')).then(json<{ profiles: Profile[] }>).then((b) => b.profiles);

export const createProfile = (name: string) =>
  send<{ profile: Profile }>('profiles', 'POST', { name }).then((b) => b.profile);

// --- workouts --------------------------------------------------------------

/** This profile's workouts, or another profile's to copy from. */
export const fetchWorkouts = (of?: string) =>
  fetch(url(of ? `workouts?of=${encodeURIComponent(of)}` : 'workouts')).then(json<{ workouts: WorkoutSummary[] }>).then((b) => b.workouts);

export const createWorkout = (name: string, place: Place) => send<{ id: string }>('workouts', 'POST', { name, place }).then((b) => b.id);

export const copyWorkout = (copyFrom: string, place: Place) => send<{ id: string }>('workouts', 'POST', { copyFrom, place }).then((b) => b.id);

export const reorderWorkouts = (order: string[]) =>
  send<{ workouts: WorkoutSummary[] }>('workouts', 'PATCH', { order }).then((b) => b.workouts);

type WithWorkout = { workout: Workout };

export const fetchWorkout = (id: string) => fetch(url(`workouts/${id}`)).then(json<WithWorkout>).then((b) => b.workout);

export const updateWorkout = (id: string, change: { name?: string; notes?: string; place?: Place }) =>
  send<WithWorkout>(`workouts/${id}`, 'PATCH', change).then((b) => b.workout);

export const deleteWorkout = (id: string) => send<{ ok: true }>(`workouts/${id}`, 'DELETE');

export const addExercise = (workoutId: string, fields: ExerciseFields) =>
  send<WithWorkout & { id: string }>(`workouts/${workoutId}/exercises`, 'POST', fields);

export const reorderExercises = (workoutId: string, order: string[]) =>
  send<WithWorkout>(`workouts/${workoutId}/exercises`, 'PATCH', { order }).then((b) => b.workout);

/** Numbers may be sent as typed; an empty one clears the field. */
export type ExerciseChange = Omit<ExerciseFields, 'sets' | 'targetWeight'> & { sets?: number | string | null; targetWeight?: number | string | null };

export const updateExercise = (id: Exercise['id'], change: ExerciseChange) =>
  send<WithWorkout>(`exercises/${id}`, 'PATCH', change).then((b) => b.workout);

export const deleteExercise = (id: string) => send<WithWorkout>(`exercises/${id}`, 'DELETE').then((b) => b.workout);

export const addMediaUrl = (exerciseId: string, link: string) =>
  send<WithWorkout>(`exercises/${exerciseId}/media`, 'POST', { url: link }).then((b) => b.workout);

export async function uploadMedia(exerciseId: string, file: File): Promise<Workout> {
  const form = new FormData();
  form.append('file', file);
  return fetch(url(`exercises/${exerciseId}/media`), { method: 'POST', body: form }).then(json<WithWorkout>).then((b) => b.workout);
}

export const deleteMedia = (exerciseId: string, mediaId: string) =>
  send<WithWorkout>(`exercises/${exerciseId}/media?mediaId=${encodeURIComponent(mediaId)}`, 'DELETE').then((b) => b.workout);

export const importSheet = (csv: string, preview: boolean, place: Place = 'gym') =>
  fetch(url(preview ? 'import?preview=1' : `import?place=${place}`), { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv })
    .then(json<ParsedSheet & { ids?: string[] }>);

// --- whole plans ------------------------------------------------------------

export const fetchPlans = () => fetch(url('plans')).then(json<{ plans: PlanSummary[] }>).then((b) => b.plans);

export const copyPlan = (from: string) => send<{ copied: number }>('plans', 'POST', { from }).then((b) => b.copied);

// --- the week --------------------------------------------------------------

export const fetchSchedule = () => fetch(url('schedule')).then(json<{ schedule: DayPlan[] }>).then((b) => b.schedule);

export const setDay = (weekday: number, plan: DayPlan) =>
  send<{ schedule: DayPlan[] }>('schedule', 'PUT', { weekday, plan }).then((b) => b.schedule);

// --- sessions --------------------------------------------------------------

export type SessionResult = { session: Session; suggestions: Suggestion[]; progress: Progress[] };

export const fetchSessions = () =>
  fetch(url('sessions')).then(json<{ active: Session | null; history: SessionSummary[] }>);

export const startSession = (workoutId: string) =>
  send<{ session: Session }>('sessions', 'POST', { workoutId }).then((b) => b.session);

export const fetchSession = (id: string) => fetch(url(`sessions/${id}`)).then(json<SessionResult>);

export const finishSession = (id: string) => send<SessionResult>(`sessions/${id}`, 'PATCH', { finish: true });

export const deleteSession = (id: string) => send<{ ok: true }>(`sessions/${id}`, 'DELETE');

export const logSet = (sessionId: string, entryId: string, set: LoggedSet) =>
  send<{ ok: true }>(`sessions/${sessionId}/sets`, 'PUT', { entryId, ...set });

/** Sets go through the outbox, so a dropped connection mid-workout loses nothing. */
export const setOutbox = () => outbox((p) => logSet(p.sessionId, p.entryId, p.set));

export const deleteSet = (sessionId: string, entryId: string, setNumber: number) =>
  send<{ ok: true }>(`sessions/${sessionId}/sets?entryId=${encodeURIComponent(entryId)}&setNumber=${setNumber}`, 'DELETE');

// --- Spot and reminders ------------------------------------------------------

export interface Reminders { prefs: ReminderPrefs; muted: boolean; canPush: boolean; publicKey: string; phones: number }

export const fetchReminders = () => fetch(url('reminders')).then(json<Reminders>);

export const updateReminders = (change: Partial<Omit<ReminderPrefs, 'mutedUntil' | 'ignored'>> & { mute?: 'today' | null }) =>
  send<Reminders>('reminders', 'PATCH', change);

export const subscribePush = (subscription: PushSubscriptionJSON) => send<{ ok: true }>('push/subscribe', 'POST', subscription);

export const testPush = () => send<{ sent: number }>('push/test', 'POST');

/** Ask the Pi to push "rest's up" at `at` (it only does if rest alerts are on). Fire and forget. */
export const restPush = (at: number, next: string) => { void send('push/rest', 'POST', { at, next }).catch(() => {}); };
export const cancelRestPush = () => { void send('push/rest', 'DELETE').catch(() => {}); };

export const fetchFriends = () => fetch(url('friends')).then(json<{ friends: Friend[] }>).then((b) => b.friends);

export const sendSpot = (to: string) =>
  fetch(url('spot/send'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }) })
    .then(async (r) => (await r.json()) as { result: string; message: string });

export const fetchProgress = () => fetch(url('progress')).then(json<{ series: ProgressSeries[] }>).then((b) => b.series);

// --- your mascot ---------------------------------------------------------------

export const fetchMascot = () => fetch(url('mascot')).then(json<{ mascot: Mascot | null; canDraw: boolean }>);

export const drawMascot = (description: string) => send<{ drawing: Drawing; left: number }>('mascot/draw', 'POST', { description });

export const saveMascot = (drawing: Drawing, description: string) =>
  send<{ mascot: Mascot }>('mascot', 'PUT', { ...drawing, description }).then((b) => b.mascot);

export const resetMascot = () => send<{ mascot: null }>('mascot', 'DELETE');

export interface Preset { id: string; name: string; description: string; body: string; faces: Drawing['faces'] }

export const fetchPresets = () => fetch(url('mascot/presets')).then(json<{ builtIn: Preset[]; shared: SharedMascot[] }>);

export const sharePreset = (drawing: Drawing, description: string) => send<{ id: string }>('mascot/presets', 'POST', { ...drawing, description });

export const unsharePreset = (id: string) => send<{ ok: true }>(`mascot/presets?id=${encodeURIComponent(id)}`, 'DELETE');
