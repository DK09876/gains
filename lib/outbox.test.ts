import { describe, expect, it } from 'vitest';

import { createOutbox, type PendingSet } from './outbox';

const set = (setNumber: number, weight: number) => ({ setNumber, weight, reps: 10, done: true });

/** A server that can be unplugged, and a phone's storage, both in memory. */
function rig(saved: Record<string, PendingSet> = {}) {
  const server: PendingSet[] = [];
  const state = { online: true, refuse: false, stored: saved };
  const box = createOutbox(async (p) => {
    if (!state.online) throw new TypeError('Load failed');
    if (state.refuse) throw new Error('No such session');
    server.push(p);
  }, { load: () => state.stored, save: (p) => { state.stored = p; } });
  return { box, server, state };
}

describe('outbox', () => {
  it('sends a set and forgets it once the server has it', async () => {
    const { box, server, state } = rig();
    await box.put('s', 'e', set(1, 95));
    expect(server.map((p) => p.set.weight)).toEqual([95]);
    expect(box.count()).toBe(0);
    expect(state.stored).toEqual({});
  });

  it('keeps sets on the phone while offline, and sends the latest of each once back', async () => {
    const { box, server, state } = rig();
    state.online = false;
    await box.put('s', 'e', set(1, 95));
    await box.put('s', 'e', set(1, 100));
    await box.put('s', 'e', set(2, 100));
    expect(box.count()).toBe(2);
    expect(Object.keys(state.stored)).toHaveLength(2);
    state.online = true;
    await box.flush();
    expect(server.map((p) => [p.set.setNumber, p.set.weight])).toEqual([[1, 100], [2, 100]]);
    expect(box.count()).toBe(0);
  });

  it('picks up sets left in storage by an earlier page', async () => {
    const left = { 's|e|1': { sessionId: 's', entryId: 'e', set: set(1, 80) } };
    const { box, server } = rig(left);
    expect(box.count()).toBe(1);
    await box.flush();
    expect(server).toHaveLength(1);
  });

  it('drops a set the server refuses, and says why, instead of retrying forever', async () => {
    const { box, state } = rig();
    const refused: string[] = [];
    box.onRefused((m) => refused.push(m));
    state.refuse = true;
    await box.put('s', 'e', set(1, 95));
    expect(box.count()).toBe(0);
    expect(refused).toEqual(['No such session']);
  });

  it('forgets a set removed before it was sent', async () => {
    const { box, server, state } = rig();
    state.online = false;
    await box.put('s', 'e', set(3, 95));
    box.drop('s', 'e', 3);
    state.online = true;
    await box.flush();
    expect(server).toEqual([]);
  });
});
