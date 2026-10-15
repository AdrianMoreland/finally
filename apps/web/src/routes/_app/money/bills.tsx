import { eur, eur0, shortDate, useBillMutations, useBills } from '@finally/api-client';
import type { BillsDto } from '@finally/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { Switch } from '@/components/ui/switch';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Big, ErrorNote, LoadingBlock, PageHeader, Panel, PanelTitle, Sub } from '@/components/common';
import { Callout, Chip, Line } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { GRID, SPAN } from '@/lib/grid';

export const Route = createFileRoute('/_app/money/bills')({ component: BillsPage });

const ordinal = (n: number): string => (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
const rhythm = (r: BillsDto['repeating'][number]): string =>
  `${r.cadence === 'quarterly' ? 'Every 3 months' : 'Monthly'}, around the ${r.usualDay}${ordinal(r.usualDay)}`;

function BillsPage() {
  const { data, error, refetch } = useBills();
  const { cancel, dismiss } = useBillMutations();
  if (error) return <ErrorNote error={error} retry={() => void refetch()} />;
  if (!data) return <LoadingBlock className="h-96" />;
  const subs = data.repeating.filter((r) => r.slug === 'subscriptions');
  const bills = data.repeating.filter((r) => r.slug !== 'subscriptions');
  const rises = data.repeating.filter((r) => r.rise && !r.cancelled);

  return (
    <>
      <PageHeader
        eyebrow="Found from your history"
        title="Bills & subscriptions"
        lead="Repeating payments are spotted from your own history, so there is no list to keep up. Price rises and double charges are flagged."
      />
      <div className={GRID}>
        <Panel className={SPAN[4]}>
          <PanelTitle>Before payday</PanelTitle>
          <Big>{eur(data.billsBeforePayday)}</Big>
          <Sub>of bills still to come before your next payday. Safe to spend already keeps this aside.</Sub>
        </Panel>
        <Panel className={SPAN[4]}>
          <PanelTitle>Subscriptions</PanelTitle>
          <Big>{eur(data.subscriptions.monthly)}</Big>
          <Sub>
            a month, {eur0(data.subscriptions.yearly)} a year.
            {Number(data.subscriptions.savedMonthly) > 0 ? ` Cancelling the ones you ticked would save ${eur(data.subscriptions.savedMonthly)} a month.` : ''}
          </Sub>
        </Panel>
        <Panel className={SPAN[4]}>
          <PanelTitle>Bank charges</PanelTitle>
          <Big>{eur(data.fees.last12Months)}</Big>
          <Sub>in fees and interest over the last 12 months.</Sub>
        </Panel>

        {rises.map((r) => (
          <Panel key={`rise-${r.id}`} className={SPAN[12]}>
            <Callout tone="act">
              <b>{r.name} went up</b> from {eur(r.rise!.from)} to {eur(r.rise!.to)} on {shortDate(r.rise!.since)}: {eur((Number(r.rise!.to) - Number(r.rise!.from)) * 12)} more a year.
            </Callout>
          </Panel>
        ))}

        <Panel className={SPAN[7]}>
          <PanelTitle>Coming up</PanelTitle>
          {data.upcoming.slice(0, 8).map((u) => (
            <Line
              key={u.id}
              label={`${shortDate(u.date)} · ${u.name}`}
              value={`${u.varies ? 'about ' : ''}${eur(u.amount)}`}
            />
          ))}
          {data.upcoming.length === 0 ? <p className="text-[13px] text-ink-2">No repeating bills found yet.</p> : null}
        </Panel>

        <Panel className={SPAN[5]}>
          <PanelTitle>Worth a look</PanelTitle>
          <div className="grid gap-3 text-[13px]">
            {data.doubles.map((d) => (
              <div key={d.id} className="rounded-lg border border-rule bg-raised p-3">
                <b>
                  {d.merchantName} {eur(d.amount)} {d.count === 2 ? 'twice' : `${d.count} times`} on {shortDate(d.date)}
                </b>
                <p className="mt-0.5 text-ink-2">Same amount, same day. Check it is not a double charge.</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => dismiss.mutate(d.id, { onSuccess: () => toast.success('Marked as checked') })}>
                  It&apos;s fine
                </Button>
              </div>
            ))}
            {data.refunds.map((r) => (
              <div key={r.id} className="flex items-baseline justify-between gap-3">
                <span>
                  {r.merchantName} refund{r.category ? ` netted against ${r.category.name}` : ''} · {shortDate(r.date)}
                </span>
                <b className="num text-good">{eur(r.amount, { signed: true })}</b>
              </div>
            ))}
            {data.returnedDebits.map((r) => (
              <div key={r.id} className="flex items-baseline justify-between gap-3">
                <span>{r.merchantName} direct debit bounced and was returned · {shortDate(r.date)}</span>
                <b className="num">{eur(r.amount, { signed: true })}</b>
              </div>
            ))}
            {!data.doubles.length && !data.refunds.length && !data.returnedDebits.length ? <p className="text-ink-2">Nothing odd in your recent payments.</p> : null}
          </div>
        </Panel>

        <Panel className={SPAN[12]}>
          <PanelTitle>Subscriptions found</PanelTitle>
          <RepeatList items={subs} onToggle={(id, cancelled) => cancel.mutate({ id, cancelled })} cancellable />
        </Panel>
        <Panel className={SPAN[12]}>
          <PanelTitle>Rent and bills found</PanelTitle>
          <RepeatList items={bills} onToggle={(id, cancelled) => cancel.mutate({ id, cancelled })} />
        </Panel>
      </div>
    </>
  );
}

function RepeatList({ items, onToggle, cancellable }: { items: BillsDto['repeating']; onToggle: (id: string, cancelled: boolean) => void; cancellable?: boolean }): ReactNode {
  if (!items.length) return <p className="text-[13px] text-ink-2">None found yet.</p>;
  return (
    <div>
      {items.map((r) => (
        <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-rule py-2.5 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto]">
          <div className="min-w-0">
            <div className={`truncate font-semibold ${r.cancelled ? 'text-ink-3 line-through' : ''}`}>{r.name}</div>
            <div className="text-[12px] text-ink-3">Since {shortDate(r.since)} · {r.count} payments</div>
          </div>
          <div className="order-3 col-span-2 text-[12.5px] text-ink-2 sm:order-none sm:col-span-1">
            {rhythm(r)}
            {r.rise ? <Chip tone="mark" className="ml-2">Price rise</Chip> : null}
            {r.varies ? <span className="ml-2 text-ink-3">varies {eur0(r.lo)} to {eur0(r.hi)}</span> : null}
          </div>
          <b className="num text-right">{r.varies ? `about ${eur(r.avg)}` : eur(r.amount)}</b>
          {cancellable ? (
            <label className="hidden items-center gap-2 text-[12px] text-ink-3 sm:inline-flex">
              If I cancel
              <Switch checked={r.cancelled} onCheckedChange={(v) => onToggle(r.id, v)} aria-label={`Cancel ${r.name}`} />
            </label>
          ) : (
            <span />
          )}
        </div>
      ))}
    </div>
  );
}
