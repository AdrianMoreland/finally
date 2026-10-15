import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/icon';
import { Card, Text } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { usePalette } from '@/lib/theme';

/** A label and a value on one line. */
export function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'good' | 'warn' }): ReactNode {
  return (
    <View className="flex-row items-baseline justify-between gap-3 border-t border-rule py-2 first:border-t-0">
      <Text variant={strong ? 'semi' : 'muted'} className="flex-1">
        {label}
      </Text>
      <Text variant="num" className={cn(tone === 'good' && 'text-good', tone === 'warn' && 'text-warn')}>
        {value}
      </Text>
    </View>
  );
}

/** Rows that push another screen: how a section (Money, Plan, Grow) lists its pages. */
export function HubList({ items }: { items: Array<{ href: Href; label: string; note?: string; badge?: number }> }): ReactNode {
  const p = usePalette();
  return (
    <Card className="px-4 py-1">
      {items.map((it, i) => (
        <Pressable key={it.label} onPress={() => router.push(it.href)} accessibilityRole="button" className={cn('flex-row items-center gap-3 py-3.5', i > 0 && 'border-t border-rule')}>
          <View className="flex-1">
            <Text variant="semi">{it.label}</Text>
            {it.note ? <Text variant="small">{it.note}</Text> : null}
          </View>
          {it.badge ? (
            <View className="rounded-chip bg-marker px-2 py-0.5">
              <Text className="font-body-semi text-[11px] text-marker-ink">{it.badge}</Text>
            </View>
          ) : null}
          <Icon name="chevron" size={18} color={p.ink3} />
        </Pressable>
      ))}
    </Card>
  );
}

export function Callout({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'act' }): ReactNode {
  return (
    <View className={cn('rounded-control border border-rule bg-raised p-3', tone === 'act' && 'border-transparent bg-marker')}>
      <Text variant="muted" className={cn(tone === 'act' && 'text-marker-ink')}>
        {children}
      </Text>
    </View>
  );
}

/** Mobile paths for the web-style destinations that actions and answers point at. */
export function mobileHref(to: string): Href {
  const map: Record<string, Href> = {
    '/sort': '/categorise',
    '/money/sort': '/categorise',
    '/money/payments': '/(tabs)/activity',
    '/money/budgets': '/(tabs)/budgets',
    '/money/bills': '/bills',
    '/money/month': '/month',
    '/money/review': '/review',
    '/plan/payday': '/payday',
    '/plan/pots': '/pots',
    '/plan/people': '/people',
    '/plan/tax': '/tax',
    '/plan/bonus': '/bonus',
    '/grow/investing': '/investing',
    '/grow/freedom': '/freedom',
    '/': '/(tabs)',
  };
  return map[to] ?? '/(tabs)';
}
