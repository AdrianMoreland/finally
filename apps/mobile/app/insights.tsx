import { shortDate, eur, useInsights, useQueue, useRecurring } from '@finally/api-client';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ErrorCard, LoadingCard } from '@/components/screen';
import { StackScreen } from '@/components/stack-screen';
import { Card, SeverityTag, Text } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

function Group({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <Card className="px-4 py-3">
      <Text variant="eyebrow" className="mb-1">
        {title}
      </Text>
      {children}
    </Card>
  );
}

export default function Insights(): ReactNode {
  const insights = useInsights();
  const queue = useQueue();
  const recurring = useRecurring();
  const items = insights.data?.items ?? [];
  const toSort = queue.data?.count ?? 0;

  const rows = (list: typeof items): ReactNode =>
    list.length === 0 ? (
      <Text variant="muted" className="py-2">
        Nothing here.
      </Text>
    ) : (
      list.map((i, idx) => (
        <View key={i.id} className={cn('gap-1.5 py-3', idx > 0 && 'border-t border-rule')}>
          <SeverityTag severity={i.severity} />
          <Text variant="semi">{i.title}</Text>
          <Text variant="muted">{i.body}</Text>
        </View>
      ))
    );

  return (
    <StackScreen eyebrow="Computed after each sync" title="Insights">
      {insights.error ? <ErrorCard error={insights.error} retry={() => void insights.refetch()} /> : null}
      {insights.isLoading ? <LoadingCard height={200} /> : null}
      {insights.data ? (
        <>
          <Group title="Needs you">
            {toSort > 0 ? (
              <Pressable onPress={() => router.push('/categorise')} className="gap-1.5 py-3" accessibilityRole="button">
                <SeverityTag severity="YOU" />
                <Text variant="semi">{toSort} merchants need a category</Text>
                <Text variant="muted">Answer once per merchant and every past and future payment follows.</Text>
              </Pressable>
            ) : null}
            {rows(items.filter((i) => i.severity === 'ACT'))}
          </Group>
          <Group title="Watch">{rows(items.filter((i) => i.severity === 'WATCH'))}</Group>
          <Group title="Good to know">{rows(items.filter((i) => i.severity === 'INFO'))}</Group>
          {recurring.data && recurring.data.length > 0 ? (
            <Group title="Recurring payments">
              {recurring.data.map((s, idx) => (
                <View key={s.id} className={cn('flex-row items-center justify-between py-2.5', idx > 0 && 'border-t border-rule')}>
                  <View>
                    <Text variant="semi">{s.merchantName}</Text>
                    <Text variant="small">
                      {s.cadence.toLowerCase()} · next {shortDate(s.nextDate)}
                    </Text>
                  </View>
                  <Text variant="num">{eur(s.lastAmount)}</Text>
                </View>
              ))}
            </Group>
          ) : null}
        </>
      ) : null}
    </StackScreen>
  );
}
