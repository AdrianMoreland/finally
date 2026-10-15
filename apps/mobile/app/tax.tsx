import { eur, eur0, useTax, useTaxMutations } from '@finally/api-client';
import type { CheckState } from '@finally/contracts';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Callout, Line } from '@/components/kit';
import { ErrorCard, LoadingCard } from '@/components/screen';
import { StackScreen } from '@/components/stack-screen';
import { AmountStepper, Segment } from '@/components/stepper';
import { Card, Text } from '@/components/ui/primitives';

const STATES = [['TODO', 'Not done'], ['DONE', 'Done'], ['NA', 'N/A']] as const;

export default function Tax(): ReactNode {
  const [slip, setSlip] = useState<string | undefined>();
  const { data: t, error, refetch } = useTax(slip);
  const m = useTaxMutations();
  if (error) return <StackScreen title="Tax & pay"><ErrorCard error={error} retry={() => void refetch()} /></StackScreen>;
  if (!t) return <StackScreen title="Tax & pay"><LoadingCard height={260} /></StackScreen>;
  const group = (g: string, title: string): ReactNode => (
    <Card>
      <Text variant="eyebrow" className="mb-1">{title}</Text>
      {t.items.filter((i) => i.group === g).map((i) => (
        <View key={i.id} className="gap-1.5 border-t border-rule py-2.5 first:border-t-0">
          <Text variant="semi">{i.label}</Text>
          <Text variant="small">{i.hint}</Text>
          <Segment value={i.state as CheckState} options={STATES} onChange={(state) => m.setCheck.mutate({ itemId: i.id, state })} />
        </View>
      ))}
    </Card>
  );
  const ps = t.payslip;
  return (
    <StackScreen eyebrow={Number(t.unclaimed) ? `${eur0(t.unclaimed)} possibly unclaimed` : 'All handled'} title="Tax & pay">
      {group('credits', 'Tax credits')}
      {group('perks', 'Ask HR about')}
      <Card>
        <Text variant="eyebrow" className="mb-1">Pay check</Text>
        {t.payslips.length ? (
          <View className="mb-2 flex-row flex-wrap gap-2">
            {t.payslips.slice(0, 4).map((p) => (
              <Text key={p.date} onPress={() => setSlip(p.date)} variant="semi" className={ps?.date === p.date ? 'text-brand' : 'text-ink-3'}>{p.label.split(' ')[0]}</Text>
            ))}
          </View>
        ) : null}
        {ps ? (
          <>
            <Line label="Landed in your bank" value={eur(ps.net)} />
            <Line label={`Expected on ${eur0(t.inputs.gross)}`} value={eur(ps.expected.net)} />
            <Callout tone={ps.verdict.needsAttention ? 'act' : 'info'}>{`${ps.verdict.headline} ${ps.verdict.body}`}</Callout>
          </>
        ) : <Text variant="muted">No salary payments found yet.</Text>}
      </Card>
      <Card>
        <Text variant="eyebrow" className="mb-1">Take-home</Text>
        <AmountStepper label="Salary" value={t.inputs.gross} step={500} format={eur0} onChange={(v) => m.update.mutate({ gross: v })} />
        <Line label="Income tax" value={`−${eur(t.takeHome.tax)}`} />
        <Line label="USC" value={`−${eur(t.takeHome.usc)}`} />
        <Line label="PRSI" value={`−${eur(t.takeHome.prsi)}`} />
        <Line label="Take-home" value={`${eur(t.takeHome.monthly)} a month`} strong />
        <AmountStepper label="A raise of" value={t.inputs.raise} step={500} format={eur0} onChange={(v) => m.update.mutate({ raise: v })} />
        <Line label="Extra each month" value={eur(t.takeHomeRaise.extraMonthly)} strong />
      </Card>
      <Card>
        <Text variant="eyebrow" className="mb-1">Rules Finally uses · {t.rules.version}</Text>
        {t.rules.rows.map((r) => <Line key={r.id} label={`${r.label} (${r.from}, ${r.source})`} value="" />)}
        <Text variant="small" className="mt-1">Estimates for a single PAYE employee. Not tax advice.</Text>
      </Card>
    </StackScreen>
  );
}
