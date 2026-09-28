'use client';

/**
 * Registers public/sw.js, which shows an offline page when the server cannot
 * be reached (see there). Production only: in development it would get in
 * the way of reloading.
 */

import { useEffect } from 'react';

export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* without it the app still works; only the offline page is missing */
    });
  }, []);
  return null;
}
