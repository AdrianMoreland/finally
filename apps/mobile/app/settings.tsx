import {
  clockTime,
  shortDate,
  useApi,
  useCategories,
  useConnections,
  useMe,
  useStartConnection,
  useSyncConnection,
  useUpdateMe,
} from '@finally/api-client';
import type { ConnectionDto } from '@finally/contracts';
import { useMutation } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Switch, TextInput, View } from 'react-native';
import { StackScreen } from '@/components/stack-screen';
import { Button, Card, Text } from '@/components/ui/primitives';
import { useAuth } from '@/lib/auth';
import { biometricAvailable, isBiometricEnabled, setBiometricEnabled, unlock } from '@/lib/biometric';
import { cn } from '@/lib/cn';
import { registerAskCategories, registerForPush, sendLocalTestNotification } from '@/lib/notifications';
import { useTheme, type ThemeMode } from '@/lib/theme';

const STATUS: Record<ConnectionDto['status'], string> = {
  ACTIVE: 'Connected',
  EXPIRING: 'Consent expires soon',
  EXPIRED: 'Not linked / expired',
  ERROR: 'Last sync failed',
};

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <Card className="gap-3">
      <Text variant="eyebrow">{title}</Text>
      {children}
    </Card>
  );
}

function Connection({ c }: { c: ConnectionDto }): ReactNode {
  const sync = useSyncConnection();
  const start = useStartConnection();
  const linked = c.status === 'ACTIVE' || c.status === 'EXPIRING' || c.lastSyncAt !== null;

  const link = (): void =>
    start.mutate(
      { institution: c.institution, returnTo: 'mobile' },
      {
        onSuccess: (r) => {
          // The bank redirects to finally://banking/done, which closes the in-app browser.
          void WebBrowser.openAuthSessionAsync(r.url, 'finally://banking/done');
        },
        onError: (e) => Alert.alert('Could not start linking', e instanceof Error ? e.message : ''),
      },
    );

  return (
    <View className="gap-2 border-t border-rule pt-3 first:border-t-0 first:pt-0">
      <View className="flex-row items-center justify-between">
        <Text variant="semi">{c.institution === 'AIB' ? 'AIB' : 'Revolut'}</Text>
        <Text variant="small" className={cn(c.status !== 'ACTIVE' && 'text-warn')}>
          {STATUS[c.status]}
        </Text>
      </View>
      <Text variant="small">
        {c.accountCount} account{c.accountCount === 1 ? '' : 's'}
        {c.validUntil ? ` · consent until ${shortDate(c.validUntil)} ${c.validUntil.slice(0, 4)}` : ''}
        {c.lastSyncAt ? ` · synced ${clockTime(c.lastSyncAt)}` : ''}
        {c.provider === 'MOCK' ? ' · sample data' : ''}
      </Text>
      <View className="flex-row gap-2">
        {linked ? (
          <Button size="sm" variant="outline" loading={sync.isPending} onPress={() => sync.mutate(c.id)}>
            Sync now
          </Button>
        ) : null}
        <Button size="sm" variant={linked ? 'outline' : 'primary'} loading={start.isPending} onPress={link}>
          {linked ? 'Re-link' : 'Link'}
        </Button>
      </View>
    </View>
  );
}

