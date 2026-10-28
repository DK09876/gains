/**
 * Draw a mascot from a description: `{ description }` gives back a drawing to
 * look at - nothing is kept until it is saved with PUT /api/mascot. A dozen
 * drawings per profile a day keeps the free model allowance for everyone.
 */

import { NextResponse } from 'next/server';

import { DEFAULT_MODEL, drawMascot, DrawError } from '@/lib/mascot';
import { readJson, requireProfile } from '@/lib/profile-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PER_DAY = 12;
const drawn = new Map<string, { day: string; count: number }>();

export async function POST(request: Request) {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: 'Drawing mascots is not set up on this server' }, { status: 503 });
  const body = await readJson<{ description?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const description = typeof body.description === 'string' ? body.description.trim().replace(/\s+/g, ' ') : '';
  if (description.length < 3) return NextResponse.json({ error: 'Describe your mascot in a few words' }, { status: 400 });
  if (description.length > 200) return NextResponse.json({ error: 'Keep it under 200 characters' }, { status: 400 });

  const day = new Date().toDateString();
  const used = drawn.get(who.profile);
  const count = used?.day === day ? used.count : 0;
  if (count >= PER_DAY) return NextResponse.json({ error: `That's ${PER_DAY} drawings today. Try again tomorrow.` }, { status: 429 });
  drawn.set(who.profile, { day, count: count + 1 });

  try {
    const drawing = await drawMascot(description, { key, model: process.env.GAINS_MASCOT_MODEL || DEFAULT_MODEL });
    return NextResponse.json({ drawing, left: PER_DAY - count - 1 });
  } catch (error) {
    if (error instanceof DrawError) return NextResponse.json({ error: error.message }, { status: 502 });
    console.error('[mascot] draw failed', error);
    return NextResponse.json({ error: 'Something went wrong drawing that' }, { status: 500 });
  }
}
