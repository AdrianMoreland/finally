import { eur, shortDate } from '@finally/api-client';
import type { TransactionDto } from '@finally/contracts';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/primitives';
import { categoryHex } from '@/lib/category';
import { cn } from '@/lib/cn';
import { useTheme } from '@/lib/theme';

export function CategoryTag({ tx }: { tx: Pick<TransactionDto, 'category' | 'kind'> }): ReactNode {
  const { scheme } = useTheme();
  if (!tx.category) {
    return (
      <View className="self-end rounded-chip bg-marker px-[7px] py-[1px]">
        <Text className="font-body-semi text-[10px] text-marker-ink">To sort</Text>
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="size-[7px] rounded-full" style={{ backgroundColor: categoryHex(tx.category, scheme) }} />
      <Text className={cn('font-body text-[10.5px]', tx.kind === 'TRANSFER' ? 'text-ink-3' : 'text-ink-2')}>{tx.category.name}</Text>
    </View>
  );
}

export function PaymentRow({ tx, onPress, first }: { tx: TransactionDto; onPress?: () => void; first?: boolean }): ReactNode {
  const amount = Number(tx.amountEur);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className={cn('flex-row items-center justify-between gap-3 py-[9px]', !first && 'border-t border-rule')}
    >
      <View className="min-w-0 flex-1">
        <Text variant="semi" numberOfLines={1}>
          {tx.merchant?.displayName ?? tx.rawDescriptor}
        </Text>
        <Text variant="mono" numberOfLines={1} className="mt-0.5">
          {shortDate(tx.bookingDate)} · {tx.rawDescriptor}
        </Text>
      </View>
      <View className="items-end gap-[3px]">
        <Text variant="num" className={cn(amount > 0 && 'text-good')}>
          {eur(tx.amountEur, { signed: true })}
        </Text>
        <CategoryTag tx={tx} />
      </View>
    </Pressable>
  );
}