export default function Settings(): ReactNode {
  const api = useApi();
  const auth = useAuth();
  const theme = useTheme();
  const me = useMe();
  const update = useUpdateMe();
  const conns = useConnections();
  const categories = useCategories();
  const [bio, setBio] = useState(false);
  const [bioOk, setBioOk] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [quiet, setQuiet] = useState<{ start: string; end: string } | null>(null);

  useEffect(() => {
    void isBiometricEnabled().then(setBio);
    void biometricAvailable().then(setBioOk);
  }, []);
  useEffect(() => {
    if (me.data) setQuiet({ start: me.data.quietHoursStart, end: me.data.quietHoursEnd });
  }, [me.data]);

  const toggleBio = async (on: boolean): Promise<void> => {
    if (on && !(await unlock())) return;
    await setBiometricEnabled(on);
    setBio(on);
  };

  const test = useMutation({
    mutationFn: async () => {
      const res = await api.testNotification();
      // Show it on this phone too, with the three buttons, so it works without a push server.
      if (categories.data) await registerAskCategories(categories.data);
      await sendLocalTestNotification(res.sample);
      return res;
    },
    onSuccess: (r) => setPushNote(r.sent > 0 ? `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'} and shown here.` : 'Shown on this phone. Long-press or pull down the notification to see the buttons.'),
    onError: (e) => setPushNote(e instanceof Error ? e.message : 'Could not send'),
  });

  const timeOk = (v: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const input = 'w-[88px] rounded-control border-[1.5px] border-rule bg-transparent px-3 py-2 text-center font-body text-[14px] text-ink';

  return (
    <StackScreen eyebrow="Read-only bank access via Enable Banking" title="Settings">
      <Section title="Bank connections">
        {conns.data?.map((c) => <Connection key={c.id} c={c} />)}
        <Text variant="small" className="text-ink-3">
          Banks ask you to re-approve read-only access every 180 days. Finally reminds you a week before.
        </Text>
      </Section>

      <Section title="Notifications">
        <Text variant="small">Ask me about new merchants. More than 5 waiting become one evening digest. Weekly digest on Sunday at 19:00.</Text>
        <View className="flex-row items-center gap-2">
          <Text variant="small">Quiet hours</Text>
          <TextInput value={quiet?.start ?? ''} onChangeText={(v) => setQuiet((q) => ({ start: v, end: q?.end ?? '08:00' }))} placeholder="22:00" className={input} accessibilityLabel="Quiet hours start" />
          <Text variant="small">to</Text>
          <TextInput value={quiet?.end ?? ''} onChangeText={(v) => setQuiet((q) => ({ start: q?.start ?? '22:00', end: v }))} placeholder="08:00" className={input} accessibilityLabel="Quiet hours end" />
          <Button
            size="sm"
            variant="outline"
            disabled={!quiet || !timeOk(quiet.start) || !timeOk(quiet.end) || (quiet.start === me.data?.quietHoursStart && quiet.end === me.data?.quietHoursEnd)}
            onPress={() => quiet && update.mutate({ quietHoursStart: quiet.start, quietHoursEnd: quiet.end })}
          >
            Save
          </Button>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onPress={() => void registerForPush(api).then((r) => setPushNote(r.ok ? 'This phone will get push notifications.' : (r.reason ?? 'Could not register.')))}
          >
            Enable push
          </Button>
          <Button size="sm" variant="outline" loading={test.isPending} onPress={() => test.mutate()}>
            Send a test notification
          </Button>
        </View>
        {pushNote ? (
          <Text variant="small" accessibilityLiveRegion="polite">
            {pushNote}
          </Text>
        ) : null}
      </Section>

      <Section title="Security & look">
        <View className="flex-row items-center justify-between">
          <Text variant="body" className="flex-1 pr-3">
            Lock with Face ID / fingerprint
          </Text>
          <Switch value={bio} disabled={!bioOk} onValueChange={(v) => void toggleBio(v)} accessibilityLabel="Lock with biometrics" />
        </View>
        {!bioOk ? <Text variant="small">Set up Face ID or a fingerprint on this phone to use this.</Text> : null}
        <View className="flex-row gap-2">
          {(['auto', 'light', 'dark'] as ThemeMode[]).map((m) => (
            <Button key={m} size="sm" variant={theme.mode === m ? 'primary' : 'outline'} onPress={() => theme.setMode(m)}>
              {m[0]!.toUpperCase() + m.slice(1)}
            </Button>
          ))}
        </View>
      </Section>

      <Section title="You">
        <Text variant="small">Signed in as {auth.email}</Text>
        <Button variant="outline" onPress={() => void auth.signOut()}>
          Sign out
        </Button>
      </Section>
    </StackScreen>
  );
}

