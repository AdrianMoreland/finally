import { maskText, usePinMutations, usePots, usePotMutations, useAskSuggestions } from '@finally/api-client';
import type { AskResponse, ParsedQueryDto } from '@finally/contracts';
import { useNavigate } from '@tanstack/react-router';
import { Pin, PinOff, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Callout, Chip } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAskPanel, type AskTurn } from '@/lib/ask';
import { cn } from '@/lib/utils';

const SPEND_LABELS: Array<[string, string]> = [
  ['sum', 'How much'],
  ['count', 'How many times'],
  ['average', 'Average a week'],
  ['list', 'List payments'],
  ['top', 'Top spots'],
  ['compare', 'Compare periods'],
  ['biggest', 'Biggest payments'],
];
const SPEND = new Set(SPEND_LABELS.map(([k]) => k));

/** Intent chips are one control; "top" splits into merchants and categories. */
const intentValue = (q: ParsedQueryDto): string => (q.intent === 'top' ? (q.by === 'cat' ? 'topcat' : 'topmer') : q.intent);

function ReadAs({ turn, response }: { turn: AskTurn; response: AskResponse }): ReactNode {
  const { reread } = useAskPanel();
  const q = response.query;
  if (!q || !SPEND.has(q.intent)) {
    return q ? (
      <p className="mt-3 text-[12px] text-ink-3">
        Read as: <b className="font-semibold text-ink-2">{q.intent}</b> · {q.via === 'follow-up' ? 'follow-up to your last question' : q.via === 'learned' ? 'a phrase you taught it' : 'rules, no AI'}
      </p>
    ) : null;
  }
  const change = (patch: Partial<ParsedQueryDto>): void => reread(turn.id, { ...q, ...patch, via: q.via });
  const iv = intentValue(q);
  const periods = response.options.periods;
  return (
    <div className="mt-3 border-t border-dashed border-rule pt-3" aria-label="How Finally read your question">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
        Read as {q.via === 'follow-up' ? '· follow-up' : q.via === 'learned' ? '· learned' : ''}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ChipSelect
          label="Question"
          value={iv}
          options={[...SPEND_LABELS.filter(([k]) => k !== 'top'), ['topmer', 'Top merchants'], ['topcat', 'Top categories']]}
          onChange={(v) => change(v === 'topmer' ? { intent: 'top', by: 'mer' } : v === 'topcat' ? { intent: 'top', by: 'cat' } : { intent: v as ParsedQueryDto['intent'] })}
        />
        <ChipSelect
          label="Category"
          value={q.merchantKey ? '' : (q.slug ?? '')}
          options={[['', 'Any category'], ...response.options.categories.map((c) => [c.slug, c.name] as [string, string])]}
          onChange={(v) => change({ slug: v || null, merchantKey: null })}
        />
        <ChipSelect
          label="Merchant"
          value={q.merchantKey ?? ''}
          options={[['', 'Any merchant'], ...response.options.merchants.slice(0, 200).map((m) => [m.key, m.name] as [string, string])]}
          onChange={(v) => change({ merchantKey: v || null, slug: v ? null : q.slug })}
        />
        <ChipSelect
          label="Period"
          value={q.period?.key ?? 'thismonth'}
          options={periods.map((p) => [p.key, p.label] as [string, string])}
          onChange={(v) => {
            const p = periods.find((x) => x.key === v);
            if (p) change({ period: { ...(q.period ?? { from: '', to: '' }), key: p.key, label: p.label, from: '', to: '' }, periodExplicit: true });
          }}
        />
        {q.intent === 'compare' ? (
          <ChipSelect
            label="Against"
            value={q.period2?.key === 'custom' ? '' : (q.period2?.key ?? '')}
            options={[['', 'The period before'], ...periods.map((p) => [p.key, p.label] as [string, string])]}
            onChange={(v) => {
              const p = periods.find((x) => x.key === v);
              change({ period2: p ? { key: p.key, label: p.label, from: '', to: '' } : undefined });
            }}
          />
        ) : null}
        {q.min != null ? <Chip>over €{q.min}</Chip> : null}
        {q.max != null ? <Chip>under €{q.max}</Chip> : null}
        {q.institution ? <Chip>on {q.institution === 'AIB' ? 'AIB' : 'Revolut'}</Chip> : null}
      </div>
    </div>
  );
}

function ChipSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void }): ReactNode {
  return (
    <Select value={value || '__none'} onValueChange={(v) => onChange(v === '__none' ? '' : v)}>
      <SelectTrigger size="sm" aria-label={label} className="h-7 w-auto gap-1.5 rounded-control border-rule bg-raised px-2.5 text-[12.5px] font-semibold">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v || '__none'} value={v || '__none'}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Answer({ turn }: { turn: AskTurn }): ReactNode {
  const navigate = useNavigate();
  const { setOpen } = useAskPanel();
  const { pin } = usePinMutations();
  const pots = usePots();
  const potMutations = usePotMutations();
  const r = turn.response;
  if (turn.error) return <Callout tone="warn">{turn.error}</Callout>;
  if (turn.pending && !r) return <div className="h-24 animate-pulse rounded-lg bg-raised" aria-busy="true" />;
  if (!r) return null;
  if (!r.query || !r.answer) {
    return (
      <div className="rounded-lg border border-rule bg-surface p-4">
        <p className="font-semibold">I didn&apos;t catch that one.</p>
        <p className="mt-1 text-[13px] text-ink-2">I understand questions about spending, bills, pots, what you owe and tax words. Try one of these:</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.suggestions.map((s) => (
            <SuggestionChip key={s} text={s} />
          ))}
        </div>
      </div>
    );
  }
  const a = r.answer;
  const go = (to: string, extra?: Record<string, unknown>): void => {
    if (a.action?.label === 'Add to wishlist' && extra?.['wish']) {
      const treat = pots.data?.pots.find((p) => p.type === 'TREAT');
      const w = extra['wish'] as { name: string; price: number };
      if (!treat) return void toast.error('Add a Treats pot first');
      potMutations.addWish.mutate({ potId: treat.id, name: w.name, price: String(w.price) }, { onSuccess: () => toast.success(`${w.name} added to your wishlist`) });
      return;
    }
    setOpen(false);
    const [path, qs] = to.split('?');
    void navigate({ to: path as never, ...(qs ? { search: Object.fromEntries(new URLSearchParams(qs)) as never } : {}) });
  };
  const pinnedNow = r.pinned;
  return (
    <div className={cn('rounded-lg border border-rule bg-surface p-4', turn.pending && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">{a.short}</div>
          <div className="num font-display text-[28px] font-medium leading-tight tracking-[-0.01em]">{maskText(a.big)}</div>
        </div>
        {a.tier !== 'rules' ? <Chip tone="ok">{a.tier === 'help' ? 'Help' : 'Public data'}</Chip> : null}
      </div>
      <p className="mt-1 text-[13.5px] text-ink-2">{maskText(a.text)}</p>
      {a.rows?.length ? (
        <div className="mt-2.5 grid gap-0">
          {a.rows.map((row, i) => (
            <div key={i} className="flex justify-between gap-3 border-t border-rule py-1.5 text-[13px] first:border-t-0">
              <span className="min-w-0 truncate">{row.label}</span>
              <b className="num whitespace-nowrap font-semibold">{maskText(row.value)}</b>
            </div>
          ))}
        </div>
      ) : null}
      {a.hint ? (
        <Callout tone="act" className="mt-3">
          {a.hint.count} unsorted payment{a.hint.count > 1 ? 's' : ''} in this period ({a.hint.names.join(', ')}) might be in this category.{' '}
          <button type="button" className="font-semibold text-brand underline" onClick={() => go('/money/sort')}>
            Sort them
          </button>{' '}
          and this answer updates.
        </Callout>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {a.action ? (
          <Button size="sm" variant="outline" onClick={() => go(a.action!.to, a.action!.extra)}>
            {a.action.label}
          </Button>
        ) : null}
        {r.query ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              pinnedNow
                ? void toast.message('Unpin it from Today to remove it')
                : pin.mutate(r.query!.text, { onSuccess: () => toast.success('Pinned to Today') })
            }
            disabled={pin.isPending}
          >
            {pinnedNow ? <PinOff /> : <Pin />}
            {pinnedNow ? 'Pinned' : 'Pin to Today'}
          </Button>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1 text-[12px] text-ink-3" title={a.tier === 'public' ? `Only ${a.sent} was sent to a public data source.` : 'Answered on your own server from your own data. Nothing was sent anywhere else.'}>
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          {a.tier === 'public' ? `Only ${a.sent} sent` : 'Answered on this server · nothing sent'}
        </span>
      </div>
      <ReadAs turn={turn} response={r} />
    </div>
  );
}

function SuggestionChip({ text }: { text: string }): ReactNode {
  const { submit } = useAskPanel();
  return (
    <button type="button" onClick={() => submit(text)} className="rounded-control border border-rule bg-raised px-3 py-1 text-[12.5px] font-medium text-ink-2 hover:border-brand hover:text-brand">
      {text}
    </button>
  );
}

export function AskDialog(): ReactNode {
  const { open, setOpen, thread, submit, clear } = useAskPanel();
  const suggestions = useAskSuggestions();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const lastPending = thread.at(-1)?.pending;

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [thread.length, lastPending]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[88svh] flex-col gap-0 p-0 sm:max-w-[640px]">
        <DialogHeader className="border-b border-rule px-5 py-3.5">
          <DialogTitle className="font-display text-[20px]">Ask Finally</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Spending questions are answered on your own server. Try &ldquo;coffee over 4 last month&rdquo;, then &ldquo;and September?&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-[180px] flex-1 content-start gap-3 overflow-y-auto px-5 py-4" aria-live="polite">
          {thread.length === 0 ? (
            <div>
              <p className="mb-2 text-[13px] text-ink-2">Try one of these:</p>
              <div className="flex flex-wrap gap-1.5">
                {(suggestions.data?.items ?? []).slice(0, 8).map((s) => (
                  <SuggestionChip key={s} text={s} />
                ))}
              </div>
            </div>
          ) : (
            thread.map((t) => (
              <div key={t.id} className="grid gap-2">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-3.5 py-2 text-[13.5px] text-paper">{t.text}</div>
                <Answer turn={t} />
              </div>
            ))
          )}
          <div ref={end} />
        </div>
        <form
          className="flex items-center gap-2 border-t border-rule px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
            setText('');
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={thread.length ? 'Ask a follow-up, such as "and September?"' : 'Ask about your money'} aria-label="Your question" autoFocus />
          <Button type="submit" size="icon" aria-label="Ask">
            <Send />
          </Button>
          {thread.length ? (
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              Clear
            </Button>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
