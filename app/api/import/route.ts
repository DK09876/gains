/**
 * Import workouts from a Google Sheet exported as CSV (File → Download →
 * Comma-separated values). `?preview=1` only reads it, so the page can show
 * what would be added first; without it they are added to the profile.
 */

import { NextResponse } from 'next/server';

import { importWorkouts } from '@/lib/db';
import { requireProfile } from '@/lib/profile-route';
import { parseSheet } from '@/lib/sheet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const csv = await request.text();
  if (!csv.trim()) return NextResponse.json({ error: 'The file is empty' }, { status: 400 });
  if (csv.length > 1_000_000) return NextResponse.json({ error: 'That is a very large sheet - is it the right file?' }, { status: 413 });
  const parsed = parseSheet(csv);
  if (!parsed.workouts.length) return NextResponse.json({ error: 'No workouts found - each needs its name in the first column' }, { status: 422 });
  if (new URL(request.url).searchParams.get('preview')) return NextResponse.json(parsed);
  const ids = importWorkouts(who.profile, parsed.workouts);
  return NextResponse.json({ ...parsed, ids });
}
