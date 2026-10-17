import { eur, usePrefs, useSplit } from '@finally/api-client';
import type { CategoryDto, TransactionDto } from '@finally/contracts';
import { Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface Row {
  amount: string;
  categoryId: string;
  shareOf: string;
  nonCash: boolean;
}

const NONE = 'none';
const cents = (v: string): number => Math.round((Number(v) || 0) * 100);
const fromCents = (c: number): string => (c / 100).toFixed(2);

function initial(tx: TransactionDto, prefill: { amount: string; who: string } | null): Row[] {
  if (tx.split) {
    return tx.split.parts.map((p) => ({ amount: p.amount, categoryId: p.categoryId ?? '', shareOf: p.shareOf ?? '', nonCash: p.nonCash }));
  }
  const total = Math.abs(cents(tx.amountEur));
  if (prefill) {
    const extra = cents(prefill.amount);
    return [
      { amount: fromCents(Math.max(0, total - extra)), categoryId: '', shareOf: prefill.who, nonCash: false },
      { amount: fromCents(extra), categoryId: '', shareOf: prefill.who, nonCash: true },
    ];
  }
  return [
    { amount: '', categoryId: '', shareOf: '', nonCash: false },
    { amount: '', categoryId: '', shareOf: '', nonCash: false },
  ];
}

/**
 * Split one transaction into parts, each with an amount and a category (a Tesco shop into tobacco and groceries; a
 * housemate's transfer into rent share and a bill they paid for you). The bank's row never changes.
 */
export function SplitEditor({ tx, categories, prefill }: { tx: TransactionDto; categories: CategoryDto[]; prefill?: { amount: string; who: string } | null }): ReactNode {
  const prefs = usePrefs();
  const save = useSplit();
  const people = prefs.data?.rent.flatmates ?? [];
  const credit = Number(tx.amountEur) > 0;
  const [open, setOpen] = useState(Boolean(prefill));
  const [rows, setRows] = useState<Row[]>(() => initial(tx, prefill ?? null));
  useEffect(() => {
    setRows(initial(tx, prefill ?? null));
    setOpen(Boolean(prefill));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.id, tx.split, prefill?.amount, prefill?.who]);

  const total = Math.abs(cents(tx.amountEur));
  const used = rows.filter((r) => !r.nonCash).reduce((n, r) => n + cents(r.amount), 0);
  const rest = total - used;
  const set = (i: number, next: Partial<Row>): void => setRows(rows.map((r, j) => (j === i ? { ...r, ...next } : r)));
  const valid =
    rest === 0 &&
    rows.length > 0 &&
    rows.every((r) => cents(r.amount) > 0 && (!r.nonCash || (r.shareOf && r.categoryId)));

  const submit = (): void =>
    save.mutate(
      {
        id: tx.id,
        parts: rows.map((r) => ({
          amount: (cents(r.amount) / 100).toFixed(2),
          categoryId: r.categoryId || null,
          shareOf: r.shareOf || null,
          nonCash: r.nonCash,
        })),
      },
      { onSuccess: () => { toast.success('Split saved'); setOpen(false); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save the split') },
    );
  const remove = (): void => save.mutate({ id: tx.id, parts: [] }, { onSuccess: () => { toast.success('Split removed'); setOpen(false); } });

  if (!open) {
    return (
      <div className="grid gap-2 rounded-lg border border-rule p-3 text-[13px]">
        {tx.split ? (
          <>
            <div className="font-semibold">Split into {tx.split.parts.length} parts</div>
            {tx.split.changed ? <p className="text-warn">The bank changed this amount after you split it. The difference went into the largest part: check it.</p> : null}
            {tx.split.parts.map((p, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span className="text-ink-2">{p.categoryName ?? (p.shareOf ? 'Rent share' : 'No category')}{p.nonCash ? ' (no money moved)' : ''}</span>
                <b className="num">{eur(p.amount)}</b>
              </div>
            ))}
          </>
        ) : (
          <div className="text-ink-2">One category for the whole {eur(String(Math.abs(Number(tx.amountEur))))}. Split it to count part of it somewhere else.</div>
        )}
        <div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{tx.split ? 'Edit split' : 'Split this'}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-lg border border-rule p-3 text-[13px]">
      <div className="font-semibold">Split {eur(fromCents(total))}</div>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-1.5 rounded-md bg-raised p-2">
          <div className="flex items-center gap-2">
            <Input inputMode="decimal" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} placeholder="0.00" className="h-8 w-[90px]" aria-label={`Part ${i + 1} amount`} />
            <Select value={r.categoryId || NONE} onValueChange={(v) => set(i, { categoryId: v === NONE ? '' : v })}>
              <SelectTrigger aria-label={`Part ${i + 1} category`} className="h-8 flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{r.shareOf && !r.nonCash ? 'Rent share' : 'No category'}</SelectItem>
                {categories.filter((c) => !c.archived).map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <button type="button" className="text-ink-3 hover:text-ink" aria-label={`Remove part ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" aria-hidden="true" /></button>
          </div>
          {credit && people.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={r.shareOf || NONE} onValueChange={(v) => set(i, { shareOf: v === NONE ? '' : v })}>
                <SelectTrigger aria-label={`Part ${i + 1} from`} className="h-8 w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not a rent share</SelectItem>
                  {people.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}&apos;s rent share</SelectItem>))}
                </SelectContent>
              </Select>
              {r.shareOf ? (
                <label className="flex items-center gap-2 text-ink-2">
                  <Switch checked={r.nonCash} onCheckedChange={(v) => set(i, { nonCash: v })} aria-label={`Part ${i + 1} settled without money`} />
                  Settled without money (they paid for you, pick what for)
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
      <div className={rest === 0 ? 'text-ink-3' : 'text-warn'}>
        {rest === 0 ? 'Adds up.' : rest > 0 ? `${eur(fromCents(rest))} left to place.` : `${eur(fromCents(-rest))} too much.`}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setRows([...rows, { amount: rest > 0 ? fromCents(rest) : '', categoryId: '', shareOf: '', nonCash: false }])}>Add a part</Button>
        <Button size="sm" disabled={!valid || save.isPending} onClick={submit}>Save split</Button>
        {tx.split ? <Button size="sm" variant="outline" disabled={save.isPending} onClick={remove}>Remove split</Button> : null}
        <Button size="sm" variant="ghost" onClick={() => { setRows(initial(tx, null)); setOpen(false); }}>Cancel</Button>
      </div>
    </div>
  );
}
