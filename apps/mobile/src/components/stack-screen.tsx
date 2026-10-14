import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Screen } from '@/components/screen';
import { Text } from '@/components/ui/primitives';

/** A pushed screen (Insights, Goals, ...) with a back link above the title. */
export function StackScreen({ eyebrow, title, children, right }: { eyebrow?: string; title: string; children: ReactNode; right?: ReactNode }): ReactNode {
  return (
    <Screen eyebrow={eyebrow} title={title} right={right} padBottom={48}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" className="-mt-1 self-start py-1">
        <Text variant="semi" className="text-brand">
          ‹ Back
        </Text>
      </Pressable>
      {children}
    </Screen>
  );
}
