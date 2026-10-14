import * as Linking from 'expo-linking';
import { Redirect, router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Text } from '@/components/ui/primitives';
import { useAuth } from '@/lib/auth';

/** Magic-link landing route: finally://auth/callback?code=... */
export default function AuthCallback(): ReactNode {
  const auth = useAuth();
  const url = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!url || done) return;
    setDone(true);
    void auth.completeFromUrl(url).then((r) => setError(r.error));
  }, [url, done, auth]);

  if (auth.session) return <Redirect href="/" />;
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-paper px-8">
      {error ? (
        <>
          <Text variant="heading">Link problem</Text>
          <Text variant="muted" className="text-center">
            {error}
          </Text>
          <Button onPress={() => router.replace('/login')} variant="outline">
            Back to sign in
          </Button>
        </>
      ) : (
        <Text variant="muted">Signing you in…</Text>
      )}
    </View>
  );
}
