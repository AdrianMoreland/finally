import { useInsights, useQueue } from '@finally/api-client';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Icon, type IconName } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Card, Text } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { usePalette } from '@/lib/theme';

const ITEMS: Array<{ href: Href; label: string; icon: IconName; note?: string }> = [
  { href: '/insights', label: 'Insights', icon: 'insights' },
  { href: '/goals', label: 'Goals', icon: 'goals' },
  { href: '/tools', label: 'Tools', icon: 'tools' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

export default function More(): ReactNode {
  const p = usePalette();
  const insights = useInsights();
  const queue = useQueue();
  const unseen = insights.data?.unseen ?? 0;
  return (
    <Screen eyebrow="Finally" title="More">
      {(queue.data?.count ?? 0) > 0 ? (
        <Pressable onPress={() => router.push('/categorise')} className="rounded-card bg-marker p-4" accessibilityRole="button">
          <Text variant="semi" className="text-marker-ink">
            {queue.data?.count} merchants need a category →
          </Text>
        </Pressable>
      ) : null}
      <Card className="px-4 py-1">
        {ITEMS.map((it, i) => (
          <Pressable
            key={it.label}
            onPress={() => router.push(it.href)}
            accessibilityRole="button"
            className={cn('flex-row items-center gap-3 py-3.5', i > 0 && 'border-t border-rule')}
          >
            <Icon name={it.icon} color={p.ink2} />
            <Text variant="semi" className="flex-1">
              {it.label}
            </Text>
            {it.label === 'Insights' && unseen > 0 ? (
              <View className="rounded-chip bg-brand-soft px-2 py-0.5">
                <Text className="font-body-semi text-[11px] text-brand">{unseen} new</Text>
              </View>
            ) : null}
            <Icon name="chevron" size={18} color={p.ink3} />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
