import { useTransactions } from '@finally/api-client';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaymentRow } from '@/components/payments';
import { useRefreshSync } from '@/components/screen';
import { Text } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'sort', label: 'To sort' },
  { key: 'SPEND', label: 'Spending' },
  { key: 'INCOME', label: 'Income' },
] as const;

export default function Activity(): ReactNode {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const [q, setQ] = useState('');
  const { refreshing, onRefresh } = useRefreshSync();

  const query = useMemo(
    () => ({
      limit: 40,
      q: q.trim() || undefined,
      needsReview: filter === 'sort' ? ('true' as const) : undefined,
      kind: filter === 'SPEND' || filter === 'INCOME' ? filter : undefined,
    }),
    [filter, q],
  );
  const tx = useTransactions(query);
  const rows = useMemo(() => tx.data?.pages.flatMap((p) => p.items) ?? [], [tx.data]);

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top + 12 }}>
      <View className="px-[18px]">
        <Text variant="eyebrow">Every payment</Text>
        <Text variant="title" className="mb-3 mt-1">
          Activity
        </Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search merchant or bank text"
          placeholderTextColor="#8A9790"
          className="mb-3 rounded-control border-[1.5px] border-rule bg-transparent px-3 py-2.5 font-body text-[14px] text-ink"
          accessibilityLabel="Search payments"
          returnKeyType="search"
        />
        <View className="mb-2 flex-row gap-2">
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === f.key }}
              className={cn('rounded-chip border px-3 py-1.5', filter === f.key ? 'border-ink bg-ink' : 'border-rule bg-surface')}
            >
              <Text className={cn('font-body-semi text-[12.5px]', filter === f.key ? 'text-paper' : 'text-ink-2')}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (tx.hasNextPage && !tx.isFetchingNextPage) void tx.fetchNextPage();
        }}
        renderItem={({ item, index }) => (
          <PaymentRow tx={item} first={index === 0} onPress={() => router.push({ pathname: '/categorise', params: { transactionId: item.id } })} />
        )}
        ListEmptyComponent={
          tx.isLoading ? <ActivityIndicator className="mt-8" /> : <Text variant="muted" className="mt-8 text-center">No payments match.</Text>
        }
        ListFooterComponent={tx.isFetchingNextPage ? <ActivityIndicator className="my-4" /> : null}
      />
    </View>
  );
}
