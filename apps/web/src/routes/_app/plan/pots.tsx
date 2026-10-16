import { eur, eur0, shortDate, usePotMutations, usePots } from '@finally/api-client';
import { runwayMonths } from '@finally/finance-core';
import type { PotDto, PotsDto } from '@finally/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ErrorNote, LoadingBlock, PageHeader, Panel, PanelTitle, Track } from '@/components/common';
import { AmountField, Callout, Chip } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GRID, SPAN } from '@/lib/grid';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/plan/pots')({ component: PotsPage });

const TYPE: Record<PotDto['type'], { label: string; colour: string; blurb: string }> = {
  SAFETY: { label: 'Safety', colour: '--brand', blurb: 'Three months of essentials, so a surprise bill never forces you to sell anything.' },
  PLANNED: { label: 'Planned spend', colour: '--c-subs', blurb: 'Christmas, a trip, an annual bill: a target, a date and a monthly amount.' },
  TREAT: { label: 'Treat', colour: '--c-fun', blurb: 'Money for wants. A wishlist item over €100 waits 30 days before you can buy it.' },
  INVESTING: { label: 'Investing', colour: '--c-transport', blurb: 'What goes into investments, ready for the Investment Account on 1 July 2027.' },
};

function Ladder({ ladder }: { ladder: PotsDto['ladder'] }): ReactNode {
  return (
    <Panel className={SPAN[12]}>
      <PanelTitle>Your money ladder</PanelTitle>
      <ol className="grid gap-0">
        {ladder.rungs.map((r, i) => (
          <li key={r.key} className={cn('grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-t border-rule py-2.5 first:border-t-0', i === ladder.current && 'rounded-lg bg-brand-soft px-2')}>
            <span className={cn('grid size-6 place-items-center rounded-full border text-[11px] font-bold', r.done ? 'border-brand bg-fill text-on-fill' : i === ladder.current ? 'border-ink bg-ink text-paper' : 'border-ink-3 text-ink-3')}>
              {r.done ? '✓' : i + 1}
            </span>
            <div className="min-w-0">
              <div className={cn('text-[14px] font-semibold', r.done && 'text-ink-2')}>{r.title}</div>
              <div className="text-[12.5px] text-ink-3">{r.when}</div>
            </div>
            {r.left && Number(r.left) > 0 && !r.done ? <b className="num text-[13px]">{eur0(r.left)} to go</b> : null}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[12px] text-ink-3">Each rung shows its date at your current plan, so changing a monthly amount moves them.</p>
    </Panel>
  );
}

function PotCard({ pot, onEdit, onMonthly }: { pot: PotDto; onEdit: () => void; onMonthly: (v: number) => void }): ReactNode {
  const t = TYPE[pot.type];
  const target = pot.effectiveTarget ? Number(pot.effectiveTarget) : null;
  return (
    <Panel className={SPAN[6]}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><i className="size-2.5 rounded-[2px]" style={{ background: `var(${t.colour})` }} /><h3 className="text-[16px] font-semibold">{pot.name}</h3></div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
            <Chip>{t.label}</Chip>
            {pot.linkedAccountName ? <Chip>Revolut vault · {pot.linkedAccountName}</Chip> : <Chip>Revolut vault</Chip>}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="num font-display text-[28px] font-medium leading-none">{eur(pot.balance)}</span>
        {target ? <span className="text-[13px] text-ink-3">of {eur0(target)}</span> : null}
      </div>
      {target ? <Track value={pot.progress} color={`var(${t.colour})`} height={10} className="my-3" /> : null}
      <div className="text-[13px] text-ink-2">
        {pot.type === 'SAFETY' ? <>Three months of essentials on <b>{pot.reachText || 'when you add a monthly amount'}</b>.</> : target ? <>Reaches its target on <b>{pot.reachText}</b>{pot.targetDate ? `; you want it by ${shortDate(pot.targetDate)}` : ''}.</> : 'No target set.'}
      </div>
      {pot.status?.late ? (
        <Callout tone="act" className="mt-3">
          Lands after your date. {eur0(Math.ceil(Number(pot.status.need)))} a month makes it in time; you put in {eur0(pot.monthly)}.
        </Callout>
      ) : pot.status ? (
        <Chip tone="ok" className="mt-3">On track for {pot.targetDate ? shortDate(pot.targetDate) : 'your date'}</Chip>
      ) : null}
      <div className="mt-4">
        <AmountField label="Each payday" value={Number(pot.monthly)} onCommit={onMonthly} max={800} step={5} colour={t.colour} />
      </div>
    </Panel>
  );
}

function PotForm({ initial, vaults, onClose }: { initial: PotDto | null; vaults: PotsDto['linkableAccounts']; onClose: () => void }): ReactNode {
  const { create, update, remove } = usePotMutations();
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<PotDto['type']>(initial?.type ?? 'PLANNED');
  const [target, setTarget] = useState(initial?.target ? String(Number(initial.target)) : '');
  const [date, setDate] = useState(initial?.targetDate ?? '');
  const [monthly, setMonthly] = useState(initial ? String(Number(initial.monthly)) : '0');
  const [balance, setBalance] = useState(initial ? String(Number(initial.balance)) : '0');
  const [account, setAccount] = useState(initial?.accountId ?? '');
  const [err, setErr] = useState<string | null>(null);

  const submit = (): void => {
    if (!name.trim()) return setErr('Give the pot a name.');
    if (type === 'PLANNED' && (!target || !date)) return setErr('A planned spend needs a target and a date.');
    const body = {
      name: name.trim(),
      type,
      target: type === 'SAFETY' ? null : target ? Number(target).toFixed(2) : null,
      targetDate: type === 'PLANNED' || type === 'INVESTING' ? date || null : null,
      monthly: Number(monthly || 0).toFixed(2),
      balance: Number(balance || 0).toFixed(2),
      accountId: account || null,
    };
    const done = { onSuccess: () => { toast.success(initial ? 'Pot saved' : 'Pot created'); onClose(); }, onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Could not save') };
    if (initial) update.mutate({ id: initial.id, ...body }, done);
    else create.mutate(body, done);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit pot' : 'New pot'}</DialogTitle>
          <DialogDescription>{TYPE[type].blurb}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <div className="grid gap-1.5"><Label htmlFor="pot-name">Name</Label><Input id="pot-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Christmas" /></div>
          <div className="grid gap-1.5">
            <Label htmlFor="pot-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as PotDto['type'])}>
              <SelectTrigger id="pot-type"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(TYPE) as Array<PotDto['type']>).map((k) => <SelectItem key={k} value={k}>{TYPE[k].label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {type !== 'SAFETY' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label htmlFor="pot-target">Target (€)</Label><Input id="pot-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="600" /></div>
              {type !== 'TREAT' ? <div className="grid gap-1.5"><Label htmlFor="pot-date">By</Label><Input id="pot-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div> : null}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="pot-monthly">Each payday (€)</Label><Input id="pot-monthly" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></div>
            {!account ? <div className="grid gap-1.5"><Label htmlFor="pot-balance">Balance now (€)</Label><Input id="pot-balance" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} /></div> : null}
          </div>
          {vaults.length ? (
            <div className="grid gap-1.5">
              <Label htmlFor="pot-vault">Revolut vault</Label>
              <Select value={account || 'none'} onValueChange={(v) => setAccount(v === 'none' ? '' : v)}>
                <SelectTrigger id="pot-vault"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Not linked</SelectItem>{vaults.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} · {eur(v.balance)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : null}
          {err ? <p className="text-[13px] text-bad" role="alert">{err}</p> : null}
          <DialogFooter className="gap-2 sm:justify-between">
            {initial ? <Button type="button" variant="ghost" onClick={() => remove.mutate(initial.id, { onSuccess: () => { toast.success('Pot removed'); onClose(); } })}>Remove</Button> : <span />}
            <Button type="submit" disabled={create.isPending || update.isPending}>{initial ? 'Save' : 'Create pot'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Wishlist({ data }: { data: PotsDto }): ReactNode {
  const { addWish, setBought, removeWish } = usePotMutations();
  const treat = data.pots.find((p) => p.type === 'TREAT');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  if (!treat) return null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Panel className={SPAN[12]}>
      <PanelTitle>Wishlist <span className="text-[12px] normal-case tracking-normal text-ink-3">inside {treat.name}</span></PanelTitle>
      <form
        className="mb-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !(Number(price) > 0)) return;
          addWish.mutate({ potId: treat.id, name, price: Number(price).toFixed(2) }, { onSuccess: () => { setName(''); setPrice(''); toast.success('Added to your wishlist'); } });
        }}
      >
        <div className="grid gap-1"><Label htmlFor="w-name" className="text-[12px]">Item</Label><Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Headphones" className="w-[220px]" /></div>
        <div className="grid gap-1"><Label htmlFor="w-price" className="text-[12px]">Price (€)</Label><Input id="w-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="300" className="w-[110px]" /></div>
        <Button type="submit" variant="outline" disabled={addWish.isPending}><Plus /> Add</Button>
      </form>
      {data.wishlist.length === 0 ? <p className="text-[13px] text-ink-2">Nothing on the list. Anything over €100 waits 30 days before you can buy it.</p> : null}
      {data.wishlist.map((w) => {
        const locked = !w.boughtOn && w.unlocksOn > today;
        return (
          <div key={w.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-rule py-2.5 first:border-t-0">
            <div className="min-w-0">
              <div className={cn('font-semibold', w.boughtOn && 'text-ink-3 line-through')}>{w.name}</div>
              <div className="text-[12px] text-ink-3">
                {w.boughtOn ? `Bought ${shortDate(w.boughtOn)}` : locked ? `Wait until ${shortDate(w.unlocksOn)}` : w.affordableOn ? (w.affordableOn <= today ? 'You can afford it now' : `Affordable on ${shortDate(w.affordableOn)}`) : 'Add a monthly amount to Treats'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <b className="num">{eur(w.price)}</b>
              {!w.boughtOn ? <Button size="sm" variant="outline" disabled={locked} title={locked ? '30-day wait' : undefined} onClick={() => setBought.mutate({ id: w.id, bought: true })}>Bought</Button> : null}
              <Button size="sm" variant="ghost" onClick={() => removeWish.mutate(w.id)}>Remove</Button>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

/** "If your pay stopped tomorrow" and the checks before dipping into the rainy-day pot. */
function RainyExtras({ data }: { data: PotsDto }): ReactNode {
  const r = data.runway;
  const { refill, undoRefill } = usePotMutations();
  const [cut, setCut] = useState(30);
  if (!r.rainyId) return null;
  const pool = Number(r.rainyBalance) + Number(r.accounts);
  const { months, need } = runwayMonths({ pool: pool.toFixed(2), fixedBudget: r.fixedBudget, flexBudget: r.flexBudget, cutPct: cut });
  const pending = r.refills.find((x) => x.potId === r.rainyId);
  const take = 150;
  const rainyId = r.rainyId;
  return (
    <>
      <Panel className={SPAN[7]}>
        <PanelTitle>If your pay stopped tomorrow</PanelTitle>
        <label className="grid gap-1.5 text-[13px]">
          <span className="flex justify-between"><span>Cut flexible spending by</span><b className="num">{cut}%</b></span>
          <input
            type="range"
            min={0}
            max={80}
            step={5}
            value={cut}
            onChange={(e) => setCut(Number(e.target.value))}
            style={{ '--p': `${(cut / 80) * 100}%`, '--tone': 'var(--pink)' } as React.CSSProperties}
            aria-label="Cut flexible spending by"
          />
        </label>
        <div className="num mt-3.5 font-display text-[36px] font-medium leading-none">
          {months}
          <small className="ml-1.5 text-[16px] font-medium text-ink-2">months</small>
        </div>
        <p className="mt-1.5 text-[13px] text-ink-2">
          Rainy day plus your accounts ({eur(pool)}) at {eur0(need)} a month, with flexible spending cut by {cut}%.
          {r.rentOwn ? ` Rent stays at your share, ${eur0(r.rentOwn)}, while the people you live with keep paying theirs.` : ''} Jobseeker&apos;s Benefit would come on top.
        </p>
      </Panel>
      <Panel className={SPAN[5]}>
        <PanelTitle>Before you take money out of Rainy day</PanelTitle>
        <ol className="grid gap-2.5">
          {(
            [
              ['Is it unexpected?', 'Christmas and trips home belong in their own pots.'],
              ['Is it necessary?', 'Rent, health, getting to work, a phone you need.'],
              ['Is it urgent?', `Could it wait until payday on ${shortDate(r.nextPayday)}?`],
            ] as const
          ).map(([q, a], i) => (
            <li key={q} className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-2.5 text-[13.5px]">
              <span className="grid size-6 place-items-center rounded-full border border-ink-3 text-[11px] font-bold text-ink-2">{i + 1}</span>
              <span>
                {q}
                <small className="block text-[12px] text-ink-3">{a}</small>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={Number(r.rainyBalance) < take || refill.isPending}
            onClick={() =>
              refill.mutate(
                { id: rainyId, amount: take.toFixed(2) },
                {
                  onSuccess: () =>
                    toast(`Took ${eur0(take)} from Rainy day. A ${eur0(take)} refill is added to your next payday.`, {
                      description: 'Finally cannot move money: take it out in Revolut yourself.',
                      action: { label: 'Undo', onClick: () => undoRefill.mutate(rainyId) },
                    }),
                },
              )
            }
          >
            Take out {eur0(take)} for an emergency
          </Button>
        </div>
        <p className="mt-2 border-t border-dashed border-rule pt-2 text-[12px] text-ink-3">
          {pending ? `${eur0(pending.amount)} taken out. A refill of the same is added to your next payday.` : 'After a withdrawal, Finally adds a refill to your next payday.'}
        </p>
      </Panel>
    </>
  );
}

function PotsPage() {
  const { data, error, refetch } = usePots();
  const { update } = usePotMutations();
  const [editing, setEditing] = useState<PotDto | 'new' | null>(null);
  if (error) return <ErrorNote error={error} retry={() => void refetch()} />;
  if (!data) return <LoadingBlock className="h-96" />;
  return (
    <>
      <PageHeader
        eyebrow={`${eur(data.total)} set aside`}
        title="Pots"
        lead="Rainy day, planned spends, treats and investing are all one thing: money set aside, with a target, a date and a monthly amount."
        right={<Button onClick={() => setEditing('new')}><Plus /> New pot</Button>}
      />
      <div className={GRID}>
        <Ladder ladder={data.ladder} />
        {data.pots.map((p) => (
          <PotCard key={p.id} pot={p} onEdit={() => setEditing(p)} onMonthly={(v) => update.mutate({ id: p.id, monthly: v.toFixed(2) })} />
        ))}
        <RainyExtras data={data} />
        <Wishlist data={data} />
      </div>
      {editing ? <PotForm initial={editing === 'new' ? null : editing} vaults={data.linkableAccounts} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
