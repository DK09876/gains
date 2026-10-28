/**
 * The week: which workout each day is for, or a rest day. Client-safe, so
 * Today and Plan can use it; the stored schedule is in db.ts.
 *
 * Days are numbered as Date#getDay does - 0 is Sunday - and the day is the
 * browser's, so "today" is wherever the phone is, not wherever the Pi is.
 */

/** A workout's id, a rest day, or nothing planned. */
export type DayPlan = string | 'rest' | null;

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Monday first, as the week is usually written. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const today = () => new Date().getDay();

// --- this week, as a strip ------------------------------------------------

export type DayState = 'done' | 'missed' | 'today' | 'upcoming' | 'rest' | 'free';

export interface StripDay {
  weekday: number;
  /** "M", "T", ... */
  letter: string;
  /** The planned workout's name, "Rest", or "" for nothing planned. */
  label: string;
  workoutId: string | null;
  state: DayState;
  isToday: boolean;
}

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Monday of the week containing `now`, at midnight local time. */
export function weekStart(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

/**
 * This week, Monday first: each day's plan and whether it happened. A day
 * counts as done if any workout was finished on it, whatever was planned -
 * doing Push on a Legs day still counts as training. Nothing is "missed"
 * before your first finished workout: a friend who joins on Wednesday has not
 * missed Monday.
 */
export function weekStrip(
  schedule: DayPlan[],
  workouts: Array<{ id: string; name: string }>,
  finished: Array<{ startedAt: string; setsDone: number }>,
  now: Date,
): { days: StripDay[]; done: number; planned: number } {
  const start = weekStart(now);
  const trained = new Set(
    finished.filter((s) => s.setsDone > 0).map((s) => new Date(s.startedAt)).filter((d) => d >= start)
      .map((d) => (d.getDay() + 6) % 7),
  );
  const todayIndex = (now.getDay() + 6) % 7;
  const first = finished.filter((s) => s.setsDone > 0).map((s) => new Date(s.startedAt)).sort((a, b) => +a - +b)[0];
  const firstDay = first ? new Date(first.getFullYear(), first.getMonth(), first.getDate()) : null;
  const counts = (i: number) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return !!firstDay && day >= firstDay;
  };
  const days = WEEK_ORDER.map((weekday, i): StripDay => {
    const plan = schedule[weekday] ?? null;
    const workout = plan && plan !== 'rest' ? workouts.find((w) => w.id === plan) : undefined;
    const label = plan === 'rest' ? 'Rest' : workout?.name ?? '';
    const isToday = i === todayIndex;
    const state: DayState = trained.has(i) ? 'done'
      : isToday ? 'today'
      : plan === 'rest' ? 'rest'
      : !workout ? 'free'
      : i < todayIndex ? (counts(i) ? 'missed' : 'free') : 'upcoming';
    return { weekday, letter: LETTERS[weekday], label, workoutId: workout?.id ?? null, state, isToday };
  });
  return {
    days,
    done: days.filter((d) => d.state === 'done').length,
    planned: days.filter((d) => d.workoutId).length,
  };
}

/** How a workout stands this week, for the list under today's: "done Monday", "missed yesterday", "Saturday". */
export function workoutWeekNote(workoutId: string, days: StripDay[]): string {
  const mine = days.filter((d) => d.workoutId === workoutId);
  const name = (d: StripDay) => {
    const todayAt = days.findIndex((x) => x.isToday);
    const at = days.indexOf(d);
    return at === todayAt - 1 ? 'yesterday' : DAY_NAMES[d.weekday];
  };
  const done = mine.find((d) => d.state === 'done');
  if (done) return `done ${name(done)}`;
  const missed = mine.filter((d) => d.state === 'missed').at(-1);
  if (missed) return `missed ${name(missed)}`;
  const next = mine.find((d) => d.state === 'upcoming');
  if (next) return DAY_NAMES[next.weekday];
  if (mine.length) return DAY_NAMES[mine[0].weekday];
  return 'not planned this week';
}
