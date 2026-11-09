import { describe, expect, it } from 'vitest';

import { fromUnit, shownWeight, STEP, toUnit } from './units';

describe('units', () => {
  it('store in lb and show in either', () => {
    expect(shownWeight(95, 'lb')).toBe('95');
    expect(shownWeight(22.5, 'lb')).toBe('22.5');
    expect(shownWeight(100, 'kg')).toBe('45.36');
    expect(toUnit(10, 'lb')).toBe(10);
  });

  it('give back exactly what was typed in kg', () => {
    for (const kg of [2.5, 20, 22.5, 60, 102.5, 140]) {
      expect(shownWeight(fromUnit(kg, 'kg'), 'kg')).toBe(String(kg));
    }
  });

  it('step by the smallest common plates', () => {
    expect(STEP).toEqual({ lb: 5, kg: 2.5 });
  });
});
