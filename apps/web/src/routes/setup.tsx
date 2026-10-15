import {
  eur,
  eur0,
  useAnswer,
  useBillMutations,
  useCompleteSetup,
  useConnections,
  useFound,
  usePatchPrefs,
  usePeople,
  usePotMutations,
  usePots,
  usePrefs,
  useQueue,
  useStartConnection,
} from '@finally/api-client';
import type { CreatePersonBody } from '@finally/contracts';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Check, ChevronLeft } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Callout, Chip, AmountField, Line } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { categoryVar } from '@/lib/category';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/setup')({
  beforeLoad: ({ context }) => {
    if (!context.auth.session) throw redirect({ to: '/login' });
  },
  component: SetupPage,
});

const TITLES = ['How it works', 'Connect banks', 'Reading history', 'What we found', 'Payday', 'Budgets', 'People', 'Payday plan', 'First sorting', 'Notifications', 'Standing orders'];
const BUDGET_ORDER = ['rent', 'bills', 'subscriptions', 'groceries', 'eating-out', 'coffee', 'transport', 'shopping', 'fun', 'other'];
const BUDGET_NAME: Record<string, string> = { rent: 'Rent (your share)', bills: 'Bills', subscriptions: 'Subscriptions', groceries: 'Groceries', 'eating-out': 'Eating out', coffee: 'Coffee', transport: 'Transport', shopping: 'Shopping', fun: 'Fun', other: 'Everything else' };

function Stepper({ step }: { step: number }): ReactNode {
  return (
    <div className="flex items-center gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={TITLES.length} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of ${TITLES.length}: ${TITLES[step]}`}>
      {TITLES.map((t, i) => (
        <i key={t} className={cn('h-1.5 flex-1 rounded-[3px] bg-rule', i <= step && 'bg-fill')} />
      ))}
    </div>
  );
}

