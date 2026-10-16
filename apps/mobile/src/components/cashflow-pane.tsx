import { eur0, shortDate, useCashflow } from '@finally/api-client';
import type { CashflowPeriod } from '@finally/contracts';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Sankey } from '@/components/charts/sankey';
import { ErrorCard, LoadingCard } from '@/components/screen';
import { Card, Text } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { useColourOf } from '@/lib/theme';

const PERIODS: Array<[CashflowPeriod, string]> = [
  ['sincepay', 'Since payday'],
  ['lastmonth', 'Last month'],
  ['ytd', 'This year'],
];

/** Phone Cash flow: where the money came from and went, over a period you pick. */
export function CashflowPane(): ReactNode {
  const [period, setPeriod] = useState<CashflowPeriod>('sincepay');
  const q = useCashflow(period, false);
  const colourOf = useColourOf();
  const cf = q.data;
  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        {PERIODS.map(([k, label]) => (
          <Pressable key={k} onPress={() => setPeriod(k)} accessibilityRole="button" accessibilityState={{ selected: period === k }} className={cn('rounded-chip border px-3 py-1.5', period === k ? 'border-ink bg-ink' : 'border-rule bg-surface')}>
            <Text className={cn('font-body-semi text-[12.5px]', period === k ? 'text-paper' : 'text-ink-2')}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {q.error ? <ErrorCard error={q.error} retry={() => void q.refetch()} /> : !cf ? <LoadingCard height={360} /> : (
        <>
          <Card>
            <Text variant="small">{shortDate(cf.from)} – {shortDate(cf.to)}</Text>
            <View className="mt-2 flex-row justify-between">
              <View>
                <Text variant="small">Came in</Text>
                <Text variant="heading" className="text-good">{eur0(cf.income)}</Text>
              </View>
              <View>
                <Text variant="small">Spent</Text>
                <Text variant="heading">{eur0(cf.spent)}</Text>
              </View>
              <View>
                <Text variant="small">Set aside</Text>
                <Text variant="heading">{eur0(Number(cf.saved) + Number(cf.paidBack))}</Text>
              </View>
            </View>
            <View className="mt-3">
              <Sankey cf={cf} width={330} height={300} mini nodeWidth={8} merge={0.05} label={`Cash flow: ${eur0(cf.income)} came in, ${eur0(cf.spent)} spent, ${eur0(cf.saved)} set aside`} />
            </View>
          </Card>
          <Card className="px-4 py-1">
            {cf.groups.filter((g) => !g.pass).map((g, i) => (
              <View key={g.id} className={cn('flex-row items-center gap-3 py-3', i > 0 && 'border-t border-rule')}>
                <View className="size-2.5 rounded-[2px]" style={{ backgroundColor: colourOf(g.colour) }} />
                <View className="flex-1">
                  <Text variant="semi">{g.name}</Text>
                  <Text variant="small">{g.cats.length ? g.cats.slice(0, 3).map((c) => c.name).join(', ') : 'Still in your accounts'}</Text>
                </View>
                <Text variant="num">{eur0(g.v)}</Text>
              </View>
            ))}
          </Card>
          {cf.rent ? (
            <Text variant="small" className="px-1">
              Rent counts as your share, {eur0(cf.rent.own)}.{Number(cf.back) > 0 ? ` The ${eur0(cf.back)} the people you live with sent back in this period repays what you fronted, so it isn't income.` : ''}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
