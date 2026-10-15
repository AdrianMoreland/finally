import { eur0, useFreedom, useTax, useTaxMutations, useUpdateFreedom } from '@finally/api-client';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LineArea } from '@/components/charts/charts';
import { Line } from '@/components/kit';
import { ErrorCard, LoadingCard } from '@/components/screen';
import { StackScreen } from '@/components/stack-screen';
import { AmountStepper, Segment } from '@/components/stepper';
import { Card, Text } from '@/components/ui/primitives';

export default function Freedom(): ReactNode {
  const { data: f, error, refetch } = useFreedom();
  const update = useUpdateFreedom();
  const tax = useTax();
  const taxM = useTaxMutations();
  if (error) return <StackScreen title="Freedom"><ErrorCard error={error} retry={() => void refetch()} /></StackScreen>;
  if (!f) return <StackScreen title="Freedom"><LoadingCard height={260} /></StackScreen>;
  const i = f.inputs;
  const set = (patch: Record<string, unknown>): void => update.mutate(patch);
  return (
    <StackScreen eyebrow="Comfortable, not rich for its own sake" title="Freedom">
      <Card>
        <Text variant="eyebrow" className="mb-1">Your "enough" number</Text>
        <Text variant="big">{eur0(f.target)}</Text>
        <Text variant="small">{f.hitAge != null ? `The middle path gets there around age ${f.hitAge}.` : 'The middle path does not get there by 66 at this monthly amount.'} {Math.round(f.probBy55 * 100)}% of simulated runs get there by 55.</Text>
        <LineArea values={f.p50} height={110} />
      </Card>
      <Card>
        <AmountStepper label="Comfortable yearly spending" value={i.spend} step={1000} min={15000} max={60000} format={eur0} onChange={(v) => set({ spend: v })} />
        <AmountStepper label="Invested each month" value={i.monthly} step={50} format={eur0} onChange={(v) => set({ monthly: v })} />
        <AmountStepper label="Yearly return" value={i.returnPct} step={0.5} min={2} max={9} format={(v) => `${v.toFixed(1)}%`} onChange={(v) => set({ returnPct: v })} />
        <AmountStepper label="Your age" value={i.age} step={1} min={18} max={60} format={(v) => String(v)} onChange={(v) => set({ age: v })} />
        <AmountStepper label="Withdrawal rate" value={i.withdrawalPct} step={0.25} min={3} max={5} format={(v) => `${v.toFixed(2)}%`} onChange={(v) => set({ withdrawalPct: v })} />
      </Card>
      <Card>
        <Text variant="eyebrow" className="mb-1">Protection check</Text>
        {(tax.data?.items.filter((x) => x.group === 'protection') ?? []).map((p) => (
          <View key={p.id} className="gap-1.5 border-t border-rule py-2.5 first:border-t-0">
            <Text variant="semi">{p.label}</Text>
            <Segment value={p.state} options={[['TODO', 'Not done'], ['DONE', 'Done'], ['NA', 'N/A']] as const} onChange={(state) => taxM.setCheck.mutate({ itemId: p.id, state })} />
          </View>
        ))}
        <Line label="On your ladder" value={f.ladder.rungs.at(-1)!.when} />
      </Card>
    </StackScreen>
  );
}
