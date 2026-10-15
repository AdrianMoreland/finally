import { eur, eur0, monthLabel, shortDate, useAnswer, useMonthClose, useMonthCloseMutations, useWeekReview, useWeekReviewMutations } from '@finally/api-client';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Line } from '@/components/kit';
import { ErrorCard, LoadingCard } from '@/components/screen';
import { StackScreen } from '@/components/stack-screen';
import { Segment } from '@/components/stepper';
import { Button, Card, Text } from '@/components/ui/primitives';

const STEPS = ['Sort', 'Budget', 'Know', 'Decide'];

function Week(): ReactNode {
  const { data: r, error, refetch } = useWeekReview();
  const { complete, reopen } = useWeekReviewMutations();
  const answer = useAnswer();
  const [step, setStep] = useState(0);
  if (error) return <ErrorCard error={error} retry={() => void refetch()} />;
  if (!r) return <LoadingCard height={220} />;
  if (r.done) {
    return (
      <Card>
        <Text variant="heading">Review done</Text>
        <Text variant="muted" className="mt-1">{r.streak} week{r.streak === 1 ? '' : 's'} in a row.{r.decision ? ` You chose: ${r.decision}.` : ''}</Text>
        <Text variant="small" className="mt-2">Next review: Sunday {shortDate(r.nextReview)}.</Text>
        <Button className="mt-3" variant="outline" onPress={() => reopen.mutate()}>Run it again</Button>
      </Card>
    );
  }
  const first = r.toSort.first;
  const w = r.budget.worst;
  return (
    <Card className="gap-3">
      <Text variant="eyebrow">Step {step + 1} of 4 · {STEPS[step]}</Text>
      {step === 0 ? (
        first ? (
          <View className="gap-2">
            <Text variant="muted">{r.toSort.count} merchant{r.toSort.count > 1 ? 's' : ''} left. The first:</Text>
            <Text variant="semi">{first.name} · {eur(first.amount)}</Text>
            {first.suggestion ? <Button disabled={answer.isPending} onPress={() => answer.mutate({ requestId: first.requestId, categoryId: first.suggestion!.id, scope: 'merchant' })}>{`${first.suggestion.name}, every time`}</Button> : null}
          </View>
        ) : <Text variant="muted">Everything is sorted.</Text>
      ) : null}
      {step === 1 ? (w ? (
        <View>
          <Text variant="muted">{w.name} is furthest from its usual pace.</Text>
          <Line label="Spent this month" value={`${eur(w.spent)} of ${eur0(w.budget)}`} />
          <Line label="Usual pace ends at" value={eur0(w.projected)} />
          <Line label="This week so far" value={eur(w.thisWeek)} />
        </View>
      ) : <Text variant="muted">No spending yet this month.</Text>) : null}
      {step === 2 ? (r.know ? <View><Text variant="semi">{r.know.title}</Text><Text variant="small">{r.know.body}</Text></View> : <Text variant="muted">Nothing new this week.</Text>) : null}
      {step === 3 ? (
        <View className="gap-2">
          <Text variant="muted">Pick one thing for the week ahead.</Text>
          {r.decisions.map((d) => <Button key={d.value} variant="outline" disabled={complete.isPending} onPress={() => complete.mutate(d.value)}>{d.label}</Button>)}
        </View>
      ) : null}
      <View className="flex-row justify-between">
        <Button variant="ghost" disabled={step === 0} onPress={() => setStep((s) => s - 1)}>Back</Button>
        {step < 3 ? <Button onPress={() => setStep((s) => s + 1)}>Next</Button> : null}
      </View>
      <Text variant="small">{r.streak} weeks in a row</Text>
    </Card>
  );
}

function MonthClose(): ReactNode {
  const { data: c, error, refetch } = useMonthClose();
  const { choose, reopen } = useMonthCloseMutations();
  if (error) return <ErrorCard error={error} retry={() => void refetch()} />;
  if (!c) return <LoadingCard height={220} />;
  return (
    <View className="gap-3">
      <Card>
        <Text variant="eyebrow" className="mb-1">{monthLabel(c.month)} in one look</Text>
        <Line label="Came in" value={eur(c.cameIn, { signed: true })} tone="good" />
        <Line label="Spent" value={`−${eur(c.spent)}`} />
        <Line label="Paid back" value={`−${eur(c.paidBack)}`} />
        <Line label="Kept" value={`${eur(c.kept)} · ${Math.round(c.keptPct)}%`} strong />
      </Card>
      <Card>
        <Text variant="eyebrow" className="mb-1">Against the plan</Text>
        {c.rows.map((x) => <Line key={x.category.id} label={`${x.category.name}: ${eur0(x.spent)} of ${eur0(x.planned)}`} value={Math.abs(Number(x.difference)) < 0.5 ? '—' : `${Number(x.difference) > 0 ? '+' : '−'}${eur0(Math.abs(Number(x.difference)))}`} tone={Number(x.difference) > 0.5 ? 'warn' : 'good'} />)}
      </Card>
      <Card className="gap-2">
        <Text variant="eyebrow">One change for {c.nextMonthName}</Text>
        {c.choice ? (
          <><Text variant="muted">{c.choice}.</Text><Button variant="ghost" onPress={() => reopen.mutate()}>Pick again</Button></>
        ) : c.options.map((o) => <Button key={o.value} variant="outline" onPress={() => choose.mutate({ value: o.value, label: o.label })}>{o.label}</Button>)}
      </Card>
    </View>
  );
}

export default function Review(): ReactNode {
  const [tab, setTab] = useState<'week' | 'month'>('week');
  return (
    <StackScreen eyebrow={tab === 'week' ? 'Sunday · about 5 minutes' : 'The day before payday'} title="Review">
      <Segment value={tab} onChange={setTab} options={[['week', 'Weekly review'], ['month', 'Month close']]} />
      {tab === 'week' ? <Week /> : <MonthClose />}
    </StackScreen>
  );
}
