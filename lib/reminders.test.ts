/**
 * When Spot sends what, against a real database and a fake push service.
 * Times are local: the Pi's time zone is the one that counts.
 */

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gains-remind-'));
  vi.stubEnv('GAINS_DB_PATH', join(dir, 'gains.db'));
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

const PHONE = { endpoint: 'https://web.push.apple.com/abc', p256dh: 'k', auth: 'a' };

async function setup() {
  const db = await import('./db');
  const reminders = await import('./reminders');
  const push = await import('./push');
  const sent: Array<{ to: string; title: string; body: string }> = [];
  const send = vi.fn(async (sub: { endpoint: string }, payload: string) => {
    const owner = db.listProfiles().find((p) => db.subscriptionsFor(p.id).some((s) => s.endpoint === sub.endpoint))!;
    const message = JSON.parse(payload);
    sent.push({ to: owner.id, title: message.title, body: message.body });
  });
  db.addProfile('dk', 'DK');
  db.saveSubscription('dk', PHONE);
  const pull = db.createWorkout('dk', 'Pull');
  const row = db.addExercise(pull, { name: 'Rows', sets: 3 });
  return { db, reminders, push, send, sent, pull, row };
}

// Wednesday 28 October 2026 and the days around it, local time.
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);

describe('the training-day nudge', () => {
  it('comes once, after the reminder time, on a planned day not yet started', async () => {
    const { db, reminders, send, sent, pull } = await setup();
    db.setDay('dk', 3, pull);
    expect(await reminders.remind('dk', at(28, 17, 0), send)).toBeNull();
    expect(await reminders.remind('dk', at(28, 17, 31), send)).toBe('day');
    expect(await reminders.remind('dk', at(28, 18, 0), send)).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toBe('Pull day');
  });

  it('stays away on a rest day, or once a workout has started today', async () => {
    const { db, reminders, send, pull } = await setup();
    db.setDay('dk', 3, 'rest');
    expect(await reminders.remind('dk', at(28, 19), send)).toBeNull();
    db.setDay('dk', 3, pull);
    db.setPrefs('dk', { open: false });
    db.startSession('dk', pull);
    expect(await reminders.remind('dk', at(28, 19), send)).toBeNull();
  });

  it('turns into a comeback after three days without training', async () => {
    const { db, reminders, send, sent, pull, row } = await setup();
    const id = db.startSession('dk', pull)!;
    db.logSet(id, db.getSession(id, 'dk')!.entries[0].id, { setNumber: 1, weight: 40, reps: 8, done: true });
    db.finishSession(id);
    const raw = new (await import('node-sqlite3-wasm')).Database(process.env.GAINS_DB_PATH!);
    raw.run('UPDATE sessions SET startedAt = ? WHERE id = ?', [at(23, 18).toISOString(), id]);
    raw.close();
    db.setDay('dk', 3, pull);
    await reminders.remind('dk', at(28, 18), send);
    expect(sent[0].body).toMatch(/5 days|back|left off|short session/i);
    void row;
  });

  it('respects the switch, the mute, and the time', async () => {
    const { db, reminders, send, pull } = await setup();
    db.setDay('dk', 3, pull);
    db.setPrefs('dk', { day: false });
    expect(await reminders.remind('dk', at(28, 18), send)).toBeNull();
    db.setPrefs('dk', { day: true, mutedUntil: at(29, 0).toISOString() });
    expect(await reminders.remind('dk', at(28, 18), send)).toBeNull();
    db.setPrefs('dk', { mutedUntil: null, dayTime: '19:00' });
    expect(await reminders.remind('dk', at(28, 18), send)).toBeNull();
    expect(await reminders.remind('dk', at(28, 19), send)).toBe('day');
  });
});

