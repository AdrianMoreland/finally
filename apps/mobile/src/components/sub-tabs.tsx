import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

export interface SubTab {
  key: string;
  label: string;
  /** Opens another screen instead of switching in place. */
  href?: Href;
  badge?: number;
}

/** The chips under a large title (Money, Plan, Grow): switch in place, or open the screen behind the chip. */
export function SubTabs({ tabs, active, onSelect }: { tabs: SubTab[]; active: string; onSelect?: (key: string) => void }): ReactNode {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-[18px] mb-3" contentContainerStyle={{ paddingHorizontal: 18, gap: 8 }}>
      {tabs.map((t) => (
        <Pressable
          key={t.key}
          onPress={() => (t.href ? router.push(t.href) : onSelect?.(t.key))}
          accessibilityRole="button"
          accessibilityState={{ selected: active === t.key }}
          className={cn('flex-row items-center gap-1.5 rounded-chip border px-3.5 py-1.5', active === t.key ? 'border-fill bg-fill' : 'border-rule bg-surface')}
        >
          <Text className={cn('font-body-semi text-[13px]', active === t.key ? 'text-on-fill' : 'text-ink-2')}>{t.label}</Text>
          {t.badge ? (
            <View className="rounded-chip bg-marker px-1.5 py-px">
              <Text className="font-body-bold text-[10.5px] text-marker-ink">{t.badge}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}
