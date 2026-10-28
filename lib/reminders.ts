/**
 * When Spot taps you on the shoulder. Checked every minute on the Pi, in the
 * Pi's time zone (the friends are all in it).
 *
 *   open    a workout left open 2 hours after its last set   once per workout
 *   week    Monday from 7:30: last week's tally, what's first  once a week
 *   day     a planned day not started by your reminder time    once a day
 *
 * Those three are nudges: at most one a day, nothing while muted, and after
 * three in a row go unopened Spot goes quiet until the app is next opened.
 * "Friend finished", "sent Spot" and "rest's up" are sent as they happen and
 * don't count against the nudge.
 */

import {
  activeSession, friendsOf, mascotName, getPrefs, getSchedule, getSession, lastNotification, listProfiles, listSessions, listWorkouts,
  openWorkout, profilesWithPush, recentLines, sentSince, setPrefs, subscriptionsFor, trainingDates, wasSent,
} from './db';
import { pushTo, type Message } from './push';
import { pickLine, type Moment } from './spot';
import { WEEK_ORDER } from './week';

type Send = Parameters<typeof pushTo>[5];

const NUDGES = ['open', 'week', 'day'];
const OPEN_AFTER_MS = 2 * 60 * 60 * 1000;
const COMEBACK_DAYS = 3;
const GIVE_UP_AFTER = 3;

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mondayOf = (d: Date) => { const m = startOfDay(d); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };

/** Workouts finished with sets between two moments, counted by day. */
function daysTrained(profileId: string, from: Date, to: Date): number {
  const days = new Set(listSessions(profileId, 500)
    .filter((s) => s.setsDone > 0 && new Date(s.startedAt) >= from && new Date(s.startedAt) < to)
    .map((s) => dateKey(new Date(s.startedAt))));
  return days.size;
}

function plannedToday(profileId: string, now: Date): string | null {
  const plan = getSchedule(profileId)[now.getDay()];
  if (!plan || plan === 'rest') return null;
  return listWorkouts(profileId).find((w) => w.id === plan)?.name ?? null;
}

/** Check one profile and send whichever nudge is due, if any. */
export async function remind(profileId: string, now: Date, send?: Send): Promise<string | null> {
  const prefs = getPrefs(profileId);
  if (prefs.mutedUntil && prefs.mutedUntil > now.toISOString()) return null;
  const today = startOfDay(now);
  if (sentSince(profileId, NUDGES, today.toISOString()) > 0) return null;

  const due = ((): { kind: string; key: string; moment: Moment; vars: Record<string, string | number>; title: string } | null => {
    const open = openWorkout(profileId);
    if (prefs.open && open && now.getTime() - Date.parse(open.lastActivity) > OPEN_AFTER_MS && !wasSent(profileId, 'open', open.id)) {
      return { kind: 'open', key: open.id, moment: 'open', vars: { workout: open.workoutName }, title: `Still at ${open.workoutName}?` };
    }
    if (prefs.week && now.getDay() === 1 && hhmm(now) >= '07:30' && !wasSent(profileId, 'week', dateKey(now))) {
      const schedule = getSchedule(profileId);
      const names = new Map(listWorkouts(profileId).map((w) => [w.id, w.name]));
      const planned = schedule.filter((d) => d && d !== 'rest' && names.has(d)).length;
      if (planned) {
        const firstDay = WEEK_ORDER.find((d) => schedule[d] && schedule[d] !== 'rest' && names.has(schedule[d]!));
        const lastWeek = mondayOf(now);
        lastWeek.setDate(lastWeek.getDate() - 7);
        return {
          kind: 'week', key: dateKey(now), moment: 'monday', title: 'New week',
          vars: { done: daysTrained(profileId, lastWeek, mondayOf(now)), planned, first: names.get(schedule[firstDay!]!) ?? 'your first workout' },
        };
      }
    }
    const workout = plannedToday(profileId, now);
    const { lastStarted, lastTrained } = trainingDates(profileId);
    if (prefs.day && workout && hhmm(now) >= prefs.dayTime && !wasSent(profileId, 'day', dateKey(now))
      && !(lastStarted && new Date(lastStarted) >= today) && !activeSession(profileId)) {
      const days = lastTrained ? Math.floor((today.getTime() - startOfDay(new Date(lastTrained)).getTime()) / 86_400_000) : 0;
      const comeback = days >= COMEBACK_DAYS;
      return { kind: 'day', key: dateKey(now), moment: comeback ? 'comeback' : 'day', vars: { workout, days }, title: `${workout} day` };
    }
    return null;
  })();
  if (!due) return null;

  // The last nudge was never opened: one more ignored. Three in a row and Spot stops asking.
  const last = lastNotification(profileId, NUDGES);
  const ignored = last && !last.openedAt ? prefs.ignored + 1 : prefs.ignored;
  if (ignored !== prefs.ignored) setPrefs(profileId, { ignored });
  if (ignored >= GIVE_UP_AFTER) return null;

  const line = pickLine(due.moment, prefs.tone, due.vars, recentLines(profileId), now.getDate());
  await pushTo(profileId, { title: due.title, body: line.text, tag: due.kind }, due.kind, due.key, line.id, send, now);
  return due.kind;
}

