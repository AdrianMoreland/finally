import { eur, eur0, shortDate, useAccounts, useGoalMutations, useGoals } from '@finally/api-client';
import { createGoalBody } from '@finally/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { EmptyState, ErrorNote, LoadingBlock, PageHeader, Panel, Track } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GRID, SPAN } from '@/lib/grid';

export const Route = createFileRoute('/_app/goals')({ component: GoalsPage });

type FormIn = z.input<typeof createGoalBody>;

function GoalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }): ReactNode {
  const accounts = useAccounts();
  const { create } = useGoalMutations();
  const form = useForm<FormIn, unknown, z.output<typeof createGoalBody>>({
    resolver: zodResolver(createGoalBody),
    defaultValues: { name: '', target: '', targetDate: '', accountId: null, saved: '0.00' },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit((values) => {
    create.mutate(values, {
      onSuccess: () => {
        toast.success('Goal added');
        form.reset();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add the goal'),
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>New goal</DialogTitle>
          <DialogDescription>Link an account such as a Revolut vault and the saved amount follows its balance.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="g-name">Name</Label>
            <Input id="g-name" {...form.register('name')} aria-invalid={!!errors.name} />
            {errors.name ? <p className="text-[12.5px] text-bad">{errors.name.message}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="g-target">Target (€)</Label>
              <Input id="g-target" inputMode="decimal" placeholder="5000" {...form.register('target')} aria-invalid={!!errors.target} />
              {errors.target ? <p className="text-[12.5px] text-bad">Enter an amount like 5000 or 5000.00</p> : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="g-date">Target date</Label>
              <Input id="g-date" type="date" {...form.register('targetDate')} aria-invalid={!!errors.targetDate} />
              {errors.targetDate ? <p className="text-[12.5px] text-bad">Pick a date</p> : null}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="g-acct">Linked account (optional)</Label>
            <Select value={form.watch('accountId') ?? 'none'} onValueChange={(v) => form.setValue('accountId', v === 'none' ? null : v)}>
              <SelectTrigger id="g-acct"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked</SelectItem>
                {accounts.data?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Add goal'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GoalsPage() {
  const goals = useGoals();
  const { remove } = useGoalMutations();
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Linked to Revolut vaults"
        title="Goals"
        right={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden="true" /> New goal
          </Button>
        }
      />
      {goals.error ? (
        <ErrorNote error={goals.error} retry={() => void goals.refetch()} />
      ) : goals.isLoading ? (
        <LoadingBlock className="h-48" />
      ) : goals.data?.length === 0 ? (
        <EmptyState title="No goals yet">Add one to see how much to put aside each month.</EmptyState>
      ) : (
        <div className={GRID}>
          {goals.data?.map((g) => (
            <Panel key={g.id} className={SPAN[6]}>
              <div className="grid gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-[16px] font-semibold">{g.name}</h2>
                  <button
                    type="button"
                    aria-label={`Delete ${g.name}`}
                    className="text-ink-3 hover:text-bad"
                    onClick={() => remove.mutate(g.id, { onSuccess: () => toast.success('Goal removed') })}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="num font-display text-[34px] font-bold leading-none tracking-[-0.02em]">
                  {eur(g.saved)}{' '}
                  <span className="font-body text-[14px] font-medium tracking-normal text-ink-2">of {eur0(g.target)}</span>
                </div>
                <Track value={g.progress} />
                <div className="grid gap-2 text-[13px]">
                  <div className="flex justify-between gap-2"><span>Target date</span><b className="num">{shortDate(g.targetDate)} {g.targetDate.slice(0, 4)}</b></div>
                  <div className="flex justify-between gap-2 border-t border-rule pt-2"><span>Needed each month</span><b className="num">{eur0(g.monthlyNeeded)}</b></div>
                  <div className="flex justify-between gap-2 border-t border-rule pt-2"><span>Months left</span><b className="num">{g.monthsLeft}</b></div>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
      <GoalDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
