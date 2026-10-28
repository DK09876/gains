/**
 * Mascots to pick from: the built-in ones (cute and swole versions of eight
 * animals, drawn once and shipped with the app) and any that people drew and
 * shared. POST shares a drawing; DELETE `?id=` takes your own back out.
 */

import { NextResponse } from 'next/server';

import { shareMascot, sharedMascots, unshareMascot } from '@/lib/db';
import { cleanDrawing } from '@/lib/mascot';
import PRESETS from '@/lib/mascot-presets.json';
import { readJson, requireProfile } from '@/lib/profile-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SHARED = 100;

export async function GET(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  return NextResponse.json({ builtIn: PRESETS, shared: sharedMascots() });
}

export async function POST(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const body = await readJson<Record<string, unknown> & { faces?: Record<string, unknown> }>(request);
  if (body instanceof NextResponse) return body;
  const drawing = cleanDrawing({ name: body.name, body: body.body, ...(body.faces ?? {}) });
  if (!drawing) return NextResponse.json({ error: 'That drawing is missing parts' }, { status: 400 });
  if (sharedMascots().length >= MAX_SHARED) return NextResponse.json({ error: 'The gallery is full' }, { status: 400 });
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 200) : '';
  return NextResponse.json({ id: shareMascot(who.profile, { ...drawing, description }) });
}

export async function DELETE(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const id = new URL(request.url).searchParams.get('id') ?? '';
  return unshareMascot(who.profile, id) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Only whoever shared it can remove it' }, { status: 403 });
}
