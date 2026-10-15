import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { AuthState } from '@/lib/auth';

export interface RouterContext {
  auth: AuthState;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <div className="grid min-h-svh place-items-center p-6 text-center">
      <div>
        <h1 className="font-display text-[28px] font-medium">Page not found</h1>
        <a href="/" className="mt-2 inline-block font-semibold text-brand">
          Back to Overview
        </a>
      </div>
    </div>
  ),
});
