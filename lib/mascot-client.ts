'use client';

/**
 * This profile's mascot in the browser, fetched once and shared by every
 * place that draws it. Changing it tells them all to fetch again.
 */

import { useEffect, useState } from 'react';

import * as api from './api';
import type { Mascot } from './db';

const EVENT = 'gains-mascot-changed';
let pending: Promise<{ mascot: Mascot | null; canDraw: boolean }> | null = null;

function load() {
  pending ??= api.fetchMascot().catch(() => ({ mascot: null, canDraw: false }));
  return pending;
}

/** After picking or resetting a mascot: everything showing it draws the new one. */
export function mascotChanged(): void {
  pending = null;
  window.dispatchEvent(new Event(EVENT));
}

/** The mascot (null for Spot) once known; undefined while loading. */
export function useMyMascot(): { mascot: Mascot | null; canDraw: boolean } | undefined {
  const [state, setState] = useState<{ mascot: Mascot | null; canDraw: boolean }>();
  useEffect(() => {
    let live = true;
    const refresh = () => { load().then((s) => { if (live) setState(s); }); };
    refresh();
    window.addEventListener(EVENT, refresh);
    return () => { live = false; window.removeEventListener(EVENT, refresh); };
  }, []);
  return state;
}

export const useMascotName = () => useMyMascot()?.mascot?.name ?? 'Spot';
