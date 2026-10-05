/** One workout: read it with its exercises and clips, rename it, move it between gym and home, delete it. */

import { NextResponse } from 'next/server';

import { deleteWorkout, getWorkout, isPlace, updateWorkout } from '@/lib/db';
import { removeFiles } from '@/lib/files';
import { readJson, requireWorkout } from '@/lib/profile-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const found = requireWorkout(request, (await params).id);
  if (found instanceof NextResponse) return found;
  return NextResponse.json({ workout: found.workout });
}

export async function PATCH(request: Request, { params }: Params) {
  const found = requireWorkout(request, (await params).id);
  if (found instanceof NextResponse) return found;
  const body = await readJson<{ name?: unknown; notes?: unknown; place?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : undefined;
  if (name === '') return NextResponse.json({ error: 'A workout needs a name' }, { status: 400 });
  if (body.place !== undefined && !isPlace(body.place)) return NextResponse.json({ error: 'place must be gym or home' }, { status: 400 });
  updateWorkout(found.workout.id, {
    name,
    notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : undefined,
    place: body.place,
  });
  return NextResponse.json({ workout: getWorkout(found.workout.id, found.profile) });
}

export async function DELETE(request: Request, { params }: Params) {
  const found = requireWorkout(request, (await params).id);
  if (found instanceof NextResponse) return found;
  removeFiles(deleteWorkout(found.workout.id));
  return NextResponse.json({ ok: true });
}
