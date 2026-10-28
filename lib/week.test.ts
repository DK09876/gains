import { describe, expect, it } from 'vitest';

import { weekStart, weekStrip, workoutWeekNote } from './week';

// Wednesday 28 October 2026, mid-afternoon local time.
const wed = new Date(2026, 9, 28, 15, 0);
// Sunday first, as Date#getDay numbers them: Mon Legs, Tue Push, Wed Pull, Thu rest, Fri Legs, Sat Upper.
const schedule = ['rest', 'legs', 'push', 'pull', 'rest', 'legs', 'upper'];
const workouts = [{ id: 'legs', name: 'Legs' }, { id: 'push', name: 'Push' }, { id: 'pull', name: 'Pull' }, { id: 'upper', name: 'Upper' }, { id: 'lower', name: 'Lower' }];
const at = (d: number, h = 18) => new Date(2026, 9, d, h).toISOString();

describe('weekStrip', () => {
  it('starts on Monday', () => {
    expect(weekStart(wed)).toEqual(new Date(2026, 9, 26));
  });

  it('marks done, missed, today and what is coming', () => {
    const { days, done, planned } = weekStrip(schedule, workouts, [
      { startedAt: at(26), setsDone: 12 },
      { startedAt: at(25), setsDone: 9 }, // last Sunday: a different week
      { startedAt: at(27), setsDone: 0 }, // opened and closed with nothing done: not training
    ], wed);
    expect(days.map((d) => `${d.letter}:${d.label}:${d.state}`)).toEqual([
      'M:Legs:done', 'T:Push:missed', 'W:Pull:today', 'T:Rest:rest', 'F:Legs:upcoming', 'S:Upper:upcoming', 'S:Rest:rest',
    ]);
    expect([done, planned]).toEqual([1, 5]);
  });

  it('misses nothing before your first workout', () => {
    const fresh = weekStrip(schedule, workouts, [], wed);
    expect(fresh.days.slice(0, 2).map((d) => d.state)).toEqual(['free', 'free']);
    expect(workoutWeekNote('push', fresh.days)).toBe('Tuesday');
    const started = weekStrip(schedule, workouts, [{ startedAt: at(27), setsDone: 3 }], wed);
    expect(started.days.slice(0, 3).map((d) => d.state)).toEqual(['free', 'done', 'today']);
  });

  it('counts training on any day, planned or not', () => {
    const { days } = weekStrip(schedule, workouts, [{ startedAt: at(29), setsDone: 4 }], new Date(2026, 9, 30, 9));
    expect(days[3].state).toBe('done');
  });

  it('says how each workout stands this week', () => {
    const { days } = weekStrip(schedule, workouts, [{ startedAt: at(26), setsDone: 12 }], wed);
    expect(workoutWeekNote('legs', days)).toBe('done Monday');
    expect(workoutWeekNote('push', days)).toBe('missed yesterday');
    expect(workoutWeekNote('upper', days)).toBe('Saturday');
    expect(workoutWeekNote('lower', days)).toBe('not planned this week');
  });
});
