import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { Button, Card, Text } from '@/components/ui/primitives';
import { useAuth } from '@/lib/auth';

export default function Login(): ReactNode {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const value = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      setError('Enter a valid email address');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await auth.sendMagicLink(value);
    setBusy(false);
    if (res.error) setError(res.error);
    else setSentTo(value);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-center bg-paper px-6">
      <View className="mb-6">
        <Text variant="title">Finally</Text>
        <Text variant="muted" className="mt-1">
          Your money, in one calm place.
        </Text>
      </View>
      {sentTo ? (
        <Card className="gap-2">
          <Text variant="heading">Check your email</Text>
          <Text variant="muted">
            We sent a sign-in link to {sentTo}. Open it on this phone to continue.
          </Text>
          <Text variant="semi" className="mt-1 text-brand" onPress={() => setSentTo(null)}>
            Use a different email
          </Text>
        </Card>
      ) : (
        <Card className="gap-3">
          <Text variant="semi">Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            className="rounded-control border border-rule bg-surface px-3 py-3 font-body text-[15px] text-ink"
            placeholderTextColor="#8A9790"
            accessibilityLabel="Email"
            onSubmitEditing={() => void submit()}
          />
          {error ? (
            <Text variant="small" className="text-bad">
              {error}
            </Text>
          ) : null}
          <Button loading={busy} onPress={() => void submit()}>
            Email me a sign-in link
          </Button>
          <Text variant="small">Only approved email addresses can use this app.</Text>
        </Card>
      )}
    </KeyboardAvoidingView>
  );
}
