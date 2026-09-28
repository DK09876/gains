/** A workout's exercises: add one, or put them in a new order. */

import { NextResponse } from 'next/server';

import { addExercise, getWorkout, reorderExercises } from '@/lib/db';
import { exerciseFields } from '@/lib/exercise-fields';
import { readJson, requireWorkout } from '@/lib/profile-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const found = requireWorkout(request, (await params).id);
  if (found instanceof NextResponse) return found;
  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof NextResponse) return body;
  const fields = exerciseFields(body);
  if (typeof fields === 'string') return NextResponse.json({ error: fields }, { status: 400 });
  const id = addExercise(found.workout.id, fields);
  return NextResponse.json({ id, workout: getWorkout(found.workout.id, found.profile) });
}

export async function PATCH(request: Request, { params }: Params) {
  const found = requireWorkout(request, (await params).id);
  if (found instanceof NextResponse) return found;
  const body = await readJson<{ order?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  if (!Array.isArray(body.order)) return NextResponse.json({ error: 'order must be a list of ids' }, { status: 400 });
  reorderExercises(found.workout.id, body.order.filter((x): x is string => typeof x === 'string'));
  return NextResponse.json({ workout: getWorkout(found.workout.id, found.profile) });
}
