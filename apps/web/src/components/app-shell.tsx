import { useAccounts, useQueue, useSyncAll, eur } from '@finally/api-client';
import { Link } from '@tanstack/react-router';
import {
  Calculator,
  ChartColumn,
  House,
  Inbox,
  Lightbulb,
  ListOrdered,
  Moon,
  RefreshCw,
  Settings as SettingsIcon,
  Sun,
  SunMoon,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

function Logo({ size = 26 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--brand)" />
      <path d="M10 10.5h12" stroke="var(--brand-ink)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="19.5" r="5.6" fill="none" stroke="var(--brand-ink)" strokeWidth="2.4" />
      <path d="M16 17v5" stroke="var(--brand-ink)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const NAV: Array<{ to: string; label: string; icon: LucideIcon; badge?: boolean }> = [
  { to: '/', label: 'Overview', icon: House },
  { to: '/transactions', label: 'Transactions', icon: ListOrdered },
  { to: '/sort', label: 'To sort', icon: Inbox, badge: true },
  { to: '/budgets', label: 'Budgets', icon: ChartColumn },
  { to: '/insights', label: 'Insights', icon: Lightbulb },
  { to: '/investments', label: 'Investments', icon: TrendingUp },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/tools', label: 'Tools', icon: Calculator },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function ThemeButton({ className }: { className?: string }): ReactNode {
  const { mode, cycle } = useTheme();
  const Icon = mode === 'auto' ? SunMoon : mode === 'light' ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={cycle}
      className={cn('inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink', className)}
      aria-label="Switch colour theme"
    >
      <Icon className="size-4" aria-hidden="true" />
      {mode === 'auto' ? 'Auto' : mode === 'light' ? 'Light' : 'Dark'}
    </button>
  );
}

export function SyncButton(): ReactNode {
  const sync = useSyncAll();
  return (
    <button
      type="button"
      disabled={sync.isPending}
      onClick={() =>
        sync.mutate(undefined, {
          onSuccess: (r) => {
            const n = r.results.reduce((a, x) => a + x.newTxCount, 0);
            toast.success(n ? `${n} new payment${n === 1 ? '' : 's'}` : 'Already up to date');
          },
          onError: (e) => toast.error(e instanceof Error ? e.message : 'Sync failed'),
        })
      }
      className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink disabled:opacity-60"
    >
      <RefreshCw className={cn('size-4', sync.isPending && 'animate-spin')} aria-hidden="true" />
      {sync.isPending ? 'Syncing' : 'Sync'}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }): ReactNode {
  const queue = useQueue();
  const accounts = useAccounts();
  const count = queue.data?.count ?? 0;

  return (
    <div className="mx-auto min-h-svh max-w-[1400px] md:p-4">
      <div className="grid min-h-[calc(100svh-2rem)] grid-cols-1 overflow-hidden border-rule bg-paper md:grid-cols-[228px_minmax(0,1fr)] md:rounded-[14px] md:border md:shadow-[var(--shadow)]">
        <aside className="flex min-w-0 flex-col gap-2.5 border-b border-rule bg-surface p-3 md:gap-4 md:border-b-0 md:border-r md:px-3 md:py-[18px]">
          <div className="flex items-center gap-2.5 px-1.5">
            <Logo />
            <b className="font-display text-[18px] font-bold tracking-[-0.01em]">Finally</b>
            <span className="ml-auto flex gap-1.5 md:hidden">
              <ThemeButton />
            </span>
          </div>
          <nav aria-label="Sections" className="flex gap-1 overflow-x-auto pb-0.5 md:flex-col md:gap-0.5 md:overflow-visible">
            {NAV.map(({ to, label, icon: Icon, badge }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === '/' }}
                className="flex w-auto items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-[9px] text-[14px] font-medium text-ink-2 hover:bg-raised hover:text-ink md:w-full [&.active]:bg-brand-soft [&.active]:font-semibold [&.active]:text-brand"
              >
                <Icon className="size-[18px] flex-none" aria-hidden="true" />
                <span>{label}</span>
                {badge && count > 0 ? (
                  <span className="ml-auto rounded-full bg-marker px-[7px] py-0.5 text-[11px] font-bold text-marker-ink" aria-label={`${count} waiting`}>
                    {count}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
          <div className="mt-auto hidden gap-2 border-t border-rule px-1.5 pt-3.5 text-[12.5px] md:grid">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Accounts</div>
            {accounts.data?.map((a) => (
              <div key={a.id} className="flex justify-between gap-2 text-ink-2">
                <span className="truncate">{a.name}</span>
                <b className="num font-semibold text-ink">{eur(a.balance)}</b>
              </div>
            ))}
            <div className="mt-2 flex gap-1.5">
              <SyncButton />
              <ThemeButton />
            </div>
          </div>
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 px-4 pb-7 pt-[18px] md:px-7 md:pb-10 md:pt-6">
          {children}
        </main>
      </div>
    </div>
  );
}
