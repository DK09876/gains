/** Send Spot after a friend: one push, once a day per pair. */

import { NextResponse } from 'next/server';

import { knownProfile } from '@/lib/db';
import { readJson, requireProfile } from '@/lib/profile-route';
import { sendSpot } from '@/lib/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAYS = {
  sent: 'Spot is on his way.',
  already: 'You already sent Spot today.',
  muted: 'They muted Spot for today.',
  'no-phone': "They haven't turned on notifications yet.",
} as const;

export async function POST(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const body = await readJson<{ to?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const to = knownProfile(typeof body.to === 'string' ? body.to : null);
  if (!to || to === who.profile) return NextResponse.json({ error: 'No such friend' }, { status: 404 });
  const result = await sendSpot(who.profile, to);
  return NextResponse.json({ result, message: SAYS[result] });
}
