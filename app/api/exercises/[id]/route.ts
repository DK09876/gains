/** One exercise: change its name, section, target or notes, or delete it. */

import { NextResponse } from 'next/server';

import { deleteExercise, getWorkout, updateExercise } from '@/lib/db';
import { exerciseFields } from '@/lib/exercise-fields';
import { removeFiles } from '@/lib/files';
import { readJson, requireExercise } from '@/lib/profile-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const found = requireExercise(request, id);
  if (found instanceof NextResponse) return found;
  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof NextResponse) return body;
  const fields = exerciseFields(body);
  if (typeof fields === 'string') return NextResponse.json({ error: fields }, { status: 400 });
  updateExercise(id, fields);
  return NextResponse.json({ workout: getWorkout(found.workoutId, found.profile) });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const found = requireExercise(request, id);
  if (found instanceof NextResponse) return found;
  removeFiles(deleteExercise(id));
  return NextResponse.json({ workout: getWorkout(found.workoutId, found.profile) });
}
