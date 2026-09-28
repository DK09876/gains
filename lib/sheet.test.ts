import { describe, expect, it } from 'vitest';

import { parseCsv, parseSheet, parseWeight, splitName } from './sheet';

// The shapes a hand-laid-out sheet takes: a stray line before any workout,
// sections as labels over indented lines or beside their first exercise,
// weights in whatever column, links inline or in their own cell.
const SHEET = [
  ',,,,,,',
  ',,"Stretch, then foam roll",,,,',
  'Daily,,,,,,',
  ',Before,,,,,',
  ',,Easy walk,Low Intensity,,,',
  ',,Band pulls,,https://www.youtube.com/shorts/abcDEF12345,,',
  ',After,,,,,',
  ',,Rower,High Intensity,,,',
  ',Pick one,Sled,,,,',
  ',,Swim,,,,',
  ',,,,,,',
  'Legs,,,,,,',
  ',https://www.youtube.com/shorts/zzzZZZ98765 (deep squat hold 2 mins),,,,,',
  ',Squat-All glute regions+quads,,,,,',
  ',Lunges- glutes (12 steps each way),,,,,10 lbs each',
  ',"RDL-hamstrings, lower glutes",,,(Try leg press),,',
  ',Calf raises (bottom half),,,,,',
  ',,,,,,',
  'Pull,,,,,,',
  ',Lat pull down (elbows out),,,,55 lbs,',
  ',Preacher curl,,,,10lbs? Didnt feel right,',
  ',Lateral raise,,,,10pb,',
  ',Shrugs,,,,22.5 lbs,',
  'Core:,,,,,,',
  ',Kettlebell around the world 10-20 times each way,,,,,',
  ',Pull across (https://www.youtube.com/shorts/K9nIGnmCX9w),,,,,',
].join('\n');

describe('parseCsv', () => {
  it('keeps commas, quotes and newlines inside quoted fields', () => {
    expect(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\nd')).toEqual([['a', 'b, c', 'say "hi"', 'two\nlines'], ['d']]);
  });
});

describe('splitName', () => {
  it('splits at the first dash or bracket', () => {
    expect(splitName('Squat-All glute regions+quads')).toEqual({ name: 'Squat', notes: 'All glute regions+quads' });
    expect(splitName('Lunges- glutes (12 steps)')).toEqual({ name: 'Lunges', notes: 'glutes (12 steps)' });
    expect(splitName('Calf raises (bottom half)')).toEqual({ name: 'Calf raises', notes: 'bottom half' });
  });

  it('leaves a range of numbers alone', () => {
    expect(splitName('around the world 10-20 times').name).toBe('Around the world 10-20 times');
  });
});

describe('parseWeight', () => {
  it('reads a number with or without a unit, and keeps what follows as a note', () => {
    expect(parseWeight('95 lbs')).toEqual({ weight: 95, note: '' });
    expect(parseWeight('10 lb each side')).toEqual({ weight: 10, note: 'each side' });
    expect(parseWeight('10pb')).toEqual({ weight: 10, note: '' });
    expect(parseWeight('22.5 lbs')).toEqual({ weight: 22.5, note: '' });
    expect(parseWeight('10lbs? Didnt feel right')).toEqual({ weight: 10, note: 'Didnt feel right' });
  });

  it('is not fooled by notes', () => {
    expect(parseWeight('(Try leg press)')).toBeNull();
    expect(parseWeight('High Intensity')).toBeNull();
  });
});

describe('parseSheet', () => {
  const { workouts, skipped } = parseSheet(SHEET);
  const byName = (w: string) => workouts.find((x) => x.name === w)!;

  it('finds each workout, trimming a trailing colon', () => {
    expect(workouts.map((w) => w.name)).toEqual(['Daily', 'Legs', 'Pull', 'Core']);
  });

  it('reports a line that sits under no workout rather than dropping it', () => {
    expect(skipped).toEqual(['Stretch, then foam roll']);
  });

  it('reads sections, whether over indented lines or beside their first exercise', () => {
    expect(byName('Daily').exercises.map((e) => [e.section, e.name, e.notes])).toEqual([
      ['Before', 'Easy walk', 'Low Intensity'],
      ['Before', 'Band pulls', ''],
      ['After', 'Rower', 'High Intensity'],
      ['Pick one', 'Sled', ''],
      ['Pick one', 'Swim', ''],
    ]);
    expect(byName('Daily').exercises[1].urls).toEqual(['https://www.youtube.com/shorts/abcDEF12345']);
  });

  it('takes links out of the name and keeps them as clips', () => {
    const [hold, , , , , ] = byName('Legs').exercises;
    expect(hold.name).toBe('Deep squat hold 2 mins');
    expect(hold.urls).toEqual(['https://www.youtube.com/shorts/zzzZZZ98765']);
    const pull = byName('Core').exercises[1];
    expect(pull).toMatchObject({ name: 'Pull across', notes: '', urls: ['https://www.youtube.com/shorts/K9nIGnmCX9w'] });
  });

  it('reads target weights from any column, and other cells as notes', () => {
    const legs = byName('Legs').exercises;
    expect(legs[2]).toMatchObject({ name: 'Lunges', targetWeight: 10, weightNote: 'each' });
    expect(legs[3]).toMatchObject({ name: 'RDL', notes: 'hamstrings, lower glutes. Try leg press', targetWeight: null });
    expect(byName('Pull').exercises.map((e) => [e.name, e.targetWeight])).toEqual([
      ['Lat pull down', 55], ['Preacher curl', 10], ['Lateral raise', 10], ['Shrugs', 22.5],
    ]);
  });

  it('puts exercises at the outer indent in no section', () => {
    expect(byName('Legs').exercises.every((e) => e.section === '')).toBe(true);
  });
});
