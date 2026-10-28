/**
 * A phone that will receive this profile's notifications. The app sends its
 * subscription every time it opens, since iPhones drop them quietly; DELETE
 * forgets one.
 */

import { NextResponse } from 'next/server';

import { deleteSubscription, saveSubscription } from '@/lib/db';
import { readJson, requireProfile } from '@/lib/profile-route';
import { isPushEndpoint } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

export async function POST(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const body = await readJson<Body>(request);
  if (body instanceof NextResponse) return body;
  const { endpoint } = body;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (typeof endpoint !== 'string' || !isPushEndpoint(endpoint) || typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ error: 'That is not a push subscription this server can use' }, { status: 400 });
  }
  saveSubscription(who.profile, { endpoint, p256dh, auth });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const body = await readJson<Body>(request);
  if (body instanceof NextResponse) return body;
  if (typeof body.endpoint === 'string') deleteSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
