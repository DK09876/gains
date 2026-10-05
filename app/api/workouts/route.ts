/**
 * A profile's workouts: list, create, reorder - and copy one in from any
 * profile, which is how a friend starts from someone else's plan.
 *
 * A new or copied workout goes to the `place` given - the tab it was made on.
 *
 * `?of=<profile>` lists another profile's workouts, for choosing one to copy.
 */

import { NextResponse } from 'next/server';

import { copyWorkout, createWorkout, isPlace, knownProfile, listWorkouts, reorderWorkouts } from '@/lib/db';
import { readJson, requireProfile } from '@/lib/profile-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const of = knownProfile(new URL(request.url).searchParams.get('of'));
  return NextResponse.json({ workouts: listWorkouts(of ?? who.profile) });
}

export async function POST(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const body = await readJson<{ name?: unknown; copyFrom?: unknown; place?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const place = isPlace(body.place) ? body.place : undefined;
  if (typeof body.copyFrom === 'string') {
    const id = copyWorkout(body.copyFrom, who.profile, place);
    return id ? NextResponse.json({ id }) : NextResponse.json({ error: 'No such workout' }, { status: 404 });
  }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (!name) return NextResponse.json({ error: 'A workout needs a name' }, { status: 400 });
  return NextResponse.json({ id: createWorkout(who.profile, name, '', place) });
}

export async function PATCH(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const body = await readJson<{ order?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  if (!Array.isArray(body.order)) return NextResponse.json({ error: 'order must be a list of ids' }, { status: 400 });
  reorderWorkouts(who.profile, body.order.filter((x): x is string => typeof x === 'string'));
  return NextResponse.json({ workouts: listWorkouts(who.profile) });
}
