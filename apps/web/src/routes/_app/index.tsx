import { clockTime, eur, eur0, longDate, pct, shortDate, useOverview } from '@finally/api-client';
import { createFileRoute, Link } from '@tanstack/react-router';
import { DayBars, NetWorthChart, SpendDonut } from '@/components/charts/charts';
import { Big, CategoryChip, ErrorNote, LoadingBlock, PageHeader, Panel, PanelTitle, Sub, Track } from '@/components/common';
import { InsightList } from '@/components/insight-list';
import { categoryVar } from '@/lib/category';
import { GRID, SPAN } from '@/lib/grid';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/')({ component: OverviewPage });

function OverviewPage() {
  const { data: o, error, refetch } = useOverview();
  if (error) return <ErrorNote error={error} retry={() => void refetch()} />;
  if (!o) {
    return (
      <>
        <PageHeader title="Overview" />
        <div className={GRID}>
          {[5, 3, 4, 5, 7, 5, 7].map((n, i) => (
            <LoadingBlock key={i} className={cn('h-44', SPAN[n as keyof typeof SPAN])} />
          ))}
        </div>
      </>
    );
  }

  const today = o.asOf;
  const flexUsed = Number(o.flexible.budget) > 0 ? (Number(o.flexible.spent) / Number(o.flexible.budget)) * 100 : 0;
  const pace = (o.dayOfMonth / o.daysInMonth) * 100;
  const ahead = Number(o.flexible.spent) - Number(o.flexible.expectedByToday);
  const total = o.topCategories.reduce((a, c) => a + Number(c.spent), 0);
  const banks = [...new Set(o.accounts.map((a) => a.institution === 'AIB' ? 'AIB' : 'Revolut'))].join(', ');

  return (
    <>
      <PageHeader
        eyebrow={longDate(today)}
        title="Overview"
        right={
          <div className="inline-flex items-center gap-2 text-[12.5px] text-ink-2">
            <span className="size-2 rounded-full bg-good" aria-hidden="true" />
            {o.lastSyncAt ? `Synced ${clockTime(o.lastSyncAt)} · ${banks}` : 'Not synced yet'}
          </div>
        }
      />

      {o.toSortCount > 0 ? (
        <Link
          to="/sort"
          className="mb-4 flex w-full items-center gap-3 rounded-[10px] border border-rule bg-surface px-4 py-3 text-left"
        >
          <span>
            <span className="rounded-[3px] bg-marker px-1.5 py-px font-bold text-marker-ink">
              {o.toSortCount} merchant{o.toSortCount === 1 ? '' : 's'}
            </span>{' '}
            need a category. Each answer sorts every payment from that merchant.
          </span>
          <span className="ml-auto whitespace-nowrap font-semibold text-brand">Sort them →</span>
        </Link>
      ) : null}

      <div className={GRID}>
        <Panel className={SPAN[5]}>
          <PanelTitle>
            <span>Net worth</span>
            <span className={cn('num text-[12.5px] font-semibold normal-case tracking-normal', Number(o.netWorth.change12m) >= 0 ? 'text-good' : 'text-bad')}>
              {eur0(o.netWorth.change12m)} in 12 months
            </span>
          </PanelTitle>
          <Big>{eur(o.netWorth.current)}</Big>
          <div className="mt-2.5">
            <NetWorthChart series={o.netWorth.series} />
          </div>
        </Panel>

        <Panel className={SPAN[3]}>
          <PanelTitle>Safe to spend today</PanelTitle>
          <Big>{eur(o.safeToSpend.perDay)}</Big>
          <Sub>
            {eur(o.safeToSpend.leftToPayday)} left for the {o.daysToPayday} days to payday ({shortDate(o.paydayDate)}), after {eur(o.safeToSpend.billsToCome)} of bills still to come.
          </Sub>
        </Panel>

        <Panel className={SPAN[4]}>
          <PanelTitle action={<Link to="/budgets">Budgets</Link>}>Flexible spend this month</PanelTitle>
          <Big>
            {eur(o.flexible.spent)}{' '}
            <span className="font-body text-[14px] font-medium tracking-normal text-ink-2">of {eur0(o.flexible.budget)}</span>
          </Big>
          <Track value={flexUsed} tick={pace} height={10} className="my-3.5" />
          <div className="flex justify-between text-[12px] text-ink-2">
            <span>
              <b className="num">{pct(flexUsed, 0)}</b> used
            </span>
            <span>
              day {o.dayOfMonth} of {o.daysInMonth} · {pct(pace, 0)} of the month
            </span>
          </div>
          <Sub className={cn('font-semibold', ahead > 0 ? 'text-warn' : 'text-good')}>
            {ahead > 0 ? `Ahead of pace by ${eur(ahead)}` : `Under pace by ${eur(Math.abs(ahead))}`}
          </Sub>
        </Panel>

        <Panel className={SPAN[5]}>
          <PanelTitle>Where it went this month</PanelTitle>
          <div className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-[18px] sm:grid-cols-[150px_minmax(0,1fr)]">
            <SpendDonut items={o.topCategories} centreLabel="excl. rent" />
            <div className="grid gap-[7px] text-[13px]">
              {o.topCategories.map((c) => (
                <div key={c.category.id} className="grid grid-cols-[10px_1fr_auto_44px] items-center gap-2.5">
                  <i className="size-2.5 rounded-[3px]" style={{ background: categoryVar(c.category) }} />
                  <span className="truncate">{c.category.name}</span>
                  <b className="num font-semibold">{eur(c.spent)}</b>
                  <span className="num text-right text-ink-3">{pct((Number(c.spent) / total) * 100, 0)}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel className={SPAN[7]}>
          <PanelTitle>Spend by day · excluding rent</PanelTitle>
          <DayBars days={o.daysInMonth} spentByDay={o.spendByDay} evenPace={o.evenPacePerDay} month={o.month} />
        </Panel>

        <Panel className={SPAN[5]}>
          <PanelTitle action={<Link to="/insights">All insights</Link>}>Latest insights</PanelTitle>
          <InsightList items={o.latestInsights} toSort={o.toSortCount} limit={4} />
        </Panel>

        <Panel className={SPAN[7]}>
          <PanelTitle action={<Link to="/transactions">All payments</Link>}>Recent payments</PanelTitle>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <tbody>
                {o.recentTransactions.map((t) => (
                  <tr key={t.id} className={cn('border-b border-rule last:border-0', !t.category && t.kind !== 'TRANSFER' && 'bg-[color-mix(in_srgb,var(--marker)_14%,transparent)]')}>
                    <td className="num whitespace-nowrap px-1.5 py-2 text-ink-2">{shortDate(t.bookingDate)}</td>
                    <td className="px-1.5 py-2">
                      <div className="font-semibold">{t.merchant?.displayName ?? t.rawDescriptor}</div>
                      <div className="mono-raw">{t.rawDescriptor}</div>
                    </td>
                    <td className="px-1.5 py-2">
                      <CategoryChip category={t.category} kind={t.kind} />
                    </td>
                    <td className={cn('num whitespace-nowrap px-1.5 py-2 text-right font-semibold', Number(t.amountEur) > 0 && 'text-good')}>
                      {eur(t.amountEur, { signed: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
