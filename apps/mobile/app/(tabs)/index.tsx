import { clockTime, eur, eur0, maskText, shortDate, useCashflow, useMe, usePeople, useSnooze, useTaxMutations, useToday } from '@finally/api-client';
import type { ActionItemDto } from '@finally/contracts';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, Share, View } from 'react-native';
import { Sankey } from '@/components/charts/sankey';
import { Callout, Line, mobileHref } from '@/components/kit';
import { ErrorCard, LoadingCard, Screen } from '@/components/screen';
import { Button, Card, MarkerChip, SeverityTag, Text, Track } from '@/components/ui/primitives';
import { usePrivacy } from '@/lib/privacy';

function Action({ a }: { a: ActionItemDto }): ReactNode {
  const snooze = useSnooze();
  const tax = useTaxMutations();
  const people = usePeople();
  const run = (): void => {
    const cta = a.cta;
    if (cta.kind === 'go') router.push(mobileHref(cta.to));
    else if (cta.kind === 'check') tax.setCheck.mutate({ itemId: cta.itemId, state: cta.state });
    else {
      const text = cta.kind === 'copy' ? cta.text : people.data?.owed.find((p) => p.id === cta.personId)?.remindText;
      if (text) void Share.share({ message: text });
    }
  };
  return (
    <View className="gap-2 border-t border-rule py-3 first:border-t-0">
      <View className="flex-row items-start gap-2.5">
        <SeverityTag severity={a.severity} />
        <View className="flex-1">
          <Text variant="semi">{maskText(a.title)}</Text>
          <Text variant="small" className="mt-0.5">{maskText(a.body)}</Text>
        </View>
      </View>
      <View className="flex-row items-center justify-end gap-3">
        <Text variant="small">{eur0(a.amount)}</Text>
        <Pressable onPress={() => snooze.mutate(a.id)} accessibilityRole="button" accessibilityLabel={`Snooze: ${a.title}`}>
          <Text variant="small" className="text-ink-3">Snooze</Text>
        </Pressable>
        <Button size="sm" variant="outline" onPress={run}>{a.cta.label}</Button>
      </View>
    </View>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Fri 16 Oct · Hi Sam" */
function eyebrowFor(today: string, first: string | null): string {
  const [y, m, d] = today.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()];
  return `${wd} ${d} ${MONTHS[(m ?? 1) - 1]}${first ? ` · Hi ${first}` : ''}`;
}

function CashflowCard(): ReactNode {
  const q = useCashflow('sincepay', false);
  const cf = q.data;
  if (!cf) return null;
  return (
    <Pressable onPress={() => router.push({ pathname: '/(tabs)/money', params: { sub: 'flow' } })} accessibilityRole="button" accessibilityLabel="Open cash flow">
      <Card>
        <Text variant="eyebrow" className="mb-1">Cash flow since payday</Text>
        <Text variant="small" className="mb-2">{eur0(cf.income)} came in · {eur0(cf.spent)} spent · {eur0(Number(cf.saved) + Number(cf.paidBack))} set aside</Text>
        <Sankey cf={cf} width={330} height={190} mini nodeWidth={8} merge={0.05} label={`Cash flow since payday: ${eur0(cf.income)} came in, ${eur0(cf.spent)} spent`} />
      </Card>
    </Pressable>
  );
}

export default function Today(): ReactNode {
  const { data: t, error, refetch } = useToday();
  const me = useMe();
  const first = me.data?.displayName.trim().split(/\s+/)[0] ?? null;
  const { on, toggle } = usePrivacy();
  const [maths, setMaths] = useState(false);

  const header = (
    <View className="flex-row gap-2">
      <Pressable onPress={() => router.push('/ask')} accessibilityRole="button" accessibilityLabel="Ask Finally" className="rounded-chip border border-rule bg-surface px-3.5 py-2">
        <Text variant="semi">Ask</Text>
      </Pressable>
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={on ? 'Show amounts' : 'Hide amounts'} className="rounded-chip border border-rule bg-surface px-3.5 py-2">
        <Text variant="semi">{on ? 'Show' : 'Hide'}</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" className="rounded-chip border border-rule bg-surface px-3.5 py-2">
        <Text variant="semi">⚙</Text>
      </Pressable>
    </View>
  );

  if (error) return <Screen eyebrow="Finally" title="Today" right={header}><ErrorCard error={error} retry={() => void refetch()} /></Screen>;
  if (!t) return <Screen eyebrow="Finally" title="Today" right={header}><LoadingCard height={170} /><LoadingCard height={120} /></Screen>;

  const delta = Number(t.safe.perDay) - Number(t.safeYesterday);
  const week = t.week;
  const rung = t.ladder.rungs[t.ladder.current]!;
  const s = t.safe;
  return (
    <Screen eyebrow={eyebrowFor(t.today, first)} title="Today" right={header}>
      {!t.setupDone ? (
        <MarkerChip onPress={() => Alert.alert('Set up', 'Finish setting up on the web app: payday, budgets, people and your first plan.')}>Finish setting up →</MarkerChip>
      ) : null}
      <Card>
        <Text variant="eyebrow" className="mb-2">Safe to spend today</Text>
        <Text variant="big">{eur(s.perDay)}</Text>
        <Text variant="small" className="mt-1.5">
          a day for the {t.daysToPayday} days to payday on {shortDate(t.nextPayday)}, set by your {s.binds === 'budget' ? 'budgets' : 'balance'}, the lower of the two.
        </Text>
        {Math.abs(delta) >= 0.01 ? <Text variant="small" className={delta < 0 ? 'mt-1 text-warn' : 'mt-1 text-good'}>{delta < 0 ? 'Down' : 'Up'} {eur(Math.abs(delta))} a day since you last looked</Text> : null}
        <View className="my-3"><Track value={(Number(week.spent) / Math.max(1, Number(week.weekBudget))) * 100} /></View>
        <Text variant="small">{Number(week.left) >= 0 ? `${eur(week.left)} left this week` : `${eur(Math.abs(Number(week.left)))} over this week`} · {week.daysLeft} days left</Text>
        <Pressable onPress={() => setMaths((v) => !v)} accessibilityRole="button" className="mt-3">
          <Text variant="semi" className="text-brand">{maths ? 'Hide the maths' : 'How this is worked out'}</Text>
        </Pressable>
        {maths ? (
          <View className="mt-2">
            <Line label="Flexible budgets" value={eur(s.flexBudget)} />
            <Line label="Spent so far" value={`−${eur(s.spentFlex)}`} />
            <Line label="Not sorted yet" value={`−${eur(s.unsorted)}`} />
            <Line label="Left in budgets" value={eur(s.budgetLeft)} strong />
            <Line label="In your accounts" value={eur(s.balance)} />
            <Line label="Bills before payday" value={`−${eur(s.billsDue)}`} />
            <Line label="Buffer" value={`−${eur(s.buffer)}`} />
            <Line label="Left from balance" value={eur(s.balanceLeft)} strong />
            <Text variant="small" className="mt-1">The lower, {eur(s.pool)}, over {s.daysLeft} days is {eur(s.perDay)} a day.</Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <Text variant="eyebrow" className="mb-2">Needs you</Text>
        {t.actions.length ? t.actions.slice(0, 3).map((a) => <Action key={a.id} a={a} />) : <Text variant="muted">Nothing needs you right now.</Text>}
        {t.actions.length > 3 ? <Text variant="small" className="mt-2">See all {t.actions.length} on the web app, or deal with these first.</Text> : null}
      </Card>

      <Card>
        <Text variant="eyebrow" className="mb-1">Since you last looked</Text>
        <Text variant="muted">
          {t.since.count ? `${t.since.count} payment${t.since.count === 1 ? '' : 's'} today, ${eur(t.since.out)} out.` : 'No new payments today.'}
          {t.pending.count ? ` ${t.pending.count} pending (${eur(t.pending.total)}), already counted.` : ''}
        </Text>
        {t.since.items.filter((x) => x.kind !== 'TRANSFER').slice(0, 5).map((x) => (
          <Line key={x.id} label={`${x.merchant?.displayName ?? x.rawDescriptor}${x.kind === 'SHARE' ? ' · rent share back' : x.status === 'PENDING' ? ' · pending' : ''}`} value={eur(x.amountEur, { signed: true })} />
        ))}
        {t.lastSyncAt ? <Text variant="small" className="mt-1">Synced at {clockTime(t.lastSyncAt)}.</Text> : null}
      </Card>

      <CashflowCard />

      {t.pins.length ? (
        <Card>
          <Text variant="eyebrow" className="mb-2">Pinned answers</Text>
          {t.pins.map((p) => (
            <Line key={p.id} label={p.short} value={maskText(p.big)} />
          ))}
        </Card>
      ) : null}

      <Card>
        <Text variant="eyebrow" className="mb-1">Next on your money ladder</Text>
        <Text variant="heading">{rung.title}</Text>
        <Text variant="small" className="mt-0.5">{rung.when}{rung.left && Number(rung.left) > 0 ? ` · ${eur0(rung.left)} to go` : ''}</Text>
      </Card>
      <Callout>Pull down to sync your banks.</Callout>
    </Screen>
  );
}
