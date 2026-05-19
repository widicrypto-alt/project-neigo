/**
 * Web Push client utilities.
 *
 * Usage:
 *   import { subscribeToPush, unsubscribeFromPush, isPushSupported } from '@/lib/push';
 */

const API_BASE = '/api/push';

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
}

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/vapid-key`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.publicKey ?? null;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * Register the service worker, request permission, subscribe to push,
 * and send the subscription to the server.
 *
 * Safe to call multiple times — checks for existing subscription first.
 *
 * @returns true if successfully subscribed, false otherwise.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    // Must have permission.
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;

    const reg = await navigator.serviceWorker.ready;

    // Check if already subscribed.
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      // Re-POST to ensure server has it (idempotent upsert).
      await sendSubscriptionToServer(existing);
      return true;
    }

    const publicKey = await getVapidPublicKey();
    if (!publicKey) return false;

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as ArrayBuffer,
    });

    await sendSubscriptionToServer(subscription);
    return true;
  } catch (err) {
    console.warn('[push] subscribe failed:', err);
    return false;
  }
}

async function sendSubscriptionToServer(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await fetch(`${API_BASE}/subscribe`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    }),
  });
}

/**
 * Permanently opt out of push notifications for this account.
 * Unsubscribes the device and removes all server-side subscriptions.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    // Tell server (permanent opt-out flag + delete all subscriptions).
    await fetch(`${API_BASE}/opt-out`, {
      method: 'POST',
      credentials: 'include',
    });

    // Also unsubscribe locally so browser won't prompt again.
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    }
    return true;
  } catch (err) {
    console.warn('[push] unsubscribe failed:', err);
    return false;
  }
}

/**
 * Check if push notifications are currently active for this browser.
 */
export async function getPushStatus(): Promise<'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'unsubscribed';
  } catch {
    return 'unsubscribed';
  }
}
