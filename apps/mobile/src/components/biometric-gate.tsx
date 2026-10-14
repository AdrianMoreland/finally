import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { Button, Text } from '@/components/ui/primitives';
import { isBiometricEnabled, unlock } from '@/lib/biometric';

const RELOCK_AFTER_MS = 30_000;

/**
 * Asks for Face ID / fingerprint when the app opens (and when it comes back after 30 seconds away), if the
 * user turned the lock on in Settings. Content stays mounted underneath so state is not lost.
 */
export function BiometricGate({ enabled, children }: { enabled: boolean; children: ReactNode }): ReactNode {
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const leftAt = useRef<number | null>(null);

  const attempt = async (): Promise<void> => {
    setChecking(true);
    try {
      if (await unlock()) setLocked(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      return;
    }
    void isBiometricEnabled().then((on) => {
      if (on) {
        setLocked(true);
        void attempt();
      }
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        leftAt.current ??= Date.now();
        return;
      }
      const away = leftAt.current ? Date.now() - leftAt.current : 0;
      leftAt.current = null;
      if (away > RELOCK_AFTER_MS) {
        void isBiometricEnabled().then((on) => {
          if (on) {
            setLocked(true);
            void attempt();
          }
        });
      }
    });
    return () => sub.remove();
  }, [enabled]);

  return (
    <>
      {children}
      {locked ? (
        <View className="absolute inset-0 items-center justify-center gap-4 bg-brand px-8" accessibilityViewIsModal>
          <Text variant="title" className="text-brand-ink">
            Finally
          </Text>
          <Text variant="muted" className="text-center text-brand-ink opacity-80">
            Locked
          </Text>
          <Button variant="outline" loading={checking} onPress={() => void attempt()}>
            Unlock
          </Button>
        </View>
      ) : null}
    </>
  );
}