export async function runReminders(now = new Date(), send?: Send): Promise<void> {
  for (const profileId of profilesWithPush()) {
    try {
      await remind(profileId, now, send);
    } catch (error) {
      console.error('[reminders] failed for', profileId, error);
    }
  }
}

/** Someone just finished a workout: tell the friends who want to know, once a day each. */
export async function friendFinished(profileId: string, sessionId: string, now = new Date(), send?: Send): Promise<number> {
  const session = getSession(sessionId, profileId);
  if (!session?.entries.some((e) => e.logged.some((s) => s.done))) return 0;
  const name = listProfiles().find((p) => p.id === profileId)?.name ?? 'A friend';
  let told = 0;
  for (const friend of listProfiles()) {
    if (friend.id === profileId || !subscriptionsFor(friend.id).length) continue;
    const prefs = getPrefs(friend.id);
    if (!prefs.friend || (prefs.mutedUntil && prefs.mutedUntil > now.toISOString())) continue;
    const key = `${profileId}:${dateKey(now)}`;
    if (wasSent(friend.id, 'friend', key)) continue;
    const line = pickLine('friend', prefs.tone, { friend: name, workout: session.workoutName }, recentLines(friend.id), now.getDate());
    told += await pushTo(friend.id, { title: `${name} finished ${session.workoutName}`, body: line.text, tag: 'friend' }, 'friend', key, line.id, send, now);
  }
  return told;
}

export type SendSpotResult = 'sent' | 'already' | 'muted' | 'no-phone';

/** "Send Spot": one push from one friend to another, once a day per pair. */
export async function sendSpot(from: string, to: string, now = new Date(), send?: Send): Promise<SendSpotResult> {
  const today = startOfDay(now).toISOString();
  if (friendsOf(from, today).find((f) => f.id === to)?.sentToday) return 'already';
  const prefs = getPrefs(to);
  if (prefs.mutedUntil && prefs.mutedUntil > now.toISOString()) return 'muted';
  if (!subscriptionsFor(to).length) return 'no-phone';
  const sender = listProfiles().find((p) => p.id === from)?.name ?? 'A friend';
  const workout = plannedToday(to, now) ?? 'a workout';
  const mascot = mascotName(to);
  const line = pickLine('sent', prefs.tone, { sender, workout, mascot }, recentLines(to), now.getDate());
  const message: Message = { title: `${sender} sent ${mascot}`, body: line.text, tag: 'sent' };
  return (await pushTo(to, message, 'sent', from, line.id, send, now)) ? 'sent' : 'no-phone';
}

// --- rest's up, for a locked phone ----------------------------------------------

const restTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Push "rest's up" at `at`, replacing any earlier one for this profile. */
export function scheduleRest(profileId: string, at: number, next: string, send?: Send): boolean {
  cancelRest(profileId);
  const prefs = getPrefs(profileId);
  const wait = at - Date.now();
  if (!prefs.rest || wait <= 0 || wait > 15 * 60 * 1000) return false;
  restTimers.set(profileId, setTimeout(() => {
    restTimers.delete(profileId);
    const line = pickLine('restUp', prefs.tone, { next }, [], Date.now());
    void pushTo(profileId, { title: "Rest's up", body: line.text, tag: 'rest' }, 'rest', String(at), line.id, send);
  }, wait));
  return true;
}

export function cancelRest(profileId: string): void {
  clearTimeout(restTimers.get(profileId));
  restTimers.delete(profileId);
}

let started = false;

/** Start the once-a-minute check. Called once when the server starts. */
export function startReminders(): void {
  if (started) return;
  started = true;
  setInterval(() => { void runReminders(); }, 60_000);
}
