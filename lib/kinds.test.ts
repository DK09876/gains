import { describe, expect, it } from 'vitest';

import { clock, goalSeconds, guessKind } from './kinds';
import { pageName, pagesOf } from './pages';
import type { SessionEntry } from './db';

describe('guessKind', () => {
  it('times anything given in seconds, checks off warm-ups, and lifts the rest', () => {
    expect(guessKind('Warm up', '45-60 s')).toBe('timed');
    expect(guessKind('Workout', '30 sec')).toBe('timed');
    expect(guessKind('Warm up', '')).toBe('check');
    expect(guessKind('warm-up', '10')).toBe('check');
    expect(guessKind('Workout', '8')).toBe('lift');
    expect(guessKind('', '8-12')).toBe('lift');
  });
});

describe('goalSeconds and clock', () => {
  it('aims for the low end of a range', () => {
    expect(goalSeconds('45-60 s')).toBe(45);
    expect(goalSeconds('')).toBeNull();
    expect(clock(45)).toBe('0:45');
    expect(clock(65)).toBe('1:05');
    expect(clock(-3)).toBe('0:00');
  });
});

const entry = (name: string, kind: SessionEntry['kind'], section = 'Warm up') =>
  ({ id: name, name, kind, section, logged: [] }) as unknown as SessionEntry;

describe('pagesOf', () => {
  it('puts a run of warm-ups on one page and gives each lift its own', () => {
    const pages = pagesOf([
      entry('Walk', 'check'), entry('Deep squat', 'check'), entry('Plank', 'timed'),
      entry('Face pull', 'check'), entry('Squat', 'lift', 'Workout'), entry('Calf raise', 'lift', 'Workout'),
    ]);
    expect(pages.map((p) => p.entries.map((e) => e.name))).toEqual([['Walk', 'Deep squat'], ['Plank'], ['Face pull'], ['Squat'], ['Calf raise']]);
    expect(pages.map(pageName)).toEqual(['Warm up', 'Plank', 'Face pull', 'Squat', 'Calf raise']);
  });

  it('keeps checks from different sections apart', () => {
    expect(pagesOf([entry('A', 'check', 'Warm up'), entry('B', 'check', 'Cool down')])).toHaveLength(2);
  });
});
