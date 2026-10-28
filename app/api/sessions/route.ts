/**
 * Workouts done and under way. GET gives the one in progress, if any, and
 * the history; POST `{ workoutId }` starts one - or returns the one already
 * going, since there is only ever one at a time.
 */

import { NextResponse } from 'next/server';

import { activeSession, closeStale, getPrefs, getSession, listSessions, setPrefs, startSession } from '@/lib/db';
import { readJson, requireProfile } from '@/lib/profile-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  // A workout left open half a day is over: kept if anything was done, else thrown away.
  closeStale(who.profile, STALE_AFTER_MS);
  // Opening the app is answer enough: Spot's count of ignored reminders starts again.
  if (getPrefs(who.profile).ignored) setPrefs(who.profile, { ignored: 0 });
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