describe('other nudges', () => {
  it('reminds about a workout left open two hours, once', async () => {
    const { db, reminders, send, sent, pull } = await setup();
    const id = db.startSession('dk', pull)!;
    const later = new Date(Date.now() + 2.5 * 3600_000);
    expect(await reminders.remind('dk', later, send)).toBe('open');
    expect(sent[0].title).toBe('Still at Pull?');
    expect(await reminders.remind('dk', new Date(later.getTime() + 86_400_000), send)).toBeNull();
    void id;
  });

  it('kicks off Monday with last week\'s tally', async () => {
    const { db, reminders, send, sent, pull } = await setup();
    db.setDay('dk', 1, pull);
    db.setDay('dk', 3, pull);
    expect(await reminders.remind('dk', at(26, 7, 0), send)).toBeNull();
    expect(await reminders.remind('dk', at(26, 7, 30), send)).toBe('week');
    expect(sent[0].title).toBe('New week');
  });

  it('goes quiet after three unopened nudges, until one is opened', async () => {
    const { db, reminders, send, sent, pull } = await setup();
    for (const d of [1, 2, 3, 4, 5, 6, 0]) db.setDay('dk', d, pull);
    await reminders.remind('dk', at(27, 18), send);
    await reminders.remind('dk', at(28, 18), send);
    await reminders.remind('dk', at(29, 18), send);
    expect(await reminders.remind('dk', at(30, 18), send)).toBeNull();
    expect(sent).toHaveLength(3);
    db.setPrefs('dk', { ignored: 0 });
    expect(await reminders.remind('dk', at(31, 18), send)).toBe('day');
  });

  it('counts a tapped nudge as heard', async () => {
    const { db, reminders, send, pull } = await setup();
    for (const d of [1, 2, 3, 4, 5, 6, 0]) db.setDay('dk', d, pull);
    await reminders.remind('dk', at(27, 18), send);
    db.markOpened(db.lastNotification('dk', ['day'])!.id);
    await reminders.remind('dk', at(28, 18), send);
    expect(db.getPrefs('dk').ignored).toBe(0);
  });
});

describe('friends', () => {
  it('hear when someone finishes, once a day, if they want to', async () => {
    const { db, reminders, send, sent, pull } = await setup();
    db.addProfile('kevin', 'Kevin');
    db.saveSubscription('kevin', { ...PHONE, endpoint: 'https://fcm.googleapis.com/kev' });
    const legs = db.createWorkout('kevin', 'Legs');
    db.addExercise(legs, { name: 'Squat' });
    const finish = async () => {
      const id = db.startSession('kevin', legs)!;
      db.logSet(id, db.getSession(id, 'kevin')!.entries[0].id, { setNumber: 1, weight: 100, reps: 5, done: true });
      db.finishSession(id);
      return reminders.friendFinished('kevin', id, at(28, 9), send);
    };
    expect(await finish()).toBe(1);
    expect(sent[0]).toMatchObject({ to: 'dk', title: 'Kevin finished Legs' });
    expect(await finish()).toBe(0);
    void pull;
  });

  it('can send Spot after each other once a day', async () => {
    const { db, reminders, send, sent } = await setup();
    db.addProfile('kevin', 'Kevin');
    expect(await reminders.sendSpot('dk', 'kevin', at(28, 9), send)).toBe('no-phone');
    db.saveSubscription('kevin', { ...PHONE, endpoint: 'https://fcm.googleapis.com/kev' });
    expect(await reminders.sendSpot('dk', 'kevin', at(28, 9), send)).toBe('sent');
    expect(sent[0]).toMatchObject({ to: 'kevin', title: 'DK sent Spot' });
    expect(await reminders.sendSpot('dk', 'kevin', at(28, 15), send)).toBe('already');
  });
});

describe('push', () => {
  it('only calls the browsers\' push services', async () => {
    const { push } = await setup();
    expect(push.isPushEndpoint('https://web.push.apple.com/x')).toBe(true);
    expect(push.isPushEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(push.isPushEndpoint('https://evil.example/x')).toBe(false);
    expect(push.isPushEndpoint('http://web.push.apple.com/x')).toBe(false);
    expect(push.isPushEndpoint('https://127.0.0.1:3000/')).toBe(false);
  });

  it('forgets a phone the push service says is gone', async () => {
    const { db, push } = await setup();
    const gone = vi.fn(async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); });
    expect(await push.pushTo('dk', { title: 't', body: 'b' }, 'test', '1', '', gone)).toBe(0);
    expect(db.subscriptionsFor('dk')).toEqual([]);
  });
});
