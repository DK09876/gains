import { describe, expect, it } from 'vitest';

import { progressOf, topSet } from './progress';
import type { LoggedSet } from './suggest';

const s = (weight: number | null, reps: number | null, done = true): LoggedSet => ({ setNumber: 1, weight, reps, done });

describe('topSet', () => {
  it('is the heaviest set done, then the one with most reps', () => {
    expect(topSet([s(25, 8), s(30, 6), s(30, 8), s(40, 8, false)], 'lift')).toEqual({ weight: 30, reps: 8 });
    expect(topSet([s(null, 45), s(null, 55)], 'timed')).toEqual({ weight: null, reps: 55 });
    expect(topSet([s(25, 8, false)], 'lift')).toBeNull();
  });
});

describe('progressOf', () => {
  const entry = (name: string, kind: 'lift' | 'timed' | 'check', now: LoggedSet[], before: LoggedSet[] | null) =>
    ({ exerciseId: name, name, kind, logged: now, last: before ? { sets: before } : null });

  it('finds heavier, longer and more reps, with new bests first', () => {
    const out = progressOf([
      entry('Rows', 'lift', [s(40, 10)], [s(40, 8)]),
      entry('Hex bar', 'lift', [s(30, 8)], [s(25, 8)]),
      entry('Plank', 'timed', [s(null, 55)], [s(null, 45)]),
      entry('Shrugs', 'lift', [s(20, 8)], [s(22.5, 8)]),
    ], new Map([['Rows', 40], ['Hex bar', 25], ['Plank', 60]]));
    expect(out.map((p) => [p.name, p.best])).toEqual([['Hex bar', true], ['Rows', false], ['Plank', false]]);
  });

  it('leaves out first times, check-offs and anything not done', () => {
    expect(progressOf([
      entry('New', 'lift', [s(50, 8)], null),
      entry('Walk', 'check', [s(null, null)], [s(null, null)]),
      entry('Skipped', 'lift', [s(50, 8, false)], [s(40, 8)]),
    ], new Map())).toEqual([]);
  });
});

describe('chart ticks', async () => {
  const { niceTicks } = await import('../components/ProgressChart');
  it('are round numbers covering the data', () => {
    expect(niceTicks(25, 40)).toEqual([25, 30, 35, 40]);
    expect(niceTicks(95, 115)).toEqual([95, 100, 105, 110, 115]);
    expect(niceTicks(30, 30)).toEqual([25, 27.5, 30, 32.5, 35]);
    expect(niceTicks(0, 1)[0]).toBe(0);
  });
});
