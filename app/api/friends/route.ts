/** Everyone else on this Gains: when they last trained, and whether you sent Spot today. */

import { NextResponse } from 'next/server';

import { friendsOf } from '@/lib/db';
import { requireProfile } from '@/lib/profile-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return NextResponse.json({ friends: friendsOf(who.profile, midnight.toISOString()) });
}
