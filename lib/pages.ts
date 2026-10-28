/**
 * How a workout is paged through: consecutive check-off exercises in the same
 * section - the warm-up - share one checklist page; every lift or timed
 * exercise gets a page of its own.
 */

import type { SessionEntry } from './db';

export interface Page {
  entries: SessionEntry[];
  checklist: boolean;
}

export function pagesOf(entries: SessionEntry[]): Page[] {
  const pages: Page[] = [];
  for (const entry of entries) {
    const last = pages.at(-1);
    if (entry.kind === 'check' && last?.checklist && last.entries[0].section === entry.section) last.entries.push(entry);
    else pages.push({ entries: [entry], checklist: entry.kind === 'check' });
  }
  return pages;
}

/** What the Next button calls a page: the warm-up by its section, anything else by its exercise. */
export const pageName = (page: Page) =>
  page.checklist && page.entries.length > 1 ? page.entries[0].section || 'Checklist' : page.entries[0].name;
