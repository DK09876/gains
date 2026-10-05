/**
 * Which tab - Gym or Home - Today and Plan are showing. One choice for both,
 * remembered on the device like the profile, so picking Home on Today opens
 * Plan on Home too. Storage can be unavailable; then it is Gym until changed.
 */

import { useSyncExternalStore } from 'react';

import type { Place } from './db';

const KEY = 'gains-place';
const listeners = new Set<() => void>();
let fallback: Place = 'gym';

function getPlace(): Place {
  try {
    return localStorage.getItem(KEY) === 'home' ? 'home' : 'gym';
  } catch {
    return fallback;
  }
}

export function setPlace(place: Place): void {
  fallback = place;
  try {
    localStorage.setItem(KEY, place);
  } catch { /* kept in memory until the page closes */ }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function usePlace(): Place {
  return useSyncExternalStore(subscribe, getPlace, () => 'gym');
}
