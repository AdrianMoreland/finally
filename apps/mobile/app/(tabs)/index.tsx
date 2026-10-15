import { eur, eur0, longDate, maskText, shortDate, usePeople, useSnooze, useTaxMutations, useToday } from '@finally/api-client';
import type { ActionItemDto } from '@finally/contracts';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, Share, View } from 'react-native';
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
      const text = people.data?.owed.find((p) => p.id === cta.personId)?.remindText;
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

export default function Today(): ReactNode {
  const { data: t, error, refetch } = useToday();
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
    <Screen eyebrow={longDate(t.today)} title="Today" right={header}>
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
        {t.actions.length > 3 ? <Text variant="small" className="mt-2">{t.actions.length - 3} more, on the web app or after you deal with these.</Text> : null}
      </Card>

      <Card>
        <Text variant="eyebrow" className="mb-1">Since you last looked</Text>
        <Text variant="muted">
          {t.since.count ? `${t.since.count} payment${t.since.count === 1 ? '' : 's'} today, ${eur(t.since.out)} out.` : 'No new payments today.'}
          {t.pending.count ? ` ${t.pending.count} pending (${eur(t.pending.total)}), already counted.` : ''}
        </Text>
      </Card>

      {t.pins.length ? (
        <Card>
          <Text variant="eyebrow" className="mb-2">Pinned answers</Text>
          {t.pins.map((p) => (
            <Line key={p.id} label={p.short} value={maskText(p.big)} />
          ))}
        </Card>
      ) : null}

      <Card>
        <Text variant="eyebrow" className="mb-1">Your next rung</Text>
        <Text variant="heading">{rung.title}</Text>
        <Text variant="small" className="mt-0.5">{rung.when}{rung.left && Number(rung.left) > 0 ? ` · ${eur0(rung.left)} to go` : ''}</Text>
      </Card>
      <Callout>Pull down to sync your banks.</Callout>
    </Screen>
  );
}
