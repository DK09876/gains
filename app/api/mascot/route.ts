/**
 * This profile's mascot. GET it (null means Spot), PUT a drawing to keep it -
 * cleaned again here, whatever the page sends - or DELETE to go back to Spot.
 */

import { NextResponse } from 'next/server';

import { clearMascot, getMascot, setMascot } from '@/lib/db';
import { cleanDrawing } from '@/lib/mascot';
import { readJson, requireProfile } from '@/lib/profile-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  return NextResponse.json({ mascot: getMascot(who.profile), canDraw: !!process.env.GEMINI_API_KEY });
}

export async function PUT(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const body = await readJson<Record<string, unknown> & { faces?: Record<string, unknown> }>(request);
  if (body instanceof NextResponse) return body;
  const drawing = cleanDrawing({ name: body.name, body: body.body, ...(body.faces ?? {}) });
  if (!drawing) return NextResponse.json({ error: 'That drawing is missing parts' }, { status: 400 });
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 200) : '';
  setMascot(who.profile, { ...drawing, description });
  return NextResponse.json({ mascot: getMascot(who.profile) });
}

export async function DELETE(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  clearMascot(who.profile);
  return NextResponse.json({ mascot: null });
}
