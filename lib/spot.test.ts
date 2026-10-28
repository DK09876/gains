import { describe, expect, it } from 'vitest';

import { fill, pickLine } from './spot';

describe('Spot', () => {
  it('fills in names, numbers and plurals', () => {
    expect(fill('{n} new best{s}', { n: 1 })).toBe('1 new best');
    expect(fill('{n} new best{s}', { n: 3 })).toBe('3 new bests');
    expect(fill('{WORKOUT} DAY', { workout: 'Pull' })).toBe('PULL DAY');
    expect(fill('{missing} stays', {})).toBe('{missing} stays');
  });

  it('skips lines used recently, and repeats only when every line has been', () => {
    const a = pickLine('day', 'coach', { workout: 'Pull' }, [], 0);
    const b = pickLine('day', 'coach', { workout: 'Pull' }, [a.id], 0);
    expect(b.id).not.toBe(a.id);
    const all = ['day.coach.0', 'day.coach.1', 'day.coach.2', 'day.coach.3'];
    expect(pickLine('day', 'coach', { workout: 'Pull' }, all, 0).id).toBe('day.coach.0');
  });

  it('never leaves a placeholder unfilled in any line', () => {
    const vars = { workout: 'Pull', friend: 'Kevin', sender: 'DK', mascot: 'Gronk', n: 2, done: 2, planned: 4, next: 'Legs on Friday', days: 3, first: 'Legs' };
    for (const moment of ['day', 'comeback', 'rest', 'doneToday', 'monday', 'open', 'friend', 'best', 'finish', 'sent', 'restUp'] as const) {
      for (const tone of ['hype', 'coach', 'drill'] as const) {
        for (let seed = 0; seed < 6; seed++) expect(pickLine(moment, tone, vars, [], seed).text).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
