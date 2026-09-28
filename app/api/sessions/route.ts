/**
 * Workouts done and under way. GET gives the one in progress, if any, and
 * the history; POST `{ workoutId }` starts one - or returns the one already
 * going, since there is only ever one at a time.
 */

import { NextResponse } from 'next/server';

import { activeSession, getSession, listSessions, startSession } from '@/lib/db';
import { readJson, requireProfile } from '@/lib/profile-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const active = activeSession(who.profile);
  return NextResponse.json({
    active: active ? getSession(active, who.profile) : null,
    history: listSessions(who.profile),
  });
}

export async function POST(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const body = await readJson<{ workoutId?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const id = typeof body.workoutId === 'string' ? startSession(who.profile, body.workoutId) : null;
  if (!id) return NextResponse.json({ error: 'No such workout' }, { status: 404 });
  return NextResponse.json({ session: getSession(id, who.profile) });
}
