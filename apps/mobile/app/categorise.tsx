import { eur, shortDate, useAnswer, useCategories, useQueue, useRecategorise, useTransaction } from '@finally/api-client';
import type { CategoryRef } from '@finally/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, View } from 'react-native';
import { Button, Text } from '@/components/ui/primitives';
import { categoryHex } from '@/lib/category';
import { cn } from '@/lib/cn';
import { useTheme } from '@/lib/theme';

interface Target {
  /** Request id for the To-sort inbox, undefined when editing an existing payment. */
  requestId?: string;
  transactionId?: string;
  displayName: string;
  rawDescriptor: string;
  amount: string;
  bookingDate: string;
  accountName: string;
  paymentCount?: number;
  suggested: CategoryRef[];
  canRemember: boolean;
}

/**
 * The categorise bottom sheet. Opened from a notification (requestId), the To-sort chip (first request in the
 * queue) or by tapping a payment (transactionId).
 */
export default function Categorise(): ReactNode {
  const { scheme } = useTheme();
  const params = useLocalSearchParams<{ requestId?: string; transactionId?: string }>();
  const queue = useQueue();
  const categories = useCategories();
  const tx = useTransaction(params.transactionId);
  const answer = useAnswer();
  const recategorise = useRecategorise();
  const [remember, setRemember] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const target: Target | null = useMemo(() => {
    if (params.transactionId) {
      const t = tx.data;
      if (!t) return null;
      return {
        transactionId: t.id,
        displayName: t.merchant?.displayName ?? t.rawDescriptor,
        rawDescriptor: t.rawDescriptor,
        amount: t.amountEur,
        bookingDate: t.bookingDate,
        accountName: t.accountName,
        suggested: [],
        canRemember: Boolean(t.merchant),
      };
    }
    const items = queue.data?.items ?? [];
    const r = (params.requestId ? items.find((i) => i.id === params.requestId) : undefined) ?? items[0];
    if (!r) return null;
    return {
      requestId: r.id,
      displayName: r.displayName,
      rawDescriptor: r.rawDescriptor,
      amount: r.amount,
      bookingDate: r.bookingDate,
      accountName: r.accountName,
      paymentCount: r.paymentCount,
      suggested: r.suggestedCategories,
      canRemember: true,
    };
  }, [params.transactionId, params.requestId, tx.data, queue.data]);

  const loading = categories.isLoading || (params.transactionId ? tx.isLoading : queue.isLoading);
  const close = (): void => (router.canGoBack() ? router.back() : router.replace('/'));

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator />
      </View>
    );
  }

  if (!target) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-surface px-6">
        <Text variant="heading">All sorted</Text>
        <Text variant="muted" className="text-center">
          Every merchant has a category. New ones will land here and in a notification.
        </Text>
        <Button variant="outline" onPress={close}>
          Close
        </Button>
      </View>
    );
  }

  const all = (categories.data ?? []).filter((c) => !c.archived && c.group !== 'TRANSFER' && c.group !== 'INCOME');
  const suggestedIds = new Set(target.suggested.map((c) => c.id));
  const grid: CategoryRef[] = [
    ...target.suggested,
    ...all.filter((c) => !suggestedIds.has(c.id)).map((c) => ({ id: c.id, name: c.name, slug: c.slug, colour: c.colour, icon: c.icon, parentId: c.parentId })),
  ];
  const busy = answer.isPending || recategorise.isPending;

  const choose = (c: CategoryRef): void => {
    const scope = remember && target.canRemember ? ('merchant' as const) : ('once' as const);
    const done = (updated: number): void => {
      setMessage(
        scope === 'merchant'
          ? `${target.displayName} → ${c.name}. ${updated} payment${updated === 1 ? '' : 's'} updated.`
          : `${target.displayName} → ${c.name} for this payment only.`,
      );
      // Inbox mode moves on to the next request; edit mode closes.
      if (target.transactionId) setTimeout(close, 700);
    };
    if (target.requestId) answer.mutate({ requestId: target.requestId, categoryId: c.id, scope }, { onSuccess: (r) => done(r.updatedCount) });
    else if (target.transactionId) recategorise.mutate({ id: target.transactionId, categoryId: c.id, scope }, { onSuccess: (r) => done(r.updatedCount) });
  };

  return (
    <View className="flex-1 bg-surface px-[18px] pt-5">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text variant="heading" className="text-[24px]">
          {eur(target.amount)}
        </Text>
        <Text variant="small">
          {shortDate(target.bookingDate)} · {target.accountName}
        </Text>
      </View>
      <View className="mt-1.5">
        <Text variant="semi">{target.displayName}</Text>
        <View className="mt-1 self-start rounded-[3px] bg-marker/50 px-1.5 py-0.5">
          <Text variant="mono" className="text-ink">
            {target.rawDescriptor}
          </Text>
        </View>
        {target.paymentCount ? (
          <Text variant="small" className="mt-1">
            {target.paymentCount} payment{target.paymentCount === 1 ? '' : 's'} from this merchant
          </Text>
        ) : null}
      </View>

      <Text variant="semi" className="mb-2 mt-4">
        What was it?
      </Text>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 12 }}>
        <View className="flex-row flex-wrap gap-2">
          {grid.slice(0, 18).map((c) => (
            <Pressable
              key={c.id}
              disabled={busy}
              onPress={() => choose(c)}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}`}
              className={cn(
                'items-center gap-1.5 rounded-[6px] border-[1.5px] px-1 py-2.5',
                suggestedIds.has(c.id) ? 'border-brand bg-brand-soft' : 'border-rule',
                busy && 'opacity-60',
              )}
              style={{ width: '31.5%' }}
            >
              <View className="size-3 rounded-full" style={{ backgroundColor: categoryHex(c, scheme) }} />
              <Text className="font-body-semi text-[11.5px]" numberOfLines={1}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {message ? (
        <Text variant="small" className="mb-2 text-good" accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
      {target.canRemember ? (
        <View className="mb-3 flex-row items-center justify-between">
          <Text variant="small" className="flex-1 pr-3">
            Remember for every {target.displayName} payment
          </Text>
          <Switch value={remember} onValueChange={setRemember} accessibilityLabel="Remember for this merchant" />
        </View>
      ) : null}
      <Button variant="outline" onPress={close} className="mb-6">
        {message && !target.transactionId ? 'Done for now' : 'Later'}
      </Button>
    </View>
  );
}
