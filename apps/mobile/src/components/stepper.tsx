import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/primitives';

/** A labelled amount with − and + buttons: how a real amount is set precisely on a phone. */
export function AmountStepper({
  label,
  sub,
  value,
  format,
  step,
  min = 0,
  max,
  onChange,
}: {
  label: string;
  sub?: string;
  value: number;
  format: (v: number) => string;
  step: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}): ReactNode {
  const set = (v: number): void => onChange(Math.min(max ?? Infinity, Math.max(min, Math.round(v * 100) / 100)));
  return (
    <View className="flex-row items-center justify-between gap-3 py-2">
      <View className="flex-1">
        <Text variant="semi">{label}</Text>
        {sub ? <Text variant="small">{sub}</Text> : null}
      </View>
      <Pressable onPress={() => set(value - step)} accessibilityRole="button" accessibilityLabel={`Less ${label}`} className="h-9 w-9 items-center justify-center rounded-full border border-rule bg-surface">
        <Text variant="semi">−</Text>
      </Pressable>
      <Text variant="num" className="min-w-[72px] text-center">{format(value)}</Text>
      <Pressable onPress={() => set(value + step)} accessibilityRole="button" accessibilityLabel={`More ${label}`} className="h-9 w-9 items-center justify-center rounded-full border border-rule bg-surface">
        <Text variant="semi">+</Text>
      </Pressable>
    </View>
  );
}

/** Segmented choice. */
export function Segment<T extends string>({ value, options, onChange }: { value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (v: T) => void }): ReactNode {
  return (
    <View className="flex-row gap-1 self-start rounded-chip border border-rule bg-surface p-0.5">
      {options.map(([v, l]) => (
        <Pressable key={v} onPress={() => onChange(v)} accessibilityRole="button" accessibilityState={{ selected: value === v }} className={value === v ? 'rounded-chip bg-ink px-3 py-1.5' : 'rounded-chip px-3 py-1.5'}>
          <Text variant="semi" className={value === v ? 'text-paper' : 'text-ink-2'}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}
