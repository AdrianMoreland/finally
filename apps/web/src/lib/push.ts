import type { FinallyApi } from '@finally/api-client';

const toKey = (b64: string): Uint8Array<ArrayBuffer> => {
  const padded = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Subscribe this browser to Web Push and register the subscription with the API. Needs the installed/production build. */
export async function enableWebPush(api: FinallyApi): Promise<void> {
  if (!pushSupported()) throw new Error('This browser does not support push notifications.');
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error('Push works in the installed app or the production build, not the dev server.');
  const { publicKey } = await api.vapidKey();
  if (!publicKey) throw new Error('The server has no web push keys configured (VAPID_PUBLIC_KEY).');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed in the browser.');
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
  await api.registerDevice({ platform: 'WEB', token: JSON.stringify(sub) });
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
