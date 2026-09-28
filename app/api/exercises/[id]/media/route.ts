/**
 * An exercise's clips. POST takes either a link as JSON - `{ "url": ... }` -
 * or a GIF or video as multipart form data under `file`, which is stored on
 * the Pi. DELETE `?mediaId=` removes one, and its file once nothing uses it.
 */

import { NextResponse } from 'next/server';

import { addMedia, deleteMedia, getWorkout } from '@/lib/db';
import { removeFiles, saveUpload } from '@/lib/files';
import { MAX_UPLOAD_MB, UPLOAD_TYPES } from '@/lib/media';
import { requireExercise } from '@/lib/profile-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const found = requireExercise(request, id);
  if (found instanceof NextResponse) return found;

  if ((request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file sent' }, { status: 400 });
    const ext = UPLOAD_TYPES[file.type];
    if (!ext) return NextResponse.json({ error: `A ${file.type || 'file of that type'} cannot be used as a clip - try a GIF, MP4 or MOV` }, { status: 415 });
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return NextResponse.json({ error: `Keep clips under ${MAX_UPLOAD_MB} MB` }, { status: 413 });
    const name = saveUpload(new Uint8Array(await file.arrayBuffer()), ext);
    addMedia(id, { kind: 'upload', file: name, mime: file.type });
  } else {
    const body = await request.json().catch(() => ({})) as { url?: unknown };
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2000) return NextResponse.json({ error: 'That does not look like a link' }, { status: 400 });
    addMedia(id, { kind: 'url', url });
  }
  return NextResponse.json({ workout: getWorkout(found.workoutId, found.profile) });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const found = requireExercise(request, id);
  if (found instanceof NextResponse) return found;
  const mediaId = new URL(request.url).searchParams.get('mediaId') ?? '';
  removeFiles(deleteMedia(id, mediaId));
  return NextResponse.json({ workout: getWorkout(found.workoutId, found.profile) });
}
