/**
 * What to show for an exercise's clip.
 *
 * A clip is either a file uploaded to the Pi or a link. Links are turned
 * into something that plays in place where the site allows it - YouTube
 * (Shorts included) as a muted, looping embed; Giphy as its GIF; a direct
 * image or video file as itself - and anything else is a link out, since
 * Instagram and TikTok only embed through their own scripts.
 */

export type MediaKind = 'upload' | 'url';

export interface Media {
  id: string;
  kind: MediaKind;
  /** The link, for kind 'url'. */
  url: string;
  /** The stored file's name, for kind 'upload'. */
  file: string;
  mime: string;
}

export type MediaView =
  | { type: 'youtube'; src: string; vertical: boolean }
  | { type: 'image'; src: string }
  | { type: 'video'; src: string }
  | { type: 'link'; href: string; label: string };

const IMAGE = /\.(gif|webp|png|jpe?g|avif)$/i;
const VIDEO = /\.(mp4|webm|mov|m4v)$/i;

function youtubeId(url: URL): { id: string; vertical: boolean } | null {
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  if (host === 'youtu.be') return { id: url.pathname.slice(1).split('/')[0], vertical: false };
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  const shorts = /^\/shorts\/([\w-]+)/.exec(url.pathname);
  if (shorts) return { id: shorts[1], vertical: true };
  const embed = /^\/embed\/([\w-]+)/.exec(url.pathname);
  if (embed) return { id: embed[1], vertical: false };
  const v = url.searchParams.get('v');
  return v ? { id: v, vertical: false } : null;
}

export function viewOfUrl(raw: string): MediaView {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { type: 'link', href: raw, label: raw };
  }
  const yt = youtubeId(url);
  if (yt?.id && /^[\w-]{6,}$/.test(yt.id)) {
    // loop needs playlist=<same id>; playsinline keeps an iPhone from going full screen.
    const params = new URLSearchParams({ autoplay: '1', mute: '1', loop: '1', playlist: yt.id, playsinline: '1', rel: '0', modestbranding: '1' });
    return { type: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt.id}?${params}`, vertical: yt.vertical };
  }
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'giphy.com') {
    const id = /\/(?:gifs|stickers)\/(?:[\w-]*-)?(\w+)\/?$/.exec(url.pathname)?.[1];
    if (id) return { type: 'image', src: `https://media.giphy.com/media/${id}/giphy.gif` };
  }
  if (IMAGE.test(url.pathname)) return { type: 'image', src: url.href };
  if (VIDEO.test(url.pathname)) return { type: 'video', src: url.href };
  return { type: 'link', href: url.href, label: host };
}

export function viewOf(media: Media, base = ''): MediaView {
  if (media.kind === 'url') return viewOfUrl(media.url);
  const src = `${base}/api/media/${media.file}`;
  return media.mime.startsWith('video/') ? { type: 'video', src } : { type: 'image', src };
}

/** What an upload may be, and the extension it is stored under. */
export const UPLOAD_TYPES: Record<string, string> = {
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
};

export const MAX_UPLOAD_MB = 150;

export function mimeOfFile(file: string): string {
  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  return Object.entries(UPLOAD_TYPES).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
}
