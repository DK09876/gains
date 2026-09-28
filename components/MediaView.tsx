'use client';

/**
 * An exercise's clips, one at a time, with dots to move between them.
 * Videos and GIFs loop silently, like a form demo should; YouTube plays
 * muted in place; anything that cannot be embedded is a link out.
 */

import { useState } from 'react';

import { viewOf, type Media } from '@/lib/media';

export default function MediaView({ media, compact }: { media: Media[]; compact?: boolean }) {
  const [index, setIndex] = useState(0);
  if (!media.length) return null;
  const current = media[Math.min(index, media.length - 1)];
  const view = viewOf(current);
  const height = compact ? 'max-h-48' : 'max-h-[45vh]';

  return (
    <div>
      <div className="flex justify-center overflow-hidden rounded-xl bg-black">
        {view.type === 'youtube' && (
          <iframe
            key={view.src}
            src={view.src}
            title="Exercise clip"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className={`w-full border-0 ${view.vertical ? `aspect-[9/16] ${compact ? 'max-w-[7rem]' : 'max-w-[15rem]'}` : 'aspect-video'}`}
          />
        )}
        {view.type === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element -- GIFs from anywhere; next/image would freeze them
          <img key={view.src} src={view.src} alt="Exercise clip" className={`${height} w-auto object-contain`} />
        )}
        {view.type === 'video' && (
          <video key={view.src} src={view.src} autoPlay muted loop playsInline className={`${height} w-auto`} />
        )}
        {view.type === 'link' && (
          <a href={view.href} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 py-8 text-sm text-[var(--accent)] underline">
            Open clip on {view.label} ↗
          </a>
        )}
      </div>
      {media.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1">
          {media.map((m, i) => (
            <button
              key={m.id}
              onClick={() => setIndex(i)}
              aria-label={`Clip ${i + 1} of ${media.length}`}
              aria-current={i === index}
              className="p-1.5"
            >
              <span className={`block h-2 w-2 rounded-full ${i === index ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
