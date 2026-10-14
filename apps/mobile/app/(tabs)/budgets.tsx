import { eur, eur0, monthLabel, shiftMonth, useBudgets } from '@finally/api-client';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ErrorCard, LoadingCard, Screen } from '@/components/screen';
import { Card, Text, Track } from '@/components/ui/primitives';
import { categoryHex } from '@/lib/category';
import { useTheme } from '@/lib/theme';

export default function Budgets(): ReactNode {
  const { scheme } = useTheme();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const { data, error, refetch } = useBudgets(month);
  const current = data?.month ?? month;

  const step = (n: number): void => {
    if (current) setMonth(shiftMonth(current, n));
  };

  return (
    <Screen
      eyebrow={data ? `${monthLabel(data.month)}${data.dayOfMonth > 0 && data.dayOfMonth < data.daysInMonth ? ` · day ${data.dayOfMonth} of ${data.daysInMonth}` : ''}` : 'Budgets'}
      title="Budgets"
    >
      <View className="flex-row items-center justify-between">
        <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel="Previous month" className="rounded-chip border border-rule bg-surface px-3.5 py-2">
          <Text variant="semi">‹</Text>
        </Pressable>
        <Text variant="semi">{current ? monthLabel(current) : '…'}</Text>
        <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel="Next month" className="rounded-chip border border-rule bg-surface px-3.5 py-2">
          <Text variant="semi">›</Text>
        </Pressable>
      </View>

      {error ? <ErrorCard error={error} retry={() => void refetch()} /> : null}
      {!data && !error ? <LoadingCard height={260} /> : null}
      {data ? (
        <Card className="gap-4">
          {data.rows.map((r) => {
            const amount = Number(r.amount);
            const spent = Number(r.spent);
            const fill = amount > 0 ? Math.min((spent / amount) * 100, 100) : spent > 0 ? 100 : 0;
            const tick = r.fixed || amount <= 0 || data.dayOfMonth === 0 ? null : (Number(r.expectedByToday) / amount) * 100;
            const projected = Number(r.projected);
            const over = !r.fixed && projected > amount;
            return (
              <View key={r.categoryId} className="gap-1.5">
                <View className="flex-row justify-between">
                  <Text variant="semi">{r.category.name}</Text>
                  <Text variant="small" className="text-ink">
                    {eur(r.spent)} <Text variant="small" className="text-ink-3">/ {eur0(r.amount)}</Text>
                  </Text>
                </View>
                <Track value={fill} tick={tick} color={categoryHex(r.category, scheme)} />
                {over ? (
                  <Text className="font-body-semi text-[10.5px] text-warn">On pace for {eur0(projected)}</Text>
                ) : r.fixed && spent < amount ? (
                  <Text variant="small">{eur(amount - spent)} still to come</Text>
                ) : null}
              </View>
            );
          })}
          <Text variant="small">Total {eur(data.totalSpent)} of {eur(data.totalBudget)}. The black tick marks an even pace for today.</Text>
        </Card>
      ) : null}
    </Screen>
  );
}
