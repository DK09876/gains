/**
 * Whole plans to start from. GET lists every other profile with workouts,
 * each with its week; POST `{ from }` copies that profile's workouts and week
 * into this one - a new friend's one tap to get going.
 */

import { NextResponse } from 'next/server';

import { copyPlan, knownProfile, plansToCopy } from '@/lib/db';
import { readJson, requireProfile } from '@/lib/profile-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  return NextResponse.json({ plans: plansToCopy(who.profile) });
}

export async function POST(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const body = await readJson<{ from?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const from = knownProfile(typeof body.from === 'string' ? body.from : null);
  if (!from || from === who.profile) return NextResponse.json({ error: 'No such plan' }, { status: 404 });
  return NextResponse.json({ copied: copyPlan(from, who.profile) });
}