function SetupPage() {
  const navigate = useNavigate();
  const found = useFound();
  const connections = useConnections();
  const startConn = useStartConnection();
  const bills = useBillMutations();
  const people = usePeople();
  const pots = usePots();
  const potM = usePotMutations();
  const prefs = usePrefs();
  const patchPrefs = usePatchPrefs();
  const queue = useQueue();
  const answer = useAnswer();
  const complete = useCompleteSetup();

  const [step, setStep] = useState(0);
  const [read, setRead] = useState(0);
  const [payday, setPayday] = useState<number | null>(null);
  const [buffer, setBuffer] = useState(150);
  const [budgets, setBudgets] = useState<Record<string, number> | null>(null);
  const [extra, setExtra] = useState<CreatePersonBody[]>([]);
  const [draft, setDraft] = useState({ name: '', amount: '', direction: 'OWE' as 'OWE' | 'OWED' });
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [notif, setNotif] = useState<{ weekly: boolean; quiet: boolean; ask: boolean } | null>(null);

  const f = found.data;
  const myPayday = payday ?? f?.salary?.day ?? 25;
  const myBudgets = budgets ?? Object.fromEntries(BUDGET_ORDER.map((k) => [k, Number(f?.suggestedBudgets[k] ?? 0)]));
  const myNotif = useMemo(() => notif ?? prefs.data?.notif ?? { weekly: true, quiet: true, ask: true }, [notif, prefs.data?.notif]);

  // The "reading history" step shows progress for a moment, then the counts.
  useEffect(() => {
    if (step !== 2) return;
    setRead(0);
    const t = setInterval(() => setRead((r) => Math.min(100, r + 7)), 90);
    return () => clearInterval(t);
  }, [step]);

  const netPay = Number(f?.salary?.amount ?? 0);
  const fixed = (myBudgets['rent'] ?? 0) + (myBudgets['bills'] ?? 0) + (myBudgets['subscriptions'] ?? 0);
  const flex = BUDGET_ORDER.filter((k) => !['rent', 'bills', 'subscriptions'].includes(k)).reduce((a, k) => a + (myBudgets[k] ?? 0), 0);
  const surplus = netPay - fixed - flex;
  const planned = (pots.data?.pots ?? []).reduce((a, p) => a + Number(p.monthly), 0);

  const last = step === TITLES.length - 1;
  const canNext = step !== 1 || (connections.data?.length ?? 0) > 0;

  const finish = (): void => {
    complete.mutate(
      {
        paydayDayOfMonth: myPayday,
        buffer: buffer.toFixed(2),
        budgets: Object.fromEntries(Object.entries(myBudgets).map(([k, v]) => [k, v.toFixed(2)])),
        people: extra,
        pots: [],
        notif: myNotif,
      },
      { onSuccess: () => { toast.success("You're set up"); void navigate({ to: '/' }); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not finish') },
    );
  };

  const body = useMemo((): ReactNode => {
    switch (step) {
      case 0:
        return (
          <div className="grid gap-4">
            <p className="text-[15px] text-ink-2">Finally reads your accounts, sorts what you spend, and tells you one number each day: what is safe to spend. It never moves money.</p>
            {[['Read-only', 'You set standing orders up at your bank once. Finally checks that they arrive.'], ['Sort once', 'Say what a merchant is a single time and every payment, past and future, follows.'], ['One number', 'Safe to spend is the lower of what your budgets and your balance allow, per day until payday.']].map(([t, d]) => (
              <div key={t} className="rounded-lg border border-rule bg-surface p-3.5"><b>{t}</b><p className="mt-0.5 text-[13.5px] text-ink-2">{d}</p></div>
            ))}
          </div>
        );
      case 1:
        return (
          <div className="grid gap-3">
            <p className="text-[14px] text-ink-2">Your banks, connected through Enable Banking with read-only access. In demo mode your AIB statement is already here.</p>
            {(connections.data ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-rule bg-surface p-3.5"><div><b>{c.institution === 'AIB' ? 'AIB' : 'Revolut'}</b><div className="text-[12.5px] text-ink-3">{c.accountCount} account{c.accountCount === 1 ? '' : 's'} · {c.provider === 'MOCK' ? 'demo data' : 'live'}</div></div><Chip tone="ok"><Check className="size-3" aria-hidden="true" /> Connected</Chip></div>
            ))}
            {!(connections.data ?? []).some((c) => c.institution === 'REVOLUT') ? (
              <Button variant="outline" disabled={startConn.isPending} onClick={() => startConn.mutate({ institution: 'REVOLUT' }, { onSuccess: (r) => { window.location.href = r.url; } })}>Add Revolut</Button>
            ) : null}
          </div>
        );
      case 2:
        return (
          <div className="grid gap-4">
            <div className="h-2.5 overflow-hidden rounded-[3px] bg-raised"><i className="block h-full rounded-[3px] bg-fill transition-[width]" style={{ width: `${read}%` }} /></div>
            {read < 100 ? <p className="text-[14px] text-ink-2">Reading your payment history…</p> : (
              <p className="text-[15px]">Read <b className="num">{f?.payments.toLocaleString('en-IE')}</b> payments across <b>{f?.months}</b> months. Transfers between your own accounts are kept out of spending, and refunds are netted against what they came from.</p>
            )}
          </div>
        );
      case 3:
        return f ? (
          <div className="grid gap-3.5">
            {f.salary ? <FoundRow title="Salary" detail={`${eur(f.salary.amount)} around the ${f.salary.day}th, seen ${f.salary.count} times`} /> : null}
            {f.rent ? <FoundRow title="Rent" detail={`${eur(f.rent.amount)} out around the ${f.rent.day}th, about ${eur0(f.rent.netAmount)} your share after ${f.rent.shareCount} housemate payments`} /> : null}
            {f.housemates.length ? <FoundRow title="Housemates paying you" detail={f.housemates.map((h) => `${h.name} ${eur0(h.total)}`).join(', ')} /> : null}
            {f.ownTransfers ? <FoundRow title="Your own transfers" detail={`${f.ownTransfers} moves between your accounts, kept out of spending`} /> : null}
            <div className="rounded-lg border border-rule bg-surface p-3.5">
              <b>Repeating payments</b>
              <p className="mb-1 text-[12.5px] text-ink-3">Untick anything that is not really a bill.</p>
              {f.bills.map((b) => (
                <label key={b.id} className="flex items-center justify-between gap-3 border-t border-rule py-2 text-[13.5px] first:border-t-0">
                  <span>{b.name} <span className="text-ink-3">· {b.kind} · around the {b.usualDay}th</span></span>
                  <span className="flex items-center gap-3"><b className="num">{eur(b.amount)}</b>
                    <Switch checked={!ignored.has(b.id)} onCheckedChange={(on) => { setIgnored((s) => { const n = new Set(s); if (on) n.delete(b.id); else n.add(b.id); return n; }); bills.cancel.mutate({ id: b.id, cancelled: !on }); }} aria-label={`Include ${b.name}`} />
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : null;
      case 4:
        return (
          <div className="grid gap-5">
            <AmountField label="Payday" sub={f?.salary ? `Your last pay landed on the ${f.salary.day}th. A weekend payday moves to the Friday before.` : 'The day of the month your pay arrives'} value={myPayday} min={1} max={31} step={1} prefix="" onCommit={(v) => setPayday(Math.round(v))} />
            <AmountField label="Buffer you never want to dip into" sub="Kept out of safe to spend" value={buffer} min={0} max={1000} step={25} onCommit={setBuffer} />
          </div>
        );
      case 5:
        return (
          <div className="grid gap-4">
            <p className="text-[13.5px] text-ink-2">The middle month of your last three, rounded up to the next €5. Change any of them.</p>
            {BUDGET_ORDER.map((k) => (
              <AmountField key={k} label={BUDGET_NAME[k] ?? k} value={myBudgets[k] ?? 0} max={Math.max(500, (myBudgets[k] ?? 0) * 2)} slider={false} step={5} onCommit={(v) => setBudgets({ ...myBudgets, [k]: v })} />
            ))}
            <Line label="Fixed + flexible" value={`${eur0(fixed + flex)} of ${eur0(netPay)} pay`} strong />
          </div>
        );
      case 6:
        return (
          <div className="grid gap-3">
            <p className="text-[13.5px] text-ink-2">Anyone you owe, or who owes you? This is what makes the paying-back plan and reminders work. Skip it if not.</p>
            {(people.data?.owe ?? []).concat(people.data?.owed ?? []).map((p) => <FoundRow key={p.id} title={p.name} detail={`${p.direction === 'OWE' ? 'You owe' : 'Owes you'} ${eur(p.left)}${p.note ? ` · ${p.note}` : ''}`} />)}
            {extra.map((p, i) => <FoundRow key={i} title={p.name} detail={`${p.direction === 'OWE' ? 'You owe' : 'Owes you'} ${eur(p.amount)}`} />)}
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!draft.name.trim() || !(Number(draft.amount) > 0)) return; setExtra((x) => [...x, { name: draft.name.trim(), amount: Number(draft.amount).toFixed(2), direction: draft.direction, note: null, merchantKey: null }]); setDraft({ name: '', amount: '', direction: draft.direction }); }}>
              <Input aria-label="Name" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-[150px]" />
              <Input aria-label="Amount" inputMode="decimal" placeholder="€" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className="w-[90px]" />
              <Button type="button" variant="outline" onClick={() => setDraft({ ...draft, direction: draft.direction === 'OWE' ? 'OWED' : 'OWE' })}>{draft.direction === 'OWE' ? 'I owe them' : 'They owe me'}</Button>
              <Button type="submit">Add</Button>
            </form>
          </div>
        );
      case 7:
        return (
          <div className="grid gap-4">
            <p className="text-[13.5px] text-ink-2">After your budgets, {eur0(surplus)} is left each payday. Pay yourself first.</p>
            {(pots.data?.pots ?? []).map((p) => (
              <AmountField key={p.id} label={p.name} value={Number(p.monthly)} max={Math.max(500, Math.round(surplus))} step={5} onCommit={(v) => potM.update.mutate({ id: p.id, monthly: v.toFixed(2) })} />
            ))}
            <Line label="Planned" value={`${eur0(planned)} of ${eur0(surplus)}`} strong tone={planned > surplus ? 'warn' : undefined} />
          </div>
        );
      case 8: {
        const items = (queue.data?.items ?? []).slice(0, 3);
        return items.length ? (
          <div className="grid gap-3">
            <p className="text-[13.5px] text-ink-2">A few merchants Finally could not place. One tap each.</p>
            {items.map((r) => (
              <div key={r.id} className="rounded-lg border border-rule bg-surface p-3.5">
                <div className="flex justify-between"><b>{r.displayName}</b><span className="num">{eur(r.amount)}</span></div>
                <span className="raw-marker mt-1">{r.rawDescriptor}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.suggestedCategories.slice(0, 3).map((c) => (
                    <button key={c.id} type="button" disabled={answer.isPending} onClick={() => answer.mutate({ requestId: r.id, categoryId: c.id, scope: 'merchant' })} className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-raised px-3 py-1 text-[13px] font-semibold hover:border-brand"><i className="size-2 rounded-full" style={{ background: categoryVar(c) }} />{c.name}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-[14px] text-good">Everything is sorted already.</p>;
      }
      case 9:
        return (
          <div className="grid gap-1">
            {([['ask', 'Ask me about new merchants', 'A notification with buttons, answered without opening the app'], ['weekly', 'Weekly review reminder', 'Sunday at 19:00, about five minutes'], ['quiet', 'Quiet hours', 'No notifications between 22:00 and 08:00']] as const).map(([k, l, d]) => (
              <label key={k} className="flex items-center justify-between gap-3 border-t border-rule py-3 first:border-t-0"><span><b>{l}</b><small className="block text-[12.5px] text-ink-3">{d}</small></span><Switch checked={myNotif[k]} onCheckedChange={(v) => { const n = { ...myNotif, [k]: v }; setNotif(n); patchPrefs.mutate({ notif: n }); }} aria-label={l} /></label>
            ))}
            <Callout className="mt-3">Privacy: your bank data stays between your bank, Enable Banking and your own Finally server. Spending questions are answered there. The eye button at the top hides every amount when someone is looking.</Callout>
          </div>
        );
      default:
        return (
          <div className="grid gap-3">
            <p className="text-[13.5px] text-ink-2">Set these up once in your bank. Finally never moves money; it ticks each one off when the transfer lands.</p>
            {(pots.data?.pots ?? []).filter((p) => Number(p.monthly) > 0).map((p) => <FoundRow key={p.id} title={`${p.name}: ${eur0(p.monthly)}`} detail={`Each payday, AIB → ${p.linkedAccountName ?? `Revolut · ${p.name} vault`}`} />)}
            {(pots.data?.pots ?? []).every((p) => Number(p.monthly) <= 0) ? <p className="text-[13px] text-ink-2">No standing orders needed yet. Give a pot an amount in the Payday plan and it will appear there.</p> : null}
          </div>
        );
    }
  }, [step, f, connections.data, startConn, read, myPayday, buffer, myBudgets, fixed, flex, netPay, people.data, extra, draft, surplus, pots.data, potM, planned, queue.data, answer, ignored, myNotif, patchPrefs, bills]);

  return (
    <main className="mx-auto grid min-h-svh max-w-[640px] content-start gap-5 px-5 py-6">
      <header className="flex items-center gap-3">
        {step > 0 ? <button type="button" aria-label="Back" onClick={() => setStep((s) => s - 1)} className="grid size-9 place-items-center rounded-full border border-rule"><ChevronLeft className="size-4" aria-hidden="true" /></button> : <span className="size-9" />}
        <div className="flex-1"><Stepper step={step} /></div>
        <button type="button" className="text-[13px] font-semibold text-ink-3 hover:text-ink" onClick={() => void navigate({ to: '/' })}>Not now</button>
      </header>
      <div>
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">Step {step + 1} of {TITLES.length}</div>
        <h1 className="font-display text-[30px] font-medium leading-tight tracking-[-0.01em]">{TITLES[step]}</h1>
      </div>
      <section>{body}</section>
      <footer className="flex justify-end gap-2 pb-6">
        {last ? (
          <Button size="lg" onClick={finish} disabled={complete.isPending}>Finish setup</Button>
        ) : (
          <Button size="lg" onClick={() => setStep((s) => s + 1)} disabled={!canNext || (step === 2 && read < 100) || (step === 3 && !f)}>Continue</Button>
        )}
      </footer>
    </main>
  );
}

function FoundRow({ title, detail }: { title: string; detail: string }): ReactNode {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-rule bg-surface p-3.5">
      <span className="mt-0.5 grid size-5 flex-none place-items-center rounded-full bg-fill text-on-fill"><Check className="size-3" aria-hidden="true" /></span>
      <div><b>{title}</b><p className="text-[13px] text-ink-2">{detail}</p></div>
    </div>
  );
}
