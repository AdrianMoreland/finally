import { useConnections, useMe, useQueue, useSyncAll } from '@finally/api-client';
import { Link, useRouterState } from '@tanstack/react-router';
import { Eye, EyeOff, House, Moon, RefreshCw, Search, Settings as SettingsIcon, Sparkles, Sun, SunMoon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AskDialog } from '@/components/ask-dialog';
import { useAskPanel } from '@/lib/ask';
import { SECTIONS, sectionOf } from '@/lib/nav';
import { usePrivacy } from '@/lib/privacy';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

/** A ring: track, mint arc, and a pink hand. */
function Logo({ size = 26 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="12" fill="none" stroke="var(--track)" strokeWidth="3.4" />
      <path d="M16 4a12 12 0 0 1 12 12" fill="none" stroke="var(--brand)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M16 16 21 11" stroke="var(--pink)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

const PILL =
  'inline-flex items-center gap-1.5 rounded-control border border-rule px-3 py-1.5 text-[13px] font-bold text-ink-2 hover:border-ink-3 hover:text-ink disabled:opacity-60';

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
      className={cn('grid size-[42px] flex-none place-items-center rounded-field border border-rule text-ink-2 hover:border-ink-3 hover:text-ink', on && 'border-ink text-ink', className)}
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
        placeholder="Ask or search, e.g. coffee this month vs last"
        aria-label="Ask Finally"
        className="h-[42px] w-full rounded-field border border-rule bg-surface pl-9 pr-14 text-[14px] outline-none placeholder:text-ink-3 focus:border-brand"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-chip border border-rule px-1.5 py-px text-[11px] font-semibold text-ink-3 sm:block">⌘K</kbd>
    </form>
  );
}

/** Latest sync across connections, in Europe/Dublin. */
function useSyncLabel(): { time: string | null; banks: string } {
  const conns = useConnections();
  const list = conns.data ?? [];
  const latest = list.map((c) => c.lastSyncAt).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const time = latest
    ? new Intl.DateTimeFormat('en-IE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Dublin' }).format(new Date(latest))
    : null;
  const names = list.map((c) => c.institution);
  return { time, banks: names.length ? `${names.join(' and ')} · read-only` : 'No bank connected' };
}

const NAV_ITEM =
  'flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-[14px] font-medium text-ink-2 hover:bg-raised hover:text-ink [&.active]:bg-fill [&.active]:font-bold [&.active]:text-on-fill [&.active]:hover:bg-fill';

