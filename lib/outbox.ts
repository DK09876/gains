/**
 * Sets waiting to reach the Pi.
 *
 * A gym basement drops the signal mid-set. Rather than lose a tick, each set
 * goes through here: it is kept on the phone (in localStorage, so a reload
 * keeps it too), sent, and only forgotten once the server has it. While any
 * are waiting it retries every few seconds, at once when the phone says it
 * is back online, and when the app comes back to the foreground.
 *
 * Only a failure to connect is retried. A refusal from the server - the
 * session was thrown away on another phone - will not get better by trying
 * again, so that set is dropped and the refusal reported.
 */

import { useSyncExternalStore } from 'react';

import type { LoggedSet } from './suggest';

export interface PendingSet {
  sessionId: string;
  entryId: string;
  set: LoggedSet;
}

type Send = (p: PendingSet) => Promise<unknown>;

interface Storage {
  load(): Record<string, PendingSet>;
  save(pending: Record<string, PendingSet>): void;
}

const keyOf = (p: { sessionId: string; entryId: string; setNumber: number }) => `${p.sessionId}|${p.entryId}|${p.setNumber}`;

/** fetch rejects with a TypeError when it cannot connect; anything else is the server answering. */
const isOffline = (e: unknown) => e instanceof TypeError;

export function createOutbox(send: Send, storage: Storage) {
  let pending = storage.load();
  const listeners = new Set<() => void>();
  let flushing: Promise<void> | null = null;
  let onRefused: (message: string) => void = () => {};

  const changed = () => {
    storage.save(pending);
    for (const listener of listeners) listener();
  };

  async function run(): Promise<void> {
    for (const [key, item] of Object.entries(pending)) {
      try {
        await send(item);
        // A newer value for the same set may have arrived while this one was in flight.
        if (pending[key] === item) {
          delete pending[key];
          changed();
        }
      } catch (e) {
        if (isOffline(e)) return;
        if (pending[key] === item) {
          delete pending[key];
          changed();
        }
        onRefused(e instanceof Error ? e.message : 'Could not save that set');
      }
    }
  }

  /** Send everything waiting; resolves once it has all gone, or the connection has failed again. */
  function flush(): Promise<void> {
    flushing ??= run().finally(() => { flushing = null; });
    return flushing;
  }

  return {
    /** Record a set as it stands now, and send it. */
    put(sessionId: string, entryId: string, set: LoggedSet): Promise<void> {
      pending = { ...pending, [keyOf({ sessionId, entryId, setNumber: set.setNumber })]: { sessionId, entryId, set } };
      changed();
      return flushing ? flushing.then(flush) : flush();
    },
    /** Forget a set that was removed before it was ever sent. */
    drop(sessionId: string, entryId: string, setNumber: number): void {
      const key = keyOf({ sessionId, entryId, setNumber });
      if (!(key in pending)) return;
      const { [key]: _gone, ...rest } = pending;
      void _gone;
      pending = rest;
      changed();
    },
    flush,
    count: () => Object.keys(pending).length,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    onRefused(handler: (message: string) => void) { onRefused = handler; },
  };
}

// --- the app's outbox ------------------------------------------------------

const STORE_KEY = 'gains-outbox';

const browserStorage: Storage = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Record<string, PendingSet>;
    } catch {
      return {};
    }
  },
  save(pending) {
    try {
      if (Object.keys(pending).length) localStorage.setItem(STORE_KEY, JSON.stringify(pending));
      else localStorage.removeItem(STORE_KEY);
    } catch { /* kept in memory until the page closes */ }
  },
};

type Outbox = ReturnType<typeof createOutbox>;
let instance: Outbox | null = null;

/** The one outbox for this page, created on first use in the browser. */
export function outbox(send: Send): Outbox {
  if (instance) return instance;
  const box = createOutbox(send, browserStorage);
  instance = box;
  const retry = () => { if (box.count()) void box.flush(); };
  window.addEventListener('online', retry);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') retry(); });
  setInterval(retry, 5000);
  return box;
}

/** How many sets are waiting to be sent - for the "not saved yet" banner. */
export function usePendingCount(box: Outbox | null): number {
  return useSyncExternalStore(
    (l) => box?.subscribe(l) ?? (() => {}),
    () => box?.count() ?? 0,
    () => 0,
  );
}
