/**
 * Serves an uploaded clip, with byte ranges: Safari will not play a video
 * from a server that cannot send part of it, so without this an iPhone
 * shows a crossed-out play button. Names are random ids, so no profile is
 * asked for - an <img> or <video> tag has no way to send one.
 */

import { createReadStream, statSync } from 'fs';
import { Readable } from 'stream';

import { pathOf, SAFE_NAME } from '@/lib/files';
import { mimeOfFile } from '@/lib/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ file: string }> };

const stream = (path: string, start: number, end: number) =>
  Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;

export async function GET(request: Request, { params }: Params) {
  const { file } = await params;
  if (!SAFE_NAME.test(file)) return new Response('Not found', { status: 404 });
  const path = pathOf(file);
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const headers = {
    'Content-Type': mimeOfFile(file),
    'Accept-Ranges': 'bytes',
    // A file never changes under its name - a new upload gets a new one.
    'Cache-Control': 'public, max-age=31536000, immutable',
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    return new Response(stream(path, start, end), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new Response(size ? stream(path, 0, size - 1) : null, { headers: { ...headers, 'Content-Length': String(size) } });
}
