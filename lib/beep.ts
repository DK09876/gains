/**
 * A short beep when rest or a timed set is over.
 *
 * iPhones only play sound that a tap started, so the audio is unlocked on the
 * tap that starts the timer and the beep is scheduled ahead on that same
 * clock. It sounds while Gains is open; a locked phone needs a notification.
 */

let context: AudioContext | null = null;

/** Call from a tap: makes (or wakes) the audio clock so later beeps may play. */
export function primeAudio(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume();
  } catch { /* no sound, the timer still shows */ }
}

/** The time now, in epoch milliseconds - kept here so components read the clock only in handlers. */
export const nowMs = () => Date.now();

/** Milliseconds from now until a moment given as epoch milliseconds. */
export const msUntil = (at: number) => at - nowMs();

/** Beep twice, `inMs` from now. Returns a cancel function. */
export function scheduleBeep(inMs: number): () => void {
  if (!context) return () => {};
  const ctx = context;
  const nodes: OscillatorNode[] = [];
  const at = ctx.currentTime + Math.max(0, inMs) / 1000;
  for (const offset of [0, 0.22]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, at + offset);
    gain.gain.exponentialRampToValueAtTime(0.25, at + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at + offset);
    osc.stop(at + offset + 0.18);
    nodes.push(osc);
  }
  return () => nodes.forEach((n) => { try { n.stop(); n.disconnect(); } catch { /* already done */ } });
}
