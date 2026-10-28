/**
 * An exercise's fields from a request body, checked. Only the fields present
 * are returned, so a PATCH changes just what it names; an empty number field
 * clears it ("no target yet").
 */

import type { ExerciseFields } from './db';
import { isKind } from './kinds';

const TEXT = { section: 60, name: 120, notes: 2000, reps: 30, weightNote: 60 } as const;

export function exerciseFields(body: Record<string, unknown>): ExerciseFields | string {
  const out: ExerciseFields = {};
  for (const [field, max] of Object.entries(TEXT) as Array<[keyof typeof TEXT, number]>) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') return `${field} must be text`;
    out[field] = value.trim().slice(0, max);
  }
  if (out.name === '') return 'An exercise needs a name';
  if (body.sets !== undefined) {
    if (body.sets === null || body.sets === '') out.sets = null;
    else {
      const sets = Number(body.sets);
      if (!Number.isInteger(sets) || sets < 1 || sets > 20) return 'Sets must be a whole number from 1 to 20';
      out.sets = sets;
    }
  }
  if (body.targetWeight !== undefined) {
    if (body.targetWeight === null || body.targetWeight === '') out.targetWeight = null;
    else {
      const weight = Number(body.targetWeight);
      if (!Number.isFinite(weight) || weight < 0 || weight > 2000) return 'Weight must be a number';
      out.targetWeight = weight;
    }
  }
  if (body.kind !== undefined) {
    if (!isKind(body.kind)) return 'kind must be lift, timed or check';
    out.kind = body.kind;
  }
  if (body.restSeconds !== undefined) {
    if (body.restSeconds === null || body.restSeconds === '') out.restSeconds = null;
    else {
      const rest = Number(body.restSeconds);
      if (!Number.isInteger(rest) || rest < 0 || rest > 900) return 'Rest must be a whole number of seconds, up to 15 minutes';
      out.restSeconds = rest;
    }
  }
  return out;
}
