/**
 * Sets within a session. PUT records one as it stands - each change is sent
 * as it is made, so a phone that locks or reloads mid-workout loses nothing.
 * DELETE `?entryId=&setNumber=` removes one.
 */

import { NextResponse } from 'next/server';

import { deleteSet, logSet } from '@/lib/db';
import { readJson } from '@/lib/profile-route';
import { requireSession } from '@/lib/session-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const num = (v: unknown, max: number): number | null | undefined => {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : undefined;
};

export async function PUT(request: Request, { params }: Params) {
  const found = requireSession(request, (await params).id);
  if (found instanceof NextResponse) return found;
  const body = await readJson<{ entryId?: unknown; setNumber?: unknown; weight?: unknown; reps?: unknown; done?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const setNumber = Number(body.setNumber);
  const weight = num(body.weight, 2000);
  const reps = num(body.reps, 1000);
  if (typeof body.entryId !== 'string' || !Number.isInteger(setNumber) || setNumber < 1 || setNumber > 50) {
    return NextResponse.json({ error: 'Which set?' }, { status: 400 });
  }
  if (weight === undefined || reps === undefined) return NextResponse.json({ error: 'Weight and reps must be numbers' }, { status: 400 });
  const ok = logSet(found.session.id, body.entryId, {
    setNumber, weight, reps: reps === null ? null : Math.round(reps), done: body.done === true,
  });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'No such exercise in this session' }, { status: 404 });
}

export async function DELETE(request: Request, { params }: Params) {
  const found = requireSession(request, (await params).id);
  if (found instanceof NextResponse) return found;
  const search = new URL(request.url).searchParams;
  deleteSet(found.session.id, search.get('entryId') ?? '', Number(search.get('setNumber')));
  return NextResponse.json({ ok: true });
}
