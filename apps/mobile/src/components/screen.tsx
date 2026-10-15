import { useSyncAll } from '@finally/api-client';
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

/** Pull-to-refresh that syncs every linked bank, then refreshes the screen's data. */
export function useRefreshSync(): { refreshing: boolean; onRefresh: () => void } {
  const sync = useSyncAll();
  return { refreshing: sync.isPending, onRefresh: () => sync.mutate() };
}

export function Screen({
  eyebrow,
  title,
  right,
  children,
  refreshable = true,
  padBottom = 96,
  contentClassName,
  ...scroll
}: ScrollViewProps & {
  eyebrow?: string;
  title?: string;
  right?: ReactNode;
  refreshable?: boolean;
  padBottom?: number;
  contentClassName?: string;
}): ReactNode {
  const insets = useSafeAreaInsets();
  const { refreshing, onRefresh } = useRefreshSync();
  return (
    <ScrollView
      className="flex-1 bg-paper"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: padBottom, paddingHorizontal: 18 }}
      refreshControl={refreshable ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
      keyboardShouldPersistTaps="handled"
      {...scroll}
    >
      {title ? (
        <View className="mb-4 flex-row items-end justify-between">
          <View>
            {eyebrow ? <Text variant="eyebrow">{eyebrow}</Text> : null}
            <Text variant="title" className="mt-1">
              {title}
            </Text>
          </View>
          {right}
        </View>
      ) : null}
      <View className={cn('gap-3', contentClassName)}>{children}</View>
    </ScrollView>
  );
}

export function LoadingCard({ height = 120 }: { height?: number }): ReactNode {
  return <View className="rounded-card bg-raised" style={{ height }} accessibilityLabel="Loading" />;
}

export function ErrorCard({ error, retry }: { error: unknown; retry?: () => void }): ReactNode {
  return (
    <View className="rounded-card bg-surface p-4">
      <Text variant="semi" className="text-bad">
        Something went wrong
      </Text>
      <Text variant="muted" className="mt-1">
        {error instanceof Error ? error.message : 'Unexpected error.'}
      </Text>
      {retry ? (
        <Text variant="semi" className="mt-2 text-brand" onPress={retry}>
          Try again
        </Text>
      ) : null}
    </View>
  );
}
