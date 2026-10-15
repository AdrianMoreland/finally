import { eur, eur0, longDate, shortDate, usePayday, usePaydayMutations, usePeople, usePeopleMutations, usePotMutations, usePots } from '@finally/api-client';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Callout, Line } from '@/components/kit';
import { ErrorCard, LoadingCard } from '@/components/screen';
import { StackScreen } from '@/components/stack-screen';
import { AmountStepper } from '@/components/stepper';
import { Button, Card, Text } from '@/components/ui/primitives';

export default function Payday(): ReactNode {
  const plan = usePayday();
  const pots = usePots();
  const people = usePeople();
  const potM = usePotMutations();
  const peopleM = usePeopleMutations();
  const { setOrder, settings } = usePaydayMutations();
  const p = plan.data;
  if (plan.error) return <StackScreen title="Payday plan"><ErrorCard error={plan.error} retry={() => void plan.refetch()} /></StackScreen>;
  if (!p || !pots.data || !people.data) return <StackScreen title="Payday plan"><LoadingCard height={260} /></StackScreen>;
  const left = Number(p.left);
  return (
    <StackScreen eyebrow={`Next payday ${longDate(p.nextPayday)}`} title="Payday plan">
      <Card>
        <Text variant="eyebrow" className="mb-1">Where {eur(p.netPay)} goes</Text>
        <Line label="Fixed bills" value={eur0(p.fixed)} />
        <Line label="Flexible budgets" value={eur0(p.flexible)} />
        {p.items.map((i) => <Line key={i.key} label={i.name} value={eur0(i.amount)} />)}
        <Line label={left >= 0 ? 'Unplanned' : 'More than you have'} value={eur0(Math.abs(left))} strong tone={left < 0 ? 'warn' : undefined} />
      </Card>
      <Card>
        <Text variant="eyebrow" className="mb-1">Each payday</Text>
        {pots.data.pots.map((pot) => (
          <AmountStepper key={pot.id} label={pot.name} value={Number(pot.monthly)} step={25} format={eur0} onChange={(v) => potM.update.mutate({ id: pot.id, monthly: v.toFixed(2) })} />
        ))}
        <AmountStepper label="Paying people back" value={Number(people.data.plan.monthly)} step={25} format={eur0} onChange={(v) => peopleM.plan.mutate({ monthly: v.toFixed(2) })} />
        {left < 0 ? <Callout tone="act">Your plan adds up to more than your pay leaves. Lower a pot, or trim a flexible budget.</Callout> : null}
      </Card>
      <Card>
        <Text variant="eyebrow" className="mb-1">Payday checklist</Text>
        {p.orders.length ? p.orders.map((o) => (
          <View key={o.key} className="gap-1 border-t border-rule py-2.5 first:border-t-0">
            <View className="flex-row justify-between"><Text variant="semi">{o.name}</Text><Text variant="num">{eur0(o.amount)}</Text></View>
            <Text variant="small">AIB → {o.to} · on {shortDate(p.nextPayday)}</Text>
            <View className="flex-row items-center justify-between">
              <Text variant="small" className={o.arrived || o.state === 'ok' ? 'text-good' : 'text-marker-ink'}>{o.arrived ? 'Arrived' : o.state === 'ok' ? 'Standing order set' : o.state === 'changed' ? `Bank has ${eur0(o.set ?? '0')}` : 'Not set up'}</Text>
              {o.state !== 'ok' ? <Button size="sm" variant="outline" onPress={() => setOrder.mutate({ key: o.key, amount: o.amount })}>{o.state === 'missing' ? "I've set it up" : "I've changed it"}</Button> : null}
            </View>
          </View>
        )) : <Text variant="muted">No standing orders yet. Give a pot an amount and it shows up here.</Text>}
        <Text variant="small" className="mt-2">Finally only reads your accounts. You set each standing order up once in AIB; it ticks them off when they land.</Text>
      </Card>
      <Card>
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1"><Text variant="semi">Plan on salary only</Text><Text variant="small">The bonus never props up rent or food.</Text></View>
          <Button size="sm" variant={p.salaryOnly ? 'primary' : 'outline'} onPress={() => settings.mutate({ salaryOnly: !p.salaryOnly })}>{p.salaryOnly ? 'On' : 'Off'}</Button>
        </View>
      </Card>
      <Card>
        <Text variant="eyebrow" className="mb-1">Balance until payday</Text>
        <Line label="Today" value={eur(p.balanceToday)} />
        {p.cashflow.map((c, i) => <Line key={i} label={`${shortDate(c.date)} · ${c.name}`} value={eur(c.balance)} />)}
        <Line label="Flexible spending still budgeted" value={`−${eur(p.flexLeft)}`} />
        <Line label={`Lowest point before ${shortDate(p.nextPayday)}`} value={eur(p.lowestBalance)} strong tone={Number(p.lowestBalance) < 200 ? 'warn' : undefined} />
      </Card>
    </StackScreen>
  );
}
