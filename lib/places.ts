/**
 * Where a workout is done: Today and Plan show one at a time, as tabs. Kept
 * out of db.ts so pages can use it without pulling the database into the
 * browser bundle.
 */

export const PLACES = ['gym', 'home'] as const;
export type Place = (typeof PLACES)[number];
export const isPlace = (x: unknown): x is Place => PLACES.includes(x as Place);
