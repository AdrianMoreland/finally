import { eur, eur0, longDate, shortDate, usePeople, usePeopleMutations } from '@finally/api-client';
import type { PersonDto } from '@finally/contracts';
import type { ReactNode } from 'react';
import { Share, View } from 'react-native';
import { Line } from '@/components/kit';
import { ErrorCard, LoadingCard } from '@/components/screen';
import { StackScreen } from '@/components/stack-screen';
import { AmountStepper, Segment } from '@/components/stepper';
import { Button, Card, Text, Track } from '@/components/ui/primitives';

function Person({ p }: { p: PersonDto }): ReactNode {
  const { addPayment } = usePeopleMutations();
  const done = Number(p.left) <= 0;
  const owe = p.direction === 'OWE';
  return (
    <View className="gap-1.5 border-t border-rule py-3 first:border-t-0">
      <View className="flex-row items-baseline justify-between">
        <Text variant="semi" className="flex-1">{p.name}{p.note ? ` · ${p.note}` : ''}</Text>
        <Text variant="num">{done ? 'Paid' : eur(p.left)}</Text>
      </View>
      {owe ? <Track value={Number(p.amount) > 0 ? (Number(p.paid) / Number(p.amount)) * 100 : 100} /> : null}
      <Text variant="small">
        {owe ? `${eur(p.paid)} of ${eur0(p.amount)} paid${!done && p.paidOffOn ? ` · paid off ${longDate(p.paidOffOn)}` : ''}` : `Since ${shortDate(p.since)}`}
      </Text>
      {!done ? (
        <View className="flex-row justify-end gap-2">
          {!owe ? <Button size="sm" variant="outline" onPress={() => void Share.share({ message: p.remindText })}>Send reminder</Button> : null}
          <Button size="sm" variant="outline" onPress={() => addPayment.mutate({ id: p.id, amount: p.left })}>{owe ? 'Paid in full' : 'They paid'}</Button>
        </View>
      ) : null}
    </View>
  );
}

export default function People(): ReactNode {
  const { data, error, refetch } = usePeople();
  const { plan } = usePeopleMutations();
  if (error) return <StackScreen title="People"><ErrorCard error={error} retry={() => void refetch()} /></StackScreen>;
  if (!data) return <StackScreen title="People"><LoadingCard height={260} /></StackScreen>;
  return (
    <StackScreen eyebrow="Money between you and people you know" title="People">
      <Card>
        <Text variant="eyebrow" className="mb-1">You owe · {eur(data.totalOwe)}</Text>
        {data.owe.length ? data.owe.map((p) => <Person key={p.id} p={p} />) : <Text variant="muted">You have not added anyone you owe. Add people on the web app.</Text>}
      </Card>
      {data.owe.length ? (
        <Card>
          <Text variant="eyebrow" className="mb-1">Your payoff plan</Text>
          <AmountStepper label="Each payday" value={Number(data.plan.monthly)} step={25} format={eur0} onChange={(v) => plan.mutate({ monthly: v.toFixed(2) })} />
          <Segment value={data.plan.order} onChange={(v) => plan.mutate({ order: v })} options={[['smallest', 'Smallest'], ['largest', 'Largest']]} />
          <Line label="Debt-free date" value={data.plan.freeDate ? longDate(data.plan.freeDate) : 'Not scheduled'} strong />
        </Card>
      ) : null}
      <Card>
        <Text variant="eyebrow" className="mb-1">Owed to you · {eur(data.totalOwed)}</Text>
        {data.owed.length ? data.owed.map((p) => <Person key={p.id} p={p} />) : <Text variant="muted">Nobody owes you anything.</Text>}
      </Card>
    </StackScreen>
  );
}
