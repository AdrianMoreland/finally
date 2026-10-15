import { eur, eur0, shortDate, useBillMutations, useBills } from '@finally/api-client';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Callout, Line } from '@/components/kit';
import { ErrorCard, LoadingCard } from '@/components/screen';
import { StackScreen } from '@/components/stack-screen';
import { Button, Card, Text } from '@/components/ui/primitives';

export default function Bills(): ReactNode {
  const { data, error, refetch } = useBills();
  const { cancel, dismiss } = useBillMutations();
  if (error) return <StackScreen title="Bills"><ErrorCard error={error} retry={() => void refetch()} /></StackScreen>;
  if (!data) return <StackScreen title="Bills"><LoadingCard height={260} /></StackScreen>;
  return (
    <StackScreen eyebrow="Found from your history" title="Bills & subscriptions">
      <Card>
        <Line label="Bills before payday" value={eur(data.billsBeforePayday)} strong />
        <Line label="Subscriptions" value={`${eur(data.subscriptions.monthly)} a month`} />
        <Line label="A year" value={eur0(data.subscriptions.yearly)} />
        {Number(data.subscriptions.savedMonthly) > 0 ? <Line label="Saved if cancelled" value={`${eur(data.subscriptions.savedMonthly)} a month`} tone="good" /> : null}
        <Line label="Bank charges, 12 months" value={eur(data.fees.last12Months)} />
      </Card>
      {data.repeating.filter((r) => r.rise && !r.cancelled).map((r) => (
        <Callout key={r.id} tone="act">{`${r.name} went up from ${eur(r.rise!.from)} to ${eur(r.rise!.to)} on ${shortDate(r.rise!.since)}: ${eur((Number(r.rise!.to) - Number(r.rise!.from)) * 12)} more a year.`}</Callout>
      ))}
      {data.doubles.map((d) => (
        <Card key={d.id}>
          <Text variant="semi">{d.merchantName} {eur(d.amount)} {d.count === 2 ? 'twice' : `${d.count} times`} on {shortDate(d.date)}</Text>
          <Text variant="small" className="mb-2">Same amount, same day. Check it is not a double charge.</Text>
          <Button size="sm" variant="outline" onPress={() => dismiss.mutate(d.id)}>It's fine</Button>
        </Card>
      ))}
      <Card>
        <Text variant="eyebrow" className="mb-1">Coming up</Text>
        {data.upcoming.slice(0, 8).map((u) => <Line key={u.id} label={`${shortDate(u.date)} · ${u.name}`} value={`${u.varies ? 'about ' : ''}${eur(u.amount)}`} />)}
      </Card>
      <Card>
        <Text variant="eyebrow" className="mb-1">Found</Text>
        {data.repeating.map((r) => (
          <View key={r.id} className="flex-row items-center justify-between gap-2 border-t border-rule py-2 first:border-t-0">
            <View className="flex-1">
              <Text variant="semi" className={r.cancelled ? 'text-ink-3' : undefined}>{r.name}</Text>
              <Text variant="small">{r.cadence === 'quarterly' ? 'Every 3 months' : 'Monthly'}, around the {r.usualDay}th</Text>
            </View>
            <Text variant="num">{r.varies ? `about ${eur(r.avg)}` : eur(r.amount)}</Text>
            {r.slug === 'subscriptions' ? <Button size="sm" variant="outline" onPress={() => cancel.mutate({ id: r.id, cancelled: !r.cancelled })}>{r.cancelled ? 'Keep' : 'Cancel?'}</Button> : null}
          </View>
        ))}
      </Card>
    </StackScreen>
  );
}
