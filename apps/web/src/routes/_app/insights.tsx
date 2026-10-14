import { eur, shortDate, useInsights, useMarkInsightSeen, useQueue, useRecurring } from '@finally/api-client';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ErrorNote, LoadingBlock, PageHeader, Panel, PanelTitle } from '@/components/common';
import { InsightList } from '@/components/insight-list';
import { GRID, SPAN } from '@/lib/grid';

export const Route = createFileRoute('/_app/insights')({ component: InsightsPage });

function InsightsPage() {
  const insights = useInsights();
  const queue = useQueue();
  const recurring = useRecurring();
  const markSeen = useMarkInsightSeen();

  // Opening the page counts as seeing what is on it.
  const unseen = insights.data?.items.filter((i) => !i.seenAt) ?? [];
  useEffect(() => {
    if (unseen.length === 0) return;
    const t = setTimeout(() => unseen.forEach((i) => markSeen.mutate(i.id)), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseen.length]);

  if (insights.error) return <ErrorNote error={insights.error} retry={() => void insights.refetch()} />;
  if (!insights.data) {
    return (
      <>
        <PageHeader title="Insights" />
        <LoadingBlock className="h-72" />
      </>
    );
  }

  const items = insights.data.items;
  const toSort = queue.data?.count ?? 0;
  const needs = items.filter((i) => i.severity === 'ACT');
  const watch = items.filter((i) => i.severity === 'WATCH');
  const info = items.filter((i) => i.severity === 'INFO');
  const subs = recurring.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Computed after each sync"
        title="Insights"
        lead="Every number here is calculated from your transactions. Pushes go out only for the top group."
      />
      <div className={GRID}>
        <Panel className={SPAN[4]}>
          <PanelTitle>Needs you</PanelTitle>
          <InsightList items={needs} toSort={toSort} />
        </Panel>
        <Panel className={SPAN[4]}>
          <PanelTitle>Watch</PanelTitle>
          <InsightList items={watch} />
        </Panel>
        <Panel className={SPAN[4]}>
          <PanelTitle>Good to know</PanelTitle>
          <InsightList items={info} />
        </Panel>
        {subs.length > 0 ? (
          <Panel className={SPAN[12]}>
            <PanelTitle>Recurring payments</PanelTitle>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13.5px]">
                <thead>
                  <tr className="border-b border-rule text-left text-[11px] uppercase tracking-[0.07em] text-ink-3">
                    <th className="px-2.5 pb-2 font-semibold">Merchant</th>
                    <th className="px-2.5 pb-2 font-semibold">Cadence</th>
                    <th className="px-2.5 pb-2 font-semibold">Next payment</th>
                    <th className="px-2.5 pb-2 text-right font-semibold">Usual</th>
                    <th className="px-2.5 pb-2 text-right font-semibold">Last</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.id} className="border-b border-rule last:border-0">
                      <td className="px-2.5 py-2.5 font-semibold">{s.merchantName}</td>
                      <td className="px-2.5 py-2.5 capitalize text-ink-2">{s.cadence.toLowerCase()}</td>
                      <td className="num px-2.5 py-2.5 text-ink-2">{shortDate(s.nextDate)}</td>
                      <td className="num px-2.5 py-2.5 text-right">{eur(s.expectedAmount)}</td>
                      <td className="num px-2.5 py-2.5 text-right font-semibold">{eur(s.lastAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
