import { eur, eur0, longDate, shortDate, usePeople, usePeopleMutations } from '@finally/api-client';
import type { PeopleDto, PersonDto } from '@finally/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Big, ErrorNote, LoadingBlock, PageHeader, Panel, PanelTitle, Sub, Track } from '@/components/common';
import { PayoffChart } from '@/components/charts/more-charts';
import { AmountField, Callout, Chip, Seg } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GRID, SPAN } from '@/lib/grid';

export const Route = createFileRoute('/_app/plan/people')({ component: PeoplePage });

function PersonForm({ direction, onClose }: { direction: 'OWE' | 'OWED'; onClose: () => void }): ReactNode {
  const { create } = usePeopleMutations();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{direction === 'OWE' ? 'Someone you owe' : 'Someone who owes you'}</DialogTitle>
          <DialogDescription>{direction === 'OWE' ? 'Add what is left to pay back. Finally works out a date from your monthly amount.' : 'Add what you are waiting for. A reminder is drafted when it has been three weeks.'}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return setErr('Who is it?');
            if (!(Number(amount) > 0)) return setErr('Enter an amount above zero.');
            create.mutate({ name, direction, amount: Number(amount).toFixed(2), note: note.trim() || null }, { onSuccess: () => { toast.success('Added'); onClose(); }, onError: (e2) => setErr(e2 instanceof Error ? e2.message : 'Could not save') });
          }}
        >
          <div className="grid gap-1.5"><Label htmlFor="pp-name">Name</Label><Input id="pp-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="pp-amount">Amount (€)</Label><Input id="pp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="pp-note">What for</Label><Input id="pp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="The rest of her deposit" /></div>
          {err ? <p className="text-[13px] text-bad" role="alert">{err}</p> : null}
          <DialogFooter><Button type="submit" disabled={create.isPending}>Add</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({ person, onClose }: { person: PersonDto; onClose: () => void }): ReactNode {
  const { addPayment } = usePeopleMutations();
  const [amount, setAmount] = useState(person.left);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{person.direction === 'OWE' ? `Paid ${person.name}` : `${person.name} paid you`}</DialogTitle>
          <DialogDescription>Payments that arrive in your accounts are matched automatically; log cash or anything else here.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (Number(amount) > 0) addPayment.mutate({ id: person.id, amount: Number(amount).toFixed(2) }, { onSuccess: () => { toast.success('Logged'); onClose(); } }); }}>
          <div className="grid gap-1.5"><Label htmlFor="pay-amount">Amount (€)</Label><Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          <DialogFooter><Button type="submit" disabled={addPayment.isPending}>Log payment</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OwePerson({ p, onPay }: { p: PersonDto; onPay: () => void }): ReactNode {
  const { remove, removePayment } = usePeopleMutations();
  const done = Number(p.left) <= 0;
  const pctPaid = Number(p.amount) > 0 ? (Number(p.paid) / Number(p.amount)) * 100 : 100;
  return (
    <div className="border-t border-rule py-3 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="font-semibold">{p.name}{p.note ? <span className="font-normal text-ink-3"> · {p.note}</span> : null}</h4>
        <b className="num">{done ? 'Paid back' : eur(p.left)}</b>
      </div>
      <Track value={pctPaid} color="var(--c-eating)" height={8} className="my-2" />
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-2">
        <span>
          {eur(p.paid)} of {eur0(p.amount)} paid
          {!done && p.paidOffOn ? ` · paid off ${longDate(p.paidOffOn)}` : !done ? ' · not scheduled' : ''}
          {!done && p.nextPayment ? ` · ${eur0(p.nextPayment)} next payday` : ''}
        </span>
        <span className="flex gap-1">
          {!done ? <Button size="sm" variant="outline" onClick={onPay}>Log a payment</Button> : null}
          <Button size="sm" variant="ghost" onClick={() => remove.mutate(p.id)}>Remove</Button>
        </span>
      </div>
      {p.payments.length ? (
        <ul className="mt-1.5 text-[12px] text-ink-3">
          {p.payments.slice(0, 3).map((x) => (
            <li key={x.id}>{shortDate(x.paidOn)} · {eur(x.amount)} <button type="button" className="ml-1 underline" onClick={() => removePayment.mutate({ id: p.id, paymentId: x.id })}>undo</button></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function OwedPerson({ p, onPay }: { p: PersonDto; onPay: () => void }): ReactNode {
  const { remove } = usePeopleMutations();
  const done = Number(p.left) <= 0;
  return (
    <div className="border-t border-rule py-3 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="font-semibold">{p.name}{p.note ? <span className="font-normal text-ink-3"> · {p.note}</span> : null}</h4>
        <b className="num">{done ? <Chip tone="ok">Paid</Chip> : eur(p.left)}</b>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-2">
        <span>Since {shortDate(p.since)}{Number(p.paid) > 0 ? ` · ${eur(p.paid)} of ${eur0(p.amount)} received` : ''}</span>
        <span className="flex gap-1">
          {!done ? (
            <>
              <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(p.remindText).then(() => toast.success('Reminder copied. Paste it into a message.'), () => toast.message(p.remindText))}>Copy reminder</Button>
              <Button size="sm" variant="outline" onClick={onPay}>They paid</Button>
            </>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => remove.mutate(p.id)}>Remove</Button>
        </span>
      </div>
    </div>
  );
}

function PlanCard({ d }: { d: PeopleDto }): ReactNode {
  const { plan } = usePeopleMutations();
  const monthly = Number(d.plan.monthly);
  return (
    <Panel className={SPAN[12]}>
      <PanelTitle>Your payoff plan</PanelTitle>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="grid content-start gap-4">
          <AmountField label="Each payday" value={monthly} max={800} step={5} colour="--c-eating" onCommit={(v) => plan.mutate({ monthly: v.toFixed(2) })} />
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-ink-2">Pay first</span>
            <Seg label="Payoff order" value={d.plan.order} onChange={(v) => plan.mutate({ order: v })} options={[['smallest', 'Smallest'], ['largest', 'Largest'], ['custom', 'My order']]} />
          </div>
          <AmountField label="From the December bonus" sub="One-off, on top of the monthly amount" value={Number(d.plan.bonusToDebt)} max={5000} step={50} slider={false} onCommit={(v) => plan.mutate({ bonusToDebt: v.toFixed(2) })} />
        </div>
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-3">Debt-free date</div>
          <Big className="text-[28px]">{d.plan.freeDate ? longDate(d.plan.freeDate) : Number(d.totalOwe) <= 0 ? 'Nothing owed' : 'Not scheduled'}</Big>
          <Sub>{Number(d.totalOwe) > 0 ? (monthly > 0 ? `at ${eur0(monthly)} a month` : 'Give it a monthly amount to get a date.') : 'You are clear.'}</Sub>
          {d.plan.series.length > 1 ? <div className="mt-2"><PayoffChart series={d.plan.series} /></div> : null}
        </div>
      </div>
      {d.plan.order === 'custom' ? <Callout className="mt-3">Custom order follows the order the people were added. Remove and re-add to change who goes first.</Callout> : null}
    </Panel>
  );
}

function PeoplePage() {
  const { data, error, refetch } = usePeople();
  const [adding, setAdding] = useState<'OWE' | 'OWED' | null>(null);
  const [paying, setPaying] = useState<PersonDto | null>(null);
  if (error) return <ErrorNote error={error} retry={() => void refetch()} />;
  if (!data) return <LoadingBlock className="h-96" />;
  return (
    <>
      <PageHeader eyebrow="Money between you and people you know" title="People" lead="What you owe, with a date you will be clear, and what is owed to you, matched when the transfer arrives." />
      <div className={GRID}>
        <Panel className={SPAN[6]}>
          <PanelTitle action={<button type="button" onClick={() => setAdding('OWE')}>+ Add</button>}>You owe <span className="num ml-1 normal-case tracking-normal">{eur(data.totalOwe)}</span></PanelTitle>
          {data.owe.length ? data.owe.map((p) => <OwePerson key={p.id} p={p} onPay={() => setPaying(p)} />) : (
            <p className="text-[13px] text-ink-2">You have not added anyone you owe, and your statement shows no repayments to family or friends. <button type="button" className="font-semibold text-brand" onClick={() => setAdding('OWE')}>Add someone</button></p>
          )}
        </Panel>
        <Panel className={SPAN[6]}>
          <PanelTitle action={<button type="button" onClick={() => setAdding('OWED')}>+ Add</button>}>Owed to you <span className="num ml-1 normal-case tracking-normal">{eur(data.totalOwed)}</span></PanelTitle>
          {data.owed.length ? data.owed.map((p) => <OwedPerson key={p.id} p={p} onPay={() => setPaying(p)} />) : <p className="text-[13px] text-ink-2">Split dinners, fronted tickets, a housemate&apos;s share: add it and Finally matches the repayment when it lands.</p>}
        </Panel>
        {data.owe.length ? <PlanCard d={data} /> : null}
      </div>
      {adding ? <PersonForm direction={adding} onClose={() => setAdding(null)} /> : null}
      {paying ? <PaymentForm person={paying} onClose={() => setPaying(null)} /> : null}
    </>
  );
}
