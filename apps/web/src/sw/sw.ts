/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> };

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

interface PushData {
  kind?: string;
  title?: string;
  body?: string;
  categoryIdentifier?: string;
  data?: Record<string, string>;
}

/** The three quick answers per ask group; same slugs as the iOS notification categories. */
const BUTTONS: Record<string, Array<[slug: string, title: string]>> = {
  ask_food: [['coffee', 'Coffee'], ['eating-out', 'Eating out'], ['groceries', 'Groceries']],
  ask_transport: [['taxi', 'Taxi'], ['public-transport', 'Public transport'], ['fuel', 'Fuel']],
  ask_shopping: [['shopping', 'Shopping'], ['household', 'Household'], ['gifts', 'Gifts']],
  ask_bills: [['bills', 'Bills'], ['subscriptions', 'Subscriptions'], ['health', 'Health']],
  ask_fun: [['fun', 'Fun'], ['eating-out', 'Eating out'], ['travel', 'Travel']],
};

self.addEventListener('push', (event) => {
  let p: PushData = {};
  try {
    p = event.data?.json() ?? {};
  } catch {
    p = { title: 'Finally', body: event.data?.text() ?? '' };
  }
  // Browsers show at most two action buttons; the in-app inbox always has the full set.
  const actions = (p.categoryIdentifier ? (BUTTONS[p.categoryIdentifier] ?? []) : []).slice(0, 2).map(([action, title]) => ({ action, title }));
  // `actions` is supported by browsers but missing from the WebWorker lib typings.
  const options: NotificationOptions & { actions: Array<{ action: string; title: string }> } = {
    body: p.body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: p.data?.['requestId'] ? `ask-${p.data['requestId']}` : p.kind,
    data: p.data ?? {},
    actions,
  };
  event.waitUntil(self.registration.showNotification(p.title ?? 'Finally', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as Record<string, string>;
  const target =
    data['requestId'] && data['requestId'] !== 'test'
      ? `/sort?request=${encodeURIComponent(data['requestId'])}${event.action ? `&pick=${encodeURIComponent(event.action)}` : ''}`
      : data['screen']
        ? `/${data['screen']}`
        : '/sort';
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = wins[0];
      if (existing) {
        await existing.focus();
        if ('navigate' in existing) await (existing as WindowClient).navigate(target);
      } else {
        await self.clients.openWindow(target);
      }
    })(),
  );
});
