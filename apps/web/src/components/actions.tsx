import { eur0, maskText, usePeople, useSnooze, useTaxMutations } from '@finally/api-client';
import type { ActionItemDto } from '@finally/contracts';
import { useNavigate } from '@tanstack/react-router';
import { BellOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { SeverityTag } from '@/components/common';
import { Button } from '@/components/ui/button';

/** Runs an action's single button: open a screen, tick a tax item, or copy a reminder to send. */
export function useRunCta(): (a: ActionItemDto) => void {
  const navigate = useNavigate();
  const tax = useTaxMutations();
  const people = usePeople();
  return (a) => {
    const cta = a.cta;
    if (cta.kind === 'go') void navigate({ to: cta.to as never });
    else if (cta.kind === 'check') tax.setCheck.mutate({ itemId: cta.itemId, state: cta.state }, { onSuccess: () => toast.success('Marked as claimed') });
    else {
      const text = people.data?.owed.find((p) => p.id === cta.personId)?.remindText;
      if (!text) return void toast.error('Could not find that reminder');
      void navigator.clipboard.writeText(text).then(
        () => toast.success('Reminder copied. Paste it into a message.'),
        () => toast.message(text),
      );
    }
  };
}

export function ActionRow({ a, noSnooze }: { a: ActionItemDto; noSnooze?: boolean }): ReactNode {
  const run = useRunCta();
  const snooze = useSnooze();
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-t border-rule py-3 first:border-t-0 first:pt-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <SeverityTag severity={a.severity} />
      <div className="min-w-0">
        <h4 className="text-[14.5px] font-semibold leading-snug">{maskText(a.title)}</h4>
        <p className="mt-0.5 text-[13px] text-ink-2">{maskText(a.body)}</p>
      </div>
      <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:justify-end">
        <span className="num text-[13px] font-semibold text-ink-2" title="Money involved">
          {eur0(a.amount)}
        </span>
        <Button size="sm" variant="outline" onClick={() => run(a)}>
          {a.cta.label}
        </Button>
        {noSnooze ? null : (
          <button
            type="button"
            aria-label={`Snooze: ${a.title}`}
            title="Snooze for a week"
            disabled={snooze.isPending}
            onClick={() => snooze.mutate(a.id, { onSuccess: () => toast.message('Snoozed for a week', { description: a.title }) })}
            className="grid size-8 place-items-center rounded-md text-ink-3 hover:bg-raised hover:text-ink"
          >
            <BellOff className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
