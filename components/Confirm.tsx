'use client';

/**
 * Asking before something can't be undone, as a sheet from the bottom of the
 * screen rather than the browser's confirm box: it says what will happen, the
 * button says what it does, and a tap outside cancels.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Delete Legs?', body: '…', action: 'Delete', danger: true })) …
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface ConfirmOptions {
  title: string;
  body?: string;
  /** The button that goes ahead: "Delete", "Finish anyway". */
  action: string;
  /** The button that doesn't. */
  cancel?: string;
  danger?: boolean;
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const Context = createContext<Ask>(async () => false);

export const useConfirm = () => useContext(Context);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [asking, setAsking] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const actionRef = useRef<HTMLButtonElement>(null);

  const ask = useCallback<Ask>((options) => new Promise((resolve) => setAsking({ ...options, resolve })), []);
  const answer = (ok: boolean) => {
    asking?.resolve(ok);
    setAsking(null);
  };

  useEffect(() => {
    if (!asking) return;
    actionRef.current?.focus();
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { asking.resolve(false); setAsking(null); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [asking]);

  return (
    <Context.Provider value={ask}>
      {children}
      {asking && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button aria-label="Cancel" onClick={() => answer(false)} className="absolute inset-0 bg-black/60" />
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="relative w-full max-w-lg rounded-t-3xl border-t border-[var(--border)] bg-[var(--surface)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
          >
            <h2 id="confirm-title" className="text-lg font-bold">{asking.title}</h2>
            {asking.body && <p className="mt-1.5 text-[var(--muted)]">{asking.body}</p>}
            <div className="mt-5 flex flex-col gap-2">
              <button
                ref={actionRef}
                onClick={() => answer(true)}
                className={`rounded-xl py-3.5 font-bold ${asking.danger ? 'bg-[var(--danger)] text-[#1a0806]' : 'bg-[var(--accent)] text-[var(--on-accent)]'}`}
              >
                {asking.action}
              </button>
              <button onClick={() => answer(false)} className="rounded-xl border border-[var(--border)] py-3.5 font-semibold">
                {asking.cancel ?? 'Cancel'}
              </button>
            </div>
          </section>
        </div>
      )}
    </Context.Provider>
  );
}
