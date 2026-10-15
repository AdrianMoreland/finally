import '../global.css';
import { ApiProvider, useCategories } from '@finally/api-client';
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
} from '@expo-google-fonts/hanken-grotesk';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BiometricGate } from '@/components/biometric-gate';
import { api } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ensurePermission, handleNotificationResponse, registerAskCategories } from '@/lib/notifications';
import { PrivacyProvider, usePrivacy } from '@/lib/privacy';
import { ThemeProvider, useTheme } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

// Registered at module scope so a notification button tapped while the app is not running still reaches us.
Notifications.addNotificationResponseReceivedListener((response) => {
  void handleNotificationResponse(response, api);
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false } },
});

/** Keep the three-button notification categories in step with the user's categories. */
function NotificationCategories(): null {
  const categories = useCategories();
  useEffect(() => {
    if (!categories.data) return;
    void ensurePermission().then((ok) => {
      if (ok) void registerAskCategories(categories.data);
    });
  }, [categories.data]);
  return null;
}

function Routes(): ReactNode {
  const { session, ready } = useAuth();
  const { scheme } = useTheme();
  const { on: privacy } = usePrivacy();
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  useEffect(() => {
    if (ready) queryClient.clear();
  }, [ready, session?.user.id]);
  if (!ready) return null;
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {session ? <NotificationCategories /> : null}
      <BiometricGate enabled={Boolean(session)}>
        <Stack key={privacy ? 'private' : 'open'} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
          <Stack.Protected guard={Boolean(session)}>
            <Stack.Screen name="(tabs)" />
            {['bills', 'month', 'review', 'payday', 'pots', 'people', 'tax', 'bonus', 'investing', 'freedom'].map((n) => (
              <Stack.Screen key={n} name={n} />
            ))}
            <Stack.Screen name="ask" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.7, 0.95], sheetGrabberVisible: true, sheetCornerRadius: 22 }} />
            <Stack.Screen name="tools" />
            <Stack.Screen name="settings" />
            <Stack.Screen
              name="categorise"
              options={{ presentation: 'formSheet', sheetAllowedDetents: [0.62, 0.92], sheetGrabberVisible: true, sheetCornerRadius: 22 }}
            />
          </Stack.Protected>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="login" />
          </Stack.Protected>
          <Stack.Screen name="auth/callback" />
        </Stack>
      </BiometricGate>
    </>
  );
}

export default function RootLayout(): ReactNode {
  const [loaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <ApiProvider api={api}>
              <AuthProvider>
                <PrivacyProvider>
                  <Routes />
                </PrivacyProvider>
              </AuthProvider>
            </ApiProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
