import { describe, expect, it } from 'vitest';

import { mimeOfFile, viewOf, viewOfUrl } from './media';

describe('viewOfUrl', () => {
  it('embeds YouTube Shorts upright and videos wide, muted and looping', () => {
    const short = viewOfUrl('https://www.youtube.com/shorts/C89EKtI8a3o');
    expect(short).toMatchObject({ type: 'youtube', vertical: true });
    expect(short.type === 'youtube' && short.src).toContain('youtube-nocookie.com/embed/C89EKtI8a3o?');
    expect(short.type === 'youtube' && short.src).toContain('playlist=C89EKtI8a3o');
    expect(short.type === 'youtube' && short.src).toContain('mute=1');
    expect(viewOfUrl('https://www.youtube.com/watch?v=dBYjU7iBpck&t=30')).toMatchObject({ type: 'youtube', vertical: false });
    expect(viewOfUrl('https://youtu.be/dBYjU7iBpck')).toMatchObject({ type: 'youtube', vertical: false });
    expect(viewOfUrl('https://m.youtube.com/shorts/K9nIGnmCX9w?feature=share')).toMatchObject({ type: 'youtube', vertical: true });
  });

  it('turns a Giphy page into its GIF', () => {
    expect(viewOfUrl('https://giphy.com/gifs/workout-squat-3o7TKSjRrfIPjeiVyM')).toEqual({
      type: 'image', src: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif',
    });
  });

  it('shows direct image and video files as themselves', () => {
    expect(viewOfUrl('https://example.com/a/squat.GIF')).toMatchObject({ type: 'image' });
    expect(viewOfUrl('https://example.com/clip.mp4?x=1')).toMatchObject({ type: 'video' });
  });

  it('links out to anything it cannot play in place', () => {
    expect(viewOfUrl('https://www.instagram.com/reel/abc/')).toEqual({ type: 'link', href: 'https://www.instagram.com/reel/abc/', label: 'instagram.com' });
    expect(viewOfUrl('not a url')).toMatchObject({ type: 'link' });
  });
});

describe('uploads', () => {
  it('are served from the media route, as video or image by type', () => {
    const base = { id: 'm', kind: 'upload' as const, url: '' };
    expect(viewOf({ ...base, file: 'a.mov', mime: 'video/quicktime' })).toEqual({ type: 'video', src: '/api/media/a.mov' });
    expect(viewOf({ ...base, file: 'a.gif', mime: 'image/gif' })).toEqual({ type: 'image', src: '/api/media/a.gif' });
    expect(mimeOfFile('x.mov')).toBe('video/quicktime');
    expect(mimeOfFile('x.exe')).toBe('application/octet-stream');
  });
});
