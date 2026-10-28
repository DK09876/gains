/** This profile's progress: each exercise's top set in every finished workout. */

import { NextResponse } from 'next/server';

import { progressSeries } from '@/lib/db';
import { requireProfile } from '@/lib/profile-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  return NextResponse.json({ series: progressSeries(who.profile) });
}
