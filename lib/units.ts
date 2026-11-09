/**
 * Pounds or kilograms, chosen per person. Weights are always stored in
 * pounds; a kg person's numbers are converted on the way in and out. So a
 * plan copied between an lb and a kg friend, History and the progress charts
 * all stay right, and switching unit later rewrites nothing.
 *
 * Stored at full precision, a weight typed in kg comes back exactly: 22.5 kg
 * is kept as 49.6040 lb and shown again as 22.5.
 *
 * Server-safe: conversions only. Which unit the person uses lives in
 * unit-store.ts, in the browser.
 */

export type Unit = 'lb' | 'kg';
export const UNITS: Unit[] = ['lb', 'kg'];
export const isUnit = (x: unknown): x is Unit => x === 'lb' || x === 'kg';

export const KG_PER_LB = 0.45359237;

/** What the −/+ buttons add: 5 lb, or 2.5 kg - the smallest common plate pairs. */
export const STEP: Record<Unit, number> = { lb: 5, kg: 2.5 };

/** A stored weight (lb) in this unit. */
export const toUnit = (lb: number, unit: Unit) => (unit === 'kg' ? lb * KG_PER_LB : lb);

/** A typed weight in this unit, as stored (lb). */
export const fromUnit = (value: number, unit: Unit) => (unit === 'kg' ? value / KG_PER_LB : value);

/** "22.5", "49.6" - a stored weight for display, without trailing zeros. */
export const shownWeight = (lb: number, unit: Unit) => String(Math.round(toUnit(lb, unit) * 100) / 100);
