/**
 * Turning notifications on, in the browser. On an iPhone they only work once
 * Gains is on the Home Screen, and permission can only be asked from a tap -
 * so this is called from the "Turn on" button, never by itself.
 */

import * as api from './api';

export type NotifyState = 'unsupported' | 'install-first' | 'off' | 'denied' | 'on';

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export function notifyState(): NotifyState {
  if (typeof window === 'undefined') return 'unsupported';
  if (isIos() && !standalone()) return 'install-first';
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' ? 'on' : 'off';
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function subscribe(publicKey: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await api.subscribePush(subscription.toJSON());
}

/** From a tap: ask permission and register this phone. Returns the new state. */
export async function turnOn(publicKey: string): Promise<NotifyState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  await subscribe(publicKey);
  return 'on';
}

/**
 * On every launch: if notifications are allowed, make sure the Pi has this
 * phone's current subscription. iPhones drop subscriptions without telling
 * anyone; this is how they come back.
 */
export async function refreshSubscription(): Promise<void> {
  if (notifyState() !== 'on') return;
  const { publicKey, canPush } = await api.fetchReminders();
  if (canPush && publicKey) await subscribe(publicKey);
}
