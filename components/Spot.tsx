'use client';

/**
 * The mascot: Spot - a 45 lb bumper plate with eyebrows - or whichever one
 * this profile picked or drew. His face follows his mood: pleased,
 * matter-of-fact, stern, or cheering a new best.
 *
 * A chosen mascot is shown as an <img> of its SVG, where nothing in it can
 * run; Spot himself is drawn here.
 */

import { composeSvg, svgDataUri, type Mood } from '@/lib/mascot';
import { useMyMascot } from '@/lib/mascot-client';

export type { Mood };

const FACES: Record<Mood, { brows: [string, string]; mouth: string; mouthFill?: boolean; eyes: 'open' | 'smile' }> = {
  happy: { brows: ['M33 36 Q42 30 51 36', 'M87 36 Q78 30 69 36'], mouth: 'M42 80 Q60 96 78 80', eyes: 'open' },
  coach: { brows: ['M33 37 L51 37', 'M87 37 L69 37'], mouth: 'M44 84 Q60 88 76 84', eyes: 'open' },
  stern: { brows: ['M32 33 L51 40', 'M88 33 L69 40'], mouth: 'M44 86 Q60 76 76 86', eyes: 'open' },
  cheer: { brows: ['M34 34 Q42 26 50 34', 'M86 34 Q78 26 70 34'], mouth: 'M40 76 Q60 100 80 76 Z', mouthFill: true, eyes: 'smile' },
};

interface Props {
  mood?: Mood;
  size?: number;
  label?: string;
  /** Draw this instead of the profile's own mascot - previews and the picker; null draws Spot. */
  drawing?: { body: string; faces: Record<Mood, string> } | null;
}

export default function Spot({ mood = 'happy', size = 52, label, drawing }: Props) {
  const mine = useMyMascot();
  const custom = drawing === undefined ? mine?.mascot : drawing;
  if (custom) {
    // eslint-disable-next-line @next/next/no-img-element -- an inline SVG data URI; next/image adds nothing
    return <img src={svgDataUri(composeSvg(custom.body, custom.faces[mood]))} width={size} height={size} alt={label ?? (mine?.mascot?.name || 'Mascot')} className="shrink-0" />;
  }
  const face = FACES[mood];
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={label ?? 'Spot'} className="shrink-0">
      <circle cx="60" cy="60" r="56" fill="var(--best)" />
      <circle cx="60" cy="60" r="11" fill="var(--background)" />
      {face.eyes === 'open' ? (
        <>
          <ellipse cx="42" cy="47" rx="7" ry="8" fill="#fff6f2" />
          <ellipse cx="78" cy="47" rx="7" ry="8" fill="#fff6f2" />
          <circle cx="43" cy="49" r="3.5" fill="#0f1211" />
          <circle cx="77" cy="49" r="3.5" fill="#0f1211" />
          <path d={face.brows[0]} stroke="#0f1211" strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d={face.brows[1]} stroke="#0f1211" strokeWidth="5" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <path d="M34 48 Q42 38 50 48" stroke="#fff6f2" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M70 48 Q78 38 86 48" stroke="#fff6f2" strokeWidth="5" fill="none" strokeLinecap="round" />
        </>
      )}
      <path d={face.mouth} stroke="#fff6f2" strokeWidth="5" strokeLinecap="round" fill={face.mouthFill ? '#fff6f2' : 'none'} />
    </svg>
  );
}
