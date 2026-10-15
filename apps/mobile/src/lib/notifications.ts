import type { FinallyApi } from '@finally/api-client';
import { ASK_GROUP_BUTTONS, askCategoryId, askGroup, type AskGroup, type CategoryDto } from '@finally/contracts';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

/** Banner + list while the app is open; no sound or badge. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const titleCase = (slug: string): string => slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * iOS fixes button titles when a category is registered, so register one notification category per ask group
 * (ask_food, ask_transport, ...) with its three buttons. Button identifiers are category slugs. Call again
 * whenever categories change. `ask_other` has no buttons and is not registered.
 */
export async function registerAskCategories(categories: readonly CategoryDto[]): Promise<void> {
  const nameBySlug = new Map(categories.map((c) => [c.slug, c.name]));
  for (const group of askGroup.options as readonly AskGroup[]) {
    const slugs = ASK_GROUP_BUTTONS[group];
    if (slugs.length === 0) continue;
    await Notifications.setNotificationCategoryAsync(
      askCategoryId(group),
      slugs.map((slug) => ({
        identifier: slug,
        buttonTitle: nameBySlug.get(slug) ?? titleCase(slug),
        options: { opensAppToForeground: false },
      })),
    );
  }
}

export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Register this phone for remote pushes. Needs an EAS project id and a physical device. */
export async function registerForPush(api: FinallyApi): Promise<{ ok: boolean; reason?: string }> {
  if (!Device.isDevice) return { ok: false, reason: 'Push needs a physical device.' };
  if (!(await ensurePermission())) return { ok: false, reason: 'Notifications are turned off for Finally in Settings.' };
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Default', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const projectId = (Constants.expoConfig?.extra?.['eas'] as { projectId?: string } | undefined)?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { ok: false, reason: 'No EAS project is linked yet (run eas init). Local test notifications still work.' };
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerDevice({ platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID', token: data });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Could not get a push token.' };
  }
}

/** Show the sample ask-me notification locally, with its three buttons, without any push server. */
export async function sendLocalTestNotification(sample: {
  title: string;
  body: string;
  categoryIdentifier: string;
  data: Record<string, string>;
}): Promise<void> {
  if (!(await ensurePermission())) throw new Error('Allow notifications for Finally first.');
  await Notifications.scheduleNotificationAsync({
    content: { title: sample.title, body: sample.body, categoryIdentifier: sample.categoryIdentifier, data: sample.data },
    trigger: null,
  });
}

interface AskData {
  requestId?: string;
  merchantKey?: string;
  screen?: string;
  test?: string;
}

/**
 * Handle a tap on a notification or one of its buttons. A button answers the request straight away
 * (scope "merchant") without opening the app; tapping the body opens the categorise sheet.
 */
export async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  api: FinallyApi,
): Promise<void> {
  const data = (response.notification.request.content.data ?? {}) as AskData;
  const action = response.actionIdentifier;

  if (action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    if (data.requestId && data.requestId !== 'test') router.push({ pathname: '/categorise', params: { requestId: data.requestId } });
    else if (data.screen === 'insights') router.push('/(tabs)');
    else router.push('/categorise');
    return;
  }

  if (!data.requestId || data.test === 'true') {
    // Test notification: confirm locally so the buttons can be tried without a server.
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Button works', body: `You chose ${titleCase(action)}. Real requests are saved to the server.` },
      trigger: null,
    });
    return;
  }

  const categories = await api.categories();
  const category = categories.find((c) => c.slug === action);
  if (!category) return;
  try {
    const result = await api.answer(data.requestId, { categoryId: category.id, scope: 'merchant' });
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Saved: ${titleCase(data.merchantKey ?? 'merchant')} is ${category.name}`,
        body: `${result.updatedCount} payment${result.updatedCount === 1 ? '' : 's'} updated. Future ones sort themselves.`,
      },
      trigger: null,
    });
  } catch {
    router.push({ pathname: '/categorise', params: { requestId: data.requestId } });
  }
}
