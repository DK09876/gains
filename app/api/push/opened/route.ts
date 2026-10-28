/**
 * A notification was tapped. Its id is random and unguessable, and the
 * service worker sending this has no profile to hand, so none is asked for.
 */

import { NextResponse } from 'next/server';

import { markOpened } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { id?: unknown };
  if (typeof body.id === 'string' && /^[0-9a-f-]{36}$/.test(body.id)) markOpened(body.id);
  return NextResponse.json({ ok: true });
}
