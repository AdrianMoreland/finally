import { eur, useAccounts, useMe, useQueue, useSyncAll } from '@finally/api-client';
import { Link, useRouterState } from '@tanstack/react-router';
import { Eye, EyeOff, Moon, RefreshCw, Search, Settings as SettingsIcon, Sparkles, Sun, SunMoon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AskDialog } from '@/components/ask-dialog';
import { useAskPanel } from '@/lib/ask';
import { SECTIONS, sectionOf } from '@/lib/nav';
import { usePrivacy } from '@/lib/privacy';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

function Logo({ size = 26 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="6" fill="var(--fill)" />
      <path d="M10 10.5h12" stroke="var(--on-fill)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="19.5" r="5.6" fill="none" stroke="var(--on-fill)" strokeWidth="2.4" />
      <path d="M16 17v5" stroke="var(--on-fill)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const PILL =
  'inline-flex items-center gap-1.5 rounded-[3px] border-[1.5px] border-rule px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:border-ink-3 hover:text-ink disabled:opacity-60';

export function ThemeButton({ className }: { className?: string }): ReactNode {
  const { mode, cycle } = useTheme();
  const Icon = mode === 'auto' ? SunMoon : mode === 'light' ? Sun : Moon;
  return (
    <button type="button" onClick={cycle} className={cn(PILL, className)} aria-label="Switch colour theme">
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
      className={PILL}
    >
      <RefreshCw className={cn('size-4', sync.isPending && 'animate-spin')} aria-hidden="true" />
      {sync.isPending ? 'Syncing' : 'Sync'}
    </button>
  );
}

function PrivacyButton({ className }: { className?: string }): ReactNode {
  const { on, toggle } = usePrivacy();
  const Icon = on ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Show amounts' : 'Hide amounts'}
      title={on ? 'Privacy mode is on: amounts are hidden' : 'Hide amounts'}
      className={cn('grid size-9 place-items-center rounded-[3px] border-[1.5px] border-rule text-ink-2 hover:border-ink-3 hover:text-ink', on && 'border-ink text-ink', className)}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

/** Ask is a search bar at the top of every page, not a page. ⌘K / Ctrl+K from anywhere. */
function AskBar(): ReactNode {
  const { submit, setOpen } = useAskPanel();
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      role="search"
      className="relative min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) submit(text);
        else setOpen(true);
        setText('');
        ref.current?.blur();
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
      <input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask Finally: how much on coffee last month?"
        aria-label="Ask Finally"
        className="h-10 w-full rounded-[3px] border-[1.5px] border-rule bg-transparent pl-9 pr-14 text-[14px] outline-none placeholder:text-ink-3 focus:border-brand"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-[3px] border border-rule px-1.5 py-px text-[11px] font-semibold text-ink-3 sm:block">⌘K</kbd>
    </form>
  );
}

export function AppShell({ children }: { children: ReactNode }): ReactNode {
  const queue = useQueue();
  const accounts = useAccounts();
  const me = useMe();
  const { on: privacy } = usePrivacy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = sectionOf(pathname);
  const toSort = queue.data?.count ?? 0;
  const setupNeeded = me.data ? !me.data.setupDone : false;

  return (
    <div className="mx-auto min-h-svh max-w-[1500px] bg-well md:p-1.5">
      <div className="grid min-h-[calc(100svh-0.75rem)] grid-cols-1 gap-1.5 md:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="hidden min-w-0 flex-col gap-4 rounded-[6px] bg-surface px-3 py-[18px] md:flex">
          <Link to="/" className="flex items-center gap-2.5 px-1.5">
            <Logo />
            <b className="font-display text-[19px] font-medium tracking-[-0.01em]">Finally</b>
          </Link>
          <nav aria-label="Sections" className="flex flex-col gap-0.5">
            {SECTIONS.map(({ key, label, to, icon: Icon, pages }) => {
              const open = active.key === key;
              return (
                <div key={key}>
                  <Link
                    to={to}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-[3px] px-2.5 py-[9px] text-[14px] font-medium text-ink-2 hover:bg-raised hover:text-ink',
                      open && 'bg-fill font-semibold text-on-fill hover:bg-fill hover:text-on-fill',
                    )}
                    aria-current={open ? 'page' : undefined}
                  >
                    <Icon className="size-[18px] flex-none" aria-hidden="true" />
                    <span>{label}</span>
                    {key === 'money' && toSort > 0 ? (
                      <span className="ml-auto rounded-[3px] bg-marker px-[7px] py-0.5 text-[11px] font-bold text-marker-ink" aria-label={`${toSort} to sort`}>
                        {toSort}
                      </span>
                    ) : null}
                  </Link>
                  {open && pages.length ? (
                    <div className="ml-[18px] mt-0.5 grid gap-px border-l border-rule pl-2.5">
                      {pages.map((p) => (
                        <Link
                          key={p.to}
                          to={p.to}
                          className="flex items-center rounded-[3px] px-2 py-1 text-[13px] text-ink-2 hover:text-ink [&.active]:font-semibold [&.active]:text-brand"
                        >
                          {p.label}
                          {p.to === '/money/sort' && toSort > 0 ? <span className="ml-auto text-[11px] font-bold text-marker-ink"><i className="inline-block size-2 rounded-[2px] bg-marker" /></span> : null}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
          <div className="mt-auto grid gap-2 border-t border-rule px-1.5 pt-3.5 text-[12.5px]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Accounts</div>
            {accounts.data?.map((a) => (
              <div key={a.id} className="flex justify-between gap-2 text-ink-2">
                <span className="truncate">{a.name}</span>
                <b className={cn('num font-semibold text-ink', Number(a.balance) < 0 && 'text-warn')}>{eur(a.balance)}</b>
              </div>
            ))}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <SyncButton />
              <ThemeButton />
            </div>
            <Link to="/settings" className="mt-1 inline-flex items-center gap-2 rounded-[3px] px-1.5 py-1.5 text-[13px] font-medium text-ink-2 hover:text-ink">
              <SettingsIcon className="size-4" aria-hidden="true" /> Settings
            </Link>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-1.5">
          <header className="sticky top-0 z-20 flex items-center gap-2.5 bg-surface px-4 py-2.5 md:top-1.5 md:rounded-[6px] md:px-5">
            <Link to="/" className="flex items-center gap-2 md:hidden" aria-label="Finally home">
              <Logo size={28} />
            </Link>
            <AskBar />
            {setupNeeded ? (
              <Link to="/setup" className="hidden items-center gap-1.5 rounded-[3px] bg-ink px-3 py-1.5 text-[13px] font-semibold text-paper sm:inline-flex">
                <Sparkles className="size-3.5" aria-hidden="true" /> Set up
              </Link>
            ) : null}
            <PrivacyButton />
            <Link to="/settings" aria-label="Settings" className="grid size-9 place-items-center rounded-[3px] border-[1.5px] border-rule text-ink-2 hover:border-ink-3 hover:text-ink md:hidden">
              <SettingsIcon className="size-4" aria-hidden="true" />
            </Link>
          </header>

          {active.pages.length ? (
            <nav aria-label={`${active.label} pages`} className="flex gap-1.5 overflow-x-auto bg-surface px-4 py-2 md:hidden">
              {active.pages.map((p) => (
                <Link
                  key={p.to}
                  to={p.to}
                  className="whitespace-nowrap rounded-[3px] border-[1.5px] border-rule px-3 py-1 text-[13px] font-medium text-ink-2 [&.active]:border-fill [&.active]:bg-fill [&.active]:text-on-fill"
                >
                  {p.label}
                  {p.to === '/money/sort' && toSort > 0 ? <span className="ml-1.5 rounded-[3px] bg-marker px-1.5 text-[11px] font-bold text-marker-ink">{toSort}</span> : null}
                </Link>
              ))}
            </nav>
          ) : null}

          {/* Remount on privacy toggle so every amount is re-formatted. */}
          <main id="main" key={privacy ? 'private' : 'open'} tabIndex={-1} className="min-w-0 flex-1 rounded-[6px] px-4 pb-24 pt-[18px] md:px-5 md:pb-8 md:pt-6">
            {children}
          </main>
        </div>
      </div>

      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-rule bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {SECTIONS.map(({ key, label, to, icon: Icon }) => (
          <Link key={key} to={to} className={cn('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-ink-3', active.key === key && 'text-brand')} aria-current={active.key === key ? 'page' : undefined}>
            <Icon className="size-5" aria-hidden="true" />
            {label}
            {key === 'money' && toSort > 0 ? <span className="absolute right-[26%] top-1 size-2 rounded-[2px] bg-marker" aria-label={`${toSort} to sort`} /> : null}
          </Link>
        ))}
      </nav>
      <AskDialog />
    </div>
  );
}
