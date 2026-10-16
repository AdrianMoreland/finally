import { eur, eur0, shortDate, usePotMutations, usePots } from '@finally/api-client';
import { runwayMonths } from '@finally/finance-core';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ErrorCard, LoadingCard } from '@/components/screen';
import { StackScreen } from '@/components/stack-screen';
import { AmountStepper } from '@/components/stepper';
import { Callout, Line } from '@/components/kit';
import { Button, Card, Text, Track } from '@/components/ui/primitives';

export default function Pots(): ReactNode {
  const { data, error, refetch } = usePots();
  const { update, setBought } = usePotMutations();
  const [cut, setCut] = useState(30);
  if (error) return <StackScreen title="Pots"><ErrorCard error={error} retry={() => void refetch()} /></StackScreen>;
  if (!data) return <StackScreen title="Pots"><LoadingCard height={260} /></StackScreen>;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <StackScreen eyebrow={`${eur(data.total)} set aside`} title="Pots">
      <Card>
        <Text variant="eyebrow" className="mb-1">Your money ladder</Text>
        {data.ladder.rungs.map((r, i) => (
          <View key={r.key} className="flex-row items-start gap-3 border-t border-rule py-2 first:border-t-0">
            <Text variant="semi" className={r.done ? 'text-good' : i === data.ladder.current ? 'text-ink' : 'text-ink-3'}>{r.done ? '✓' : i + 1}</Text>
            <View className="flex-1"><Text variant="semi" className={r.done ? 'text-ink-2' : undefined}>{r.title}</Text><Text variant="small">{r.when}</Text></View>
          </View>
        ))}
      </Card>
      {data.pots.map((pot) => (
        <Card key={pot.id}>
          <Text variant="heading">{pot.name}</Text>
          <Text variant="small">Revolut vault · {pot.type === 'SAFETY' ? 'Safety' : pot.type === 'PLANNED' ? 'Planned spend' : pot.type === 'TREAT' ? 'Treat' : 'Investing'}</Text>
          <Text variant="num" className="mt-1">{eur(pot.balance)}{pot.effectiveTarget ? ` of ${eur0(pot.effectiveTarget)}` : ''}</Text>
          {pot.effectiveTarget ? <View className="my-2"><Track value={pot.progress} /></View> : null}
          <Text variant="small">{pot.type === 'SAFETY' ? `Three months of essentials on ${pot.reachText || 'when you add a monthly amount'}` : pot.effectiveTarget ? `Reaches its target on ${pot.reachText}` : 'No target set'}</Text>
          {pot.status?.late ? <View className="mt-2"><Callout tone="act">{`Lands after your date. ${eur0(Math.ceil(Number(pot.status.need)))} a month makes it in time.`}</Callout></View> : null}
          <AmountStepper label="Each payday" value={Number(pot.monthly)} step={25} format={eur0} onChange={(v) => update.mutate({ id: pot.id, monthly: v.toFixed(2) })} />
        </Card>
      ))}
      {data.runway.rainyId ? (
        <Card>
          <Text variant="eyebrow" className="mb-1">If your pay stopped tomorrow</Text>
          <AmountStepper label="Cut flexible spending by" value={cut} step={5} min={0} max={80} format={(v) => `${v}%`} onChange={setCut} />
          <Text variant="big" className="mt-2">{runwayMonths({ pool: (Number(data.runway.rainyBalance) + Number(data.runway.accounts)).toFixed(2), fixedBudget: data.runway.fixedBudget, flexBudget: data.runway.flexBudget, cutPct: cut }).months} months</Text>
          <Text variant="small" className="mt-1">Rainy day plus your accounts, with flexible spending cut by {cut}%.{data.runway.rentOwn ? ` Rent stays at your share, ${eur0(data.runway.rentOwn)}.` : ''} Jobseeker's Benefit would come on top.</Text>
          <Text variant="semi" className="mt-3">Before you take money out of Rainy day</Text>
          <Text variant="small">1. Is it unexpected? Christmas and trips home belong in their own pots.</Text>
          <Text variant="small">2. Is it necessary? Rent, health, getting to work, a phone you need.</Text>
          <Text variant="small">3. Is it urgent? Could it wait until payday on {shortDate(data.runway.nextPayday)}?</Text>
        </Card>
      ) : null}
      <Card>
        <Text variant="eyebrow" className="mb-1">Wishlist</Text>
        {data.wishlist.length ? data.wishlist.map((w) => {
          const locked = !w.boughtOn && w.unlocksOn > today;
          return (
            <View key={w.id} className="flex-row items-center justify-between gap-2 border-t border-rule py-2 first:border-t-0">
              <View className="flex-1"><Text variant="semi">{w.name}</Text><Text variant="small">{w.boughtOn ? `Bought ${shortDate(w.boughtOn)}` : locked ? `Wait until ${shortDate(w.unlocksOn)}` : w.affordableOn ? `Affordable ${w.affordableOn <= today ? 'now' : `on ${shortDate(w.affordableOn)}`}` : 'Add a monthly amount to Treats'}</Text></View>
              <Text variant="num">{eur(w.price)}</Text>
              {!w.boughtOn ? <Button size="sm" variant="outline" disabled={locked} onPress={() => setBought.mutate({ id: w.id, bought: true })}>Bought</Button> : null}
            </View>
          );
        }) : <Text variant="muted">Nothing on the list. Add items from the web app or by asking "Can I afford €300 headphones?".</Text>}
        <Line label="Anything over €100" value="waits 30 days" />
      </Card>
    </StackScreen>
  );
}
