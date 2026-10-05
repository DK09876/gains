/**
 * The week: GET this profile's plan for each day, Sunday first; PUT
 * `{ weekday, plan }` sets one day to a workout id, 'rest', or null.
 */

import { NextResponse } from 'next/server';

import { getSchedule, setDay } from '@/lib/db';
import { readJson, requireProfile } from '@/lib/profile-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  return NextResponse.json({ schedule: getSchedule(who.profile) });
}

export async function PUT(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const body = await readJson<{ weekday?: unknown; plan?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const plan = typeof body.plan === 'string' ? body.plan : null;
  if (!setDay(who.profile, Number(body.weekday), plan)) return NextResponse.json({ error: 'No such day or workout' }, { status: 400 });
  return NextResponse.json({ schedule: getSchedule(who.profile) });
}
