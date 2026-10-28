/** A session for a route, with its suggestions once it is finished. */

import { NextResponse } from 'next/server';

import { bestsBefore, currentTargets, getSession, type Session } from './db';
import { progressOf, type Progress } from './progress';
import { requireProfile } from './profile-route';
import { suggestTargets, type Suggestion } from './suggest';

export function requireSession(request: Request, id: string): { profile: string; session: Session } | NextResponse {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const session = getSession(id, who.profile);
  return session ? { profile: who.profile, session } : NextResponse.json({ error: 'No such session' }, { status: 404 });
}

export interface SessionResult { session: Session; suggestions: Suggestion[]; progress: Progress[] }

/** A finished session with the targets it suggests raising and what went up in it. */
export function withSuggestions(session: Session, profileId: string): SessionResult {
  if (!session.finishedAt) return { session, suggestions: [], progress: [] };
  const ids = session.entries.map((e) => e.exerciseId).filter((x): x is string => !!x);
  const suggestions = suggestTargets(
    session.entries.map((e) => ({ exerciseId: e.exerciseId, name: e.name, targetWeight: e.targetWeight, sets: e.logged })),
    currentTargets(ids),
  );
  const bests = bestsBefore(profileId, session.entries.filter((e) => e.exerciseId).map((e) => ({ id: e.exerciseId!, kind: e.kind })), session.startedAt);
  return { session, suggestions, progress: progressOf(session.entries, bests) };
}
