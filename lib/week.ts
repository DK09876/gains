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