export function AppShell({ children }: { children: ReactNode }): ReactNode {
  const queue = useQueue();
  const me = useMe();
  const sync = useSyncLabel();
  const { setOpen } = useAskPanel();
  const { on: privacy } = usePrivacy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = sectionOf(pathname);
  const toSort = queue.data?.count ?? 0;
  const setupNeeded = me.data ? !me.data.setupDone : false;

  return (
    <div className="mx-auto min-h-svh max-w-[1360px] md:px-4 md:pb-14 md:pt-5">
      <div className="min-h-svh border-hair bg-well md:min-h-[calc(100svh-5rem)] md:rounded-frame md:border md:p-2.5 md:shadow-[var(--shadow)]">
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[224px_minmax(0,1fr)]">
          <aside className="sticky top-5 hidden h-[calc(100svh-6.5rem)] min-w-0 flex-col gap-2.5 overflow-y-auto px-1.5 pb-3 pt-3.5 md:flex">
            <Link to="/" className="flex items-center gap-2.5 px-2.5 pb-1">
              <Logo size={30} />
              <b className="font-display text-[22px] font-light tracking-[-0.01em]">
                Finally
                <i className="mt-px block h-0.5 rounded-full bg-pink" />
              </b>
            </Link>
            <nav aria-label="Sections" className="flex flex-col gap-0.5">
              <Link to="/" activeOptions={{ exact: true }} className={NAV_ITEM}>
                <House className="size-[18px] flex-none" aria-hidden="true" /> Today
              </Link>
              {SECTIONS.filter((x) => x.pages.length).map((sec) => (
                <div key={sec.key} className="flex flex-col gap-0.5">
                  <div className="px-2.5 pb-[5px] pt-3.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">{sec.label}</div>
                  {sec.pages.map(({ to, label, icon: Icon }) => (
                    <Link key={to} to={to} className={NAV_ITEM}>
                      <Icon className="size-[18px] flex-none" aria-hidden="true" />
                      <span>{label}</span>
                      {to === '/money/sort' && toSort > 0 ? (
                        <span className="ml-auto rounded-chip bg-marker px-[7px] py-0.5 text-[11px] font-bold text-marker-ink" aria-label={`${toSort} to sort`}>
                          {toSort}
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              ))}
              <div className="mt-2.5 border-t border-hair pt-2.5">
                <Link to="/settings" className={NAV_ITEM}>
                  <SettingsIcon className="size-[18px] flex-none" aria-hidden="true" /> Settings &amp; privacy
                </Link>
              </div>
            </nav>
            <div className="mt-auto grid gap-2">
              <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-[14px] font-semibold text-pink hover:bg-raised">
                <Sparkles className="size-[18px] flex-none" aria-hidden="true" /> Ask Finally
              </button>
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-0.5 rounded-card border border-hair bg-surface px-3 py-2.5 text-[12px] text-ink-2">
                <i className="row-span-2 size-2 rounded-full bg-fill" aria-hidden="true" />
                <b className="font-bold text-ink">{sync.time ? `Synced ${sync.time}` : 'Not synced yet'}</b>
                <span>{sync.banks}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <SyncButton />
                <ThemeButton />
              </div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-2.5">
            <header className="sticky top-0 z-20 flex items-center gap-2.5 bg-well px-4 py-2.5 md:top-5 md:px-3.5 md:pb-0 md:pt-1">
              <Link to="/" className="flex items-center gap-2 md:hidden" aria-label="Finally home">
                <Logo size={28} />
              </Link>
              <AskBar />
              {setupNeeded ? (
                <Link to="/setup" className="hidden items-center gap-1.5 rounded-control bg-ink px-3 py-1.5 text-[13px] font-semibold text-paper sm:inline-flex">
                  <Sparkles className="size-3.5" aria-hidden="true" /> Set up
                </Link>
              ) : null}
              <PrivacyButton />
              <Link to="/settings" aria-label="Settings" className="grid size-[42px] place-items-center rounded-field border border-rule text-ink-2 hover:border-ink-3 hover:text-ink md:hidden">
                <SettingsIcon className="size-4" aria-hidden="true" />
              </Link>
            </header>

            {active.pages.length ? (
              <nav aria-label={`${active.label} pages`} className="flex gap-1.5 overflow-x-auto px-4 py-1 md:hidden">
                {active.pages.map((p) => (
                  <Link
                    key={p.to}
                    to={p.to}
                    className="whitespace-nowrap rounded-chip border border-rule px-3 py-1 text-[13px] font-medium text-ink-2 [&.active]:border-fill [&.active]:bg-fill [&.active]:text-on-fill"
                  >
                    {p.label}
                    {p.to === '/money/sort' && toSort > 0 ? <span className="ml-1.5 rounded-chip bg-marker px-1.5 text-[11px] font-bold text-marker-ink">{toSort}</span> : null}
                  </Link>
                ))}
              </nav>
            ) : null}

            {/* Remount on privacy toggle so every amount is re-formatted. */}
            <main id="main" key={privacy ? 'private' : 'open'} tabIndex={-1} className="min-w-0 flex-1 px-4 pb-24 pt-[18px] md:px-3.5 md:pb-9 md:pt-4">
              {children}
            </main>
          </div>
        </div>
      </div>

      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-hair bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
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
