import { describe, expect, it } from 'vitest';

import { suggestTargets, topWeight, type LoggedSet } from './suggest';

const set = (weight: number | null, done = true, reps = 10): LoggedSet => ({ setNumber: 1, weight, reps, done });

describe('topWeight', () => {
  it('is the heaviest set actually done', () => {
    expect(topWeight([set(95), set(105, false), set(100)])).toBe(100);
    expect(topWeight([set(null), set(0)])).toBeNull();
    expect(topWeight([])).toBeNull();
  });
});

describe('suggestTargets', () => {
  const entry = (exerciseId: string | null, targetWeight: number | null, sets: LoggedSet[]) =>
    ({ exerciseId, name: exerciseId ?? 'gone', targetWeight, sets });

  it('suggests raising a target you beat, and setting one where there was none', () => {
    const current = new Map<string, number | null>([['hip', 95], ['rdl', null]]);
    expect(suggestTargets([entry('hip', 95, [set(95), set(100)]), entry('rdl', null, [set(40)])], current)).toEqual([
      { exerciseId: 'hip', name: 'hip', from: 95, to: 100 },
      { exerciseId: 'rdl', name: 'rdl', from: null, to: 40 },
    ]);
  });

  it('never suggests lowering one after a lighter day', () => {
    expect(suggestTargets([entry('hip', 95, [set(85)])], new Map([['hip', 95]]))).toEqual([]);
  });

  it('compares against the target as it is now, not when the workout started', () => {
    expect(suggestTargets([entry('hip', 95, [set(100)])], new Map([['hip', 100]]))).toEqual([]);
  });

  it('skips exercises deleted from the plan since', () => {
    expect(suggestTargets([entry(null, 95, [set(100)]), entry('old', 95, [set(100)])], new Map())).toEqual([]);
  });
});
