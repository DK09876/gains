/** A session for a route, with its suggestions once it is finished. */

import { NextResponse } from 'next/server';

import { currentTargets, getSession, type Session } from './db';
import { requireProfile } from './profile-route';
import { suggestTargets, type Suggestion } from './suggest';

export function requireSession(request: Request, id: string): { profile: string; session: Session } | NextResponse {
  const who = requireProfile(request);
  if (who instanceof NextResponse) return who;
  const session = getSession(id, who.profile);
  return session ? { profile: who.profile, session } : NextResponse.json({ error: 'No such session' }, { status: 404 });
}

export function withSuggestions(session: Session): { session: Session; suggestions: Suggestion[] } {
  if (!session.finishedAt) return { session, suggestions: [] };
  const ids = session.entries.map((e) => e.exerciseId).filter((x): x is string => !!x);
  const suggestions = suggestTargets(
    session.entries.map((e) => ({ exerciseId: e.exerciseId, name: e.name, targetWeight: e.targetWeight, sets: e.logged })),
    currentTargets(ids),
  );
  return { session, suggestions };
}
