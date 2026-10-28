/**
 * "Rest's up" for a locked phone: POST `{ at, next }` when rest starts, and
 * the Pi pushes at that moment; DELETE when rest is skipped or the app saw it
 * end. Only sent if the person turned rest alerts on.
 */

import { NextResponse } from 'next/server';

import { readJson, requireProfile } from '@/lib/profile-route';
import { cancelRest, scheduleRest } from '@/lib/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const body = await readJson<{ at?: unknown; next?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const at = Number(body.at);
  const next = typeof body.next === 'string' ? body.next.slice(0, 80) : 'next set';
  return NextResponse.json({ scheduled: Number.isFinite(at) && scheduleRest(who.profile, at, next) });
}

export async function DELETE(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  cancelRest(who.profile);
  return NextResponse.json({ ok: true });
}
