/**
 * Which profile a request is for, checked against the database.
 *
 * Every data route takes `?profile=`, as LifeOS's and MTG Tracker's do. A
 * missing or unknown profile is refused rather than defaulted, so nothing is
 * ever written where its owner cannot see it. Another profile's workout,
 * exercise or session is a 404, the same as one that does not exist.
 */

import { NextResponse } from 'next/server';

import { exerciseOwner, getWorkout, knownProfile, type Workout } from './db';

export function profileOf(request: Request): string | null {
  return knownProfile(new URL(request.url).searchParams.get('profile')?.trim() || null);
}

/** The profile, or the response to send instead. */
export function requireProfile(request: Request): { profile: string } | NextResponse {
  const profile = profileOf(request);
  return profile ? { profile } : NextResponse.json({ error: 'Pick a profile first' }, { status: 400 });
}

export function requireWorkout(request: Request, id: string): { profile: string; workout: Workout } | NextResponse {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const workout = getWorkout(id, who.profile);
  return workout ? { profile: who.profile, workout } : NextResponse.json({ error: 'No such workout' }, { status: 404 });
}

export function requireExercise(request: Request, id: string): { profile: string; workoutId: string } | NextResponse {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const owner = exerciseOwner(id);
  return owner?.profileId === who.profile
    ? { profile: who.profile, workoutId: owner.workoutId }
    : NextResponse.json({ error: 'No such exercise' }, { status: 404 });
}

export async function readJson<T>(request: Request): Promise<T | NextResponse> {
  try {
    return (await request.json()) as T;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
}
