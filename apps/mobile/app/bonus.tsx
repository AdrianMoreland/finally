import { eur, eur0, useBonus, useUpdateBonus } from '@finally/api-client';
import type { ReactNode } from 'react';
import { Line } from '@/components/kit';
import { ErrorCard, LoadingCard } from '@/components/screen';
import { StackScreen } from '@/components/stack-screen';
import { AmountStepper } from '@/components/stepper';
import { Card, Text } from '@/components/ui/primitives';

export default function Bonus(): ReactNode {
  const { data: b, error, refetch } = useBonus();
  const update = useUpdateBonus();
  if (error) return <StackScreen title="Bonus"><ErrorCard error={error} retry={() => void refetch()} /></StackScreen>;
  if (!b) return <StackScreen title="Bonus"><LoadingCard height={260} /></StackScreen>;
  const i = b.inputs;
  return (
    <StackScreen eyebrow="December, after tax" title="Bonus">
      <Card>
        <AmountStepper label="Bonus at 100%" value={i.target} step={500} format={eur0} onChange={(v) => update.mutate({ target: v })} />
        <AmountStepper label="How much you expect" value={i.pct} step={25} max={100} format={(v) => `${v}%`} onChange={(v) => update.mutate({ pct: v })} />
        <AmountStepper label="Into a pension" sub={`Relief up to ${eur0(b.cap)}`} value={i.pension} step={250} format={eur0} onChange={(v) => update.mutate({ pension: v })} />
      </Card>
      <Card>
        <Text variant="eyebrow" className="mb-1">What reaches you</Text>
        <Text variant="big">{eur(b.netWithPension)}</Text>
        <Line label="Bonus before tax" value={eur(b.gross)} />
        <Line label="Income tax" value={`−${eur(b.taxWith)}`} />
        <Line label="USC" value={`−${eur(b.usc)}`} />
        <Line label="PRSI" value={`−${eur(b.prsi)}`} />
        {Number(b.pension) > 0 ? <Line label="Into your pension" value={`−${eur(b.pension)}`} /> : null}
        {b.scenarios.map((s) => <Line key={s.pct} label={s.pct === 0 ? 'No bonus' : `${s.pct}% of target`} value={eur0(s.net)} />)}
        <Text variant="small" className="mt-1">Still to place: {eur(b.unallocated)}. Estimates, not tax advice.</Text>
      </Card>
    </StackScreen>
  );
}
