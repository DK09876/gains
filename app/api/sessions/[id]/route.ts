/** One session: read it, finish it (`{ "finish": true }`), or throw it away. */

import { NextResponse } from 'next/server';

import { deleteSession, finishSession, getSession } from '@/lib/db';
import { readJson } from '@/lib/profile-route';
import { requireSession, withSuggestions } from '@/lib/session-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const found = requireSession(request, (await params).id);
  if (found instanceof NextResponse) return found;
  return NextResponse.json(withSuggestions(found.session));
}

export async function PATCH(request: Request, { params }: Params) {
  const found = requireSession(request, (await params).id);
  if (found instanceof NextResponse) return found;
  const body = await readJson<{ finish?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  if (body.finish === true) finishSession(found.session.id);
  return NextResponse.json(withSuggestions(getSession(found.session.id, found.profile)!));
}

export async function DELETE(request: Request, { params }: Params) {
  const found = requireSession(request, (await params).id);
  if (found instanceof NextResponse) return found;
  deleteSession(found.session.id);
  return NextResponse.json({ ok: true });
}
