/**
 * Which unit this person reads weights in, in the browser. Cached on the
 * device per profile so pages can show weights straight away; the Pi has the
 * real setting and refreshes the cache when the app opens.
 */

import { useSyncExternalStore } from 'react';

import { getProfile } from './profile';
import { isUnit, type Unit } from './units';

const key = () => `gains-unit-${getProfile()}`;
const listeners = new Set<() => void>();

export function getUnit(): Unit {
  if (typeof window === 'undefined') return 'lb';
  try {
    const stored = localStorage.getItem(key());
    return isUnit(stored) ? stored : 'lb';
  } catch {
    return 'lb';
  }
}

/** Remember this profile's unit on the device - from the Pi, or just chosen. */
export function rememberUnit(unit: Unit): void {
  try { localStorage.setItem(key(), unit); } catch { /* lb until the page is reloaded */ }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The unit, re-rendering when it changes. */
export const useUnit = (): Unit => useSyncExternalStore(subscribe, getUnit, () => 'lb');
