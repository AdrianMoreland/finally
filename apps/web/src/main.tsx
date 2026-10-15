import { ApiProvider } from '@finally/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { AskProvider } from '@/lib/ask';
import { AuthProvider, useAuth } from '@/lib/auth';
import { PrivacyProvider } from '@/lib/privacy';
import { ThemeProvider } from '@/lib/theme';
import { routeTree } from './routeTree.gen';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
});

const router = createRouter({
  routeTree,
  context: { auth: undefined as never, queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

function Splash() {
  return (
    <div className="grid min-h-svh place-items-center text-ink-3" role="status">
      Loading…
    </div>
  );
}

function InnerApp() {
  const auth = useAuth();
  // Re-run route guards when the session changes (sign in, sign out, token expiry).
  useEffect(() => {
    if (auth.ready) {
      queryClient.clear();
      void router.invalidate();
    }
  }, [auth.ready, auth.session?.user.id]);
  if (!auth.ready) return <Splash />;
  return <RouterProvider router={router} context={{ auth, queryClient }} />;
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ApiProvider api={api}>
          <AuthProvider>
            <PrivacyProvider>
              <AskProvider>
                <TooltipProvider delayDuration={200}>
                  <InnerApp />
                  <Toaster position="bottom-center" />
                </TooltipProvider>
              </AskProvider>
            </PrivacyProvider>
          </AuthProvider>
        </ApiProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
