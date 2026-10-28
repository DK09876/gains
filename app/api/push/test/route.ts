/** Send this profile a notification now, to check a phone receives them. */

import { NextResponse } from 'next/server';

import { getPrefs } from '@/lib/db';
import { requireProfile } from '@/lib/profile-route';
import { pushConfigured, pushTo } from '@/lib/push';
import { pickLine } from '@/lib/spot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  if (!pushConfigured()) return NextResponse.json({ error: 'This server has no notification keys yet' }, { status: 503 });
  const line = pickLine('day', getPrefs(who.profile).tone, { workout: 'Test' }, [], Date.now());
  const sent = await pushTo(who.profile, { title: 'Spot says hi', body: line.text, tag: 'test' }, 'test', String(Date.now()), line.id);
  return sent ? NextResponse.json({ sent }) : NextResponse.json({ error: 'No phone took it - turn notifications off and on again' }, { status: 502 });
}
