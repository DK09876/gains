/**
 * Sending notifications to phones, through each browser's push service.
 *
 * The Pi only ever calls out - to Apple's, Google's or Mozilla's push service,
 * which hold the connection to the phone - so this works from behind
 * Tailscale. Keys come from the environment (see the README); without them
 * nothing is sent and the app works as before.
 *
 * Only the browsers' own push services are called: a subscription naming any
 * other host is refused, so a stored endpoint can't make the Pi fetch an
 * arbitrary URL. A subscription the push service says is gone (404, 410) is
 * deleted - iPhones drop them quietly after long disuse, and the app
 * re-subscribes the next time it is opened.
 */

import webpush from 'web-push';

import { deleteSubscription, logNotification, subscriptionsFor, type PushSubscriptionRow } from './db';

const PUBLIC = process.env.GAINS_VAPID_PUBLIC ?? '';
const PRIVATE = process.env.GAINS_VAPID_PRIVATE ?? '';
// Apple rejects a localhost subject; the app's own address is a real one.
const SUBJECT = process.env.GAINS_VAPID_SUBJECT ?? 'https://gains.tail57458f.ts.net';

export const pushConfigured = () => !!(PUBLIC && PRIVATE);
export const publicKey = () => PUBLIC;

if (pushConfigured()) webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);

const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
}

export interface Message {
  title: string;
  body: string;
  /** Where tapping it opens. */
  url?: string;
  /** A newer notification with the same tag replaces the older one. */
  tag?: string;
}

type Send = (sub: PushSubscriptionRow, payload: string) => Promise<unknown>;

const realSend: Send = (sub, payload) =>
  webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 6 * 3600, urgency: 'normal' });

/**
 * Log and send a message to every phone this profile has. Returns how many
 * received it. `kind` and `key` identify it for "already sent" checks;
 * `lineId` is the Spot line used, so it isn't repeated soon.
 */
export async function pushTo(
  profileId: string, message: Message, kind: string, key: string, lineId = '', send: Send = realSend, at: Date = new Date(),
): Promise<number> {
  if (send === realSend && !pushConfigured()) return 0;
  const subs = subscriptionsFor(profileId).filter((s) => isPushEndpoint(s.endpoint));
  if (!subs.length) return 0;
  const id = logNotification(profileId, kind, key, lineId, at);
  const payload = JSON.stringify({ ...message, id, url: message.url ?? '/' });
  let delivered = 0;
  await Promise.all(subs.map(async (sub) => {
    try {
      await send(sub, payload);
      delivered++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) deleteSubscription(sub.endpoint);
      else console.error('[push] send failed', status ?? error);
    }
  }));
  return delivered;
}
