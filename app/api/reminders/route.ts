/**
 * Spot and reminders for this profile: GET the settings (and whether the Pi
 * can send at all), PATCH any of them. `"mute": "today"` quiets Spot until
 * midnight; `"mute": null` lifts it.
 */

import { NextResponse } from 'next/server';

import { getPrefs, setPrefs, subscriptionsFor, type ReminderPrefs } from '@/lib/db';
import { readJson, requireProfile } from '@/lib/profile-route';
import { publicKey, pushConfigured } from '@/lib/push';
import { isTone } from '@/lib/spot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const view = (profile: string) => ({
  prefs: getPrefs(profile),
  muted: (getPrefs(profile).mutedUntil ?? '') > new Date().toISOString(),
  canPush: pushConfigured(),
  publicKey: publicKey(),
  phones: subscriptionsFor(profile).length,
});

export async function GET(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  return NextResponse.json(view(who.profile));
}

export async function PATCH(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof NextResponse) return body;
  const change: Partial<ReminderPrefs> = {};
  if (body.tone !== undefined) {
    if (!isTone(body.tone)) return NextResponse.json({ error: 'tone must be hype, coach or drill' }, { status: 400 });
    change.tone = body.tone;
  }
  if (body.dayTime !== undefined) {
    if (typeof body.dayTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.dayTime)) return NextResponse.json({ error: 'Time must look like 17:30' }, { status: 400 });
    change.dayTime = body.dayTime;
  }
  for (const flag of ['day', 'friend', 'week', 'open', 'rest'] as const) {
    if (body[flag] !== undefined) change[flag] = body[flag] === true;
  }
  if (body.mute !== undefined) {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    change.mutedUntil = body.mute === 'today' ? midnight.toISOString() : null;
  }
  setPrefs(who.profile, change);
  return NextResponse.json(view(who.profile));
}
