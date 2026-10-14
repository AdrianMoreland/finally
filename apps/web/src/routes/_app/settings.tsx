import {
  ApiError,
  eur,
  shortDate,
  useAccounts,
  useApi,
  useCategories,
  useConnections,
  useImportCsv,
  useMe,
  useRemoveConnection,
  useRules,
  useStartConnection,
  useSyncConnection,
  useUpdateMe,
  clockTime,
  invalidateMoney,
  keys,
} from '@finally/api-client';
import type { CategoryDto, ConnectionDto, Institution, Me } from '@finally/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Disclaimer, ErrorNote, KeyValue, LoadingBlock, PageHeader, Panel, PanelTitle, CategoryChip } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/lib/auth';
import { GRID, SPAN } from '@/lib/grid';
import { downloadBlob, enableWebPush, pushSupported } from '@/lib/push';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/settings')({ component: SettingsPage });

const BANK_COLOUR: Record<Institution, string> = { AIB: '#6D2077', REVOLUT: '#191C1F' };
const STATUS_TEXT: Record<ConnectionDto['status'], string> = {
  ACTIVE: 'Connected',
  EXPIRING: 'Consent expires soon',
  EXPIRED: 'Not linked / expired',
  ERROR: 'Last sync failed',
};

/* ------------------------------------------------------------- connections */

function ConnectionRow({ c }: { c: ConnectionDto }): ReactNode {
  const sync = useSyncConnection();
  const start = useStartConnection();
  const remove = useRemoveConnection();
  const linked = c.lastSyncAt !== null || c.status === 'ACTIVE' || c.status === 'EXPIRING';
  const bad = c.status === 'EXPIRING' || c.status === 'EXPIRED' || c.status === 'ERROR';

  const relink = (): void =>
    start.mutate(
      { institution: c.institution, returnTo: 'web' },
      { onSuccess: (r) => (window.location.href = r.url), onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not start linking') },
    );

  return (
    <div className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-t border-rule py-3 first:border-t-0 first:pt-0">
      <div className="grid size-10 place-items-center rounded-[10px] font-display text-[13px] font-bold text-white" style={{ background: BANK_COLOUR[c.institution] }}>
        {c.institution === 'AIB' ? 'AIB' : 'R'}
      </div>
      <div className="min-w-0">
        <b className="font-semibold">{c.institution === 'AIB' ? 'AIB' : 'Revolut'}</b>
        <div className={cn('text-[12.5px] text-ink-2', bad && 'text-warn')}>
          {STATUS_TEXT[c.status]}
          {c.validUntil ? ` · consent valid until ${shortDate(c.validUntil)} ${c.validUntil.slice(0, 4)}` : ''}
          {c.lastSyncAt ? ` · last sync ${clockTime(c.lastSyncAt)}` : ''} · {c.accountCount} account{c.accountCount === 1 ? '' : 's'}
          {c.provider === 'MOCK' ? ' · sample data' : ''}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-1.5">
        {linked ? (
          <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(c.id, { onSuccess: (r) => toast.success(r.status === 'OK' ? `${r.newTxCount} new payment${r.newTxCount === 1 ? '' : 's'}` : (r.error ?? 'Sync failed')) })}>
            {sync.isPending ? 'Syncing…' : 'Sync now'}
          </Button>
        ) : null}
        <Button size="sm" variant={bad ? 'default' : 'outline'} disabled={start.isPending} onClick={relink}>
          {linked ? 'Re-link' : 'Link'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Remove ${c.institution}`}
          onClick={() => {
            if (window.confirm(`Remove ${c.institution}? Its accounts and payments are deleted from Finally (not from the bank).`)) remove.mutate(c.id, { onSuccess: () => toast.success('Connection removed') });
          }}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function ConnectionsCard(): ReactNode {
  const conns = useConnections();
  const accounts = useAccounts();
  const api = useApi();
  const qc = useQueryClient();
  const start = useStartConnection();
  const importCsv = useImportCsv();
  const fileRef = useRef<HTMLInputElement>(null);
  const [institution, setInstitution] = useState<Institution>('AIB');

  const missing = (['AIB', 'REVOLUT'] as const).filter((i) => !conns.data?.some((c) => c.institution === i));
  const toggle = useMutation({
    mutationFn: (v: { id: string; on: boolean }) => api.setAccountNetWorth(v.id, v.on),
    onSuccess: () => invalidateMoney(qc),
  });

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const csv = await file.text();
    importCsv.mutate(
      { institution, csv },
      {
        onSuccess: (r) => toast.success(`${r.imported} imported, ${r.duplicates} already there${r.skipped ? `, ${r.skipped} skipped` : ''}`),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not read that file'),
      },
    );
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Panel className={SPAN[7]}>
      <PanelTitle>Bank connections</PanelTitle>
      {conns.isLoading ? <LoadingBlock className="h-28" /> : null}
      {conns.data?.map((c) => <ConnectionRow key={c.id} c={c} />)}
      {missing.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-rule pt-3">
          {missing.map((i) => (
            <Button key={i} variant="outline" size="sm" disabled={start.isPending} onClick={() => start.mutate({ institution: i, returnTo: 'web' }, { onSuccess: (r) => (window.location.href = r.url) })}>
              Link {i === 'AIB' ? 'AIB' : 'Revolut'}
            </Button>
          ))}
        </div>
      ) : null}
      <Disclaimer>Banks ask you to re-approve read-only access every 180 days. Finally reminds you a week before.</Disclaimer>

      <div className="mt-4 border-t border-rule pt-4">
        <h4 className="mb-2 text-[13px] font-semibold">Import a statement (CSV)</h4>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={institution} onValueChange={(v) => setInstitution(v as Institution)}>
            <SelectTrigger size="sm" className="w-[130px]" aria-label="Statement from"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="AIB">AIB export</SelectItem>
              <SelectItem value="REVOLUT">Revolut export</SelectItem>
            </SelectContent>
          </Select>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Choose a CSV file" />
          <Button size="sm" variant="outline" disabled={importCsv.isPending} onClick={() => fileRef.current?.click()}>
            {importCsv.isPending ? 'Importing…' : 'Choose CSV file'}
          </Button>
        </div>
      </div>

      {accounts.data?.length ? (
        <div className="mt-4 border-t border-rule pt-4">
          <h4 className="mb-2 text-[13px] font-semibold">Accounts in net worth</h4>
          <div className="grid gap-2">
            {accounts.data.map((a) => (
              <label key={a.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span>{a.name} <span className="num text-ink-3">{eur(a.balance)}</span></span>
                <Switch checked={a.includeInNetWorth} onCheckedChange={(on) => toggle.mutate({ id: a.id, on })} aria-label={`Include ${a.name} in net worth`} />
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

/* ----------------------------------------------------------- notifications */

function NotificationsCard({ me }: { me: Me }): ReactNode {
  const api = useApi();
  const update = useUpdateMe();
  const [start, setStart] = useState(me.quietHoursStart);
  const [end, setEnd] = useState(me.quietHoursEnd);
  useEffect(() => {
    setStart(me.quietHoursStart);
    setEnd(me.quietHoursEnd);
  }, [me.quietHoursStart, me.quietHoursEnd]);

  const enable = useMutation({ mutationFn: () => enableWebPush(api) });
  const test = useMutation({
    mutationFn: () => api.testNotification(),
    onSuccess: async (r) => {
      if (r.sent === 0 && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(r.sample.title, { body: r.sample.body, icon: '/icon.svg' });
      }
      toast.success(r.sent ? `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}` : 'No registered device yet. Enable notifications first.');
    },
  });

  const save = (): void =>
    update.mutate({ quietHoursStart: start, quietHoursEnd: end }, { onSuccess: () => toast.success('Quiet hours saved'), onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save') });

  return (
    <Panel className={SPAN[5]}>
      <PanelTitle>Notifications</PanelTitle>
      <KeyValue
        items={[
          ['Ask me about new merchants', 'On'],
          ['More than 5 waiting', 'One evening digest'],
          ['Weekly digest', 'Sunday 19:00'],
        ]}
      />
      <div className="mt-3.5 grid gap-2 border-t border-rule pt-3.5">
        <div className="text-[13px] font-semibold">Quiet hours</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 w-[120px]" aria-label="Quiet hours start" />
          <span className="text-ink-3">to</span>
          <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 w-[120px]" aria-label="Quiet hours end" />
          <Button size="sm" variant="outline" onClick={save} disabled={update.isPending || (start === me.quietHoursStart && end === me.quietHoursEnd)}>Save</Button>
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap gap-2 border-t border-rule pt-3.5">
        <Button
          size="sm"
          variant="outline"
          disabled={enable.isPending || !pushSupported()}
          onClick={() => enable.mutate(undefined, { onSuccess: () => toast.success('This browser will get notifications'), onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not enable') })}
        >
          Enable on this browser
        </Button>
        <Button size="sm" variant="outline" disabled={test.isPending} onClick={() => test.mutate(undefined, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed') })}>
          Send a test notification
        </Button>
      </div>
    </Panel>
  );
}

/* ----------------------------------------------------------------- profile */

function ProfileCard({ me }: { me: Me }): ReactNode {
  const update = useUpdateMe();
  const [name, setName] = useState(me.displayName);
  const [payday, setPayday] = useState(String(me.paydayDayOfMonth));
  const [target, setTarget] = useState(String(Number(me.monthlySavingsTarget)));
  const [alloc, setAlloc] = useState<Array<[string, string]>>(Object.entries(me.targetAllocation).map(([k, v]) => [k, String(v)]));
  const total = alloc.reduce((a, [, v]) => a + (Number(v) || 0), 0);

  const save = (): void => {
    const targetAllocation = Object.fromEntries(alloc.filter(([k]) => k.trim()).map(([k, v]) => [k.trim().toUpperCase(), Number(v) || 0]));
    update.mutate(
      {
        displayName: name.trim() || me.displayName,
        paydayDayOfMonth: Math.min(31, Math.max(1, Number(payday) || me.paydayDayOfMonth)),
        monthlySavingsTarget: (Number(target) || 0).toFixed(2),
        targetAllocation,
      },
      { onSuccess: () => toast.success('Saved'), onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save') },
    );
  };

  return (
    <Panel className={SPAN[5]}>
      <PanelTitle>You</PanelTitle>
      <div className="grid gap-3">
        <div className="grid gap-1.5"><Label htmlFor="p-name">Name</Label><Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} className="h-9" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5"><Label htmlFor="p-day">Payday (day of month)</Label><Input id="p-day" inputMode="numeric" value={payday} onChange={(e) => setPayday(e.target.value)} className="h-9" /></div>
          <div className="grid gap-1.5"><Label htmlFor="p-save">Monthly savings target (€)</Label><Input id="p-save" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className="h-9" /></div>
        </div>
        <div className="grid gap-1.5">
          <Label>Target allocation (% of portfolio)</Label>
          {alloc.map(([k, v], i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={k} onChange={(e) => setAlloc(alloc.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} placeholder="VWCE" className="h-9 w-[110px]" aria-label="Symbol" />
              <Input value={v} inputMode="decimal" onChange={(e) => setAlloc(alloc.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} className="h-9 w-[80px]" aria-label="Percent" />
              <span className="text-ink-3">%</span>
              <button type="button" className="text-ink-3 hover:text-bad" aria-label="Remove row" onClick={() => setAlloc(alloc.filter((_, j) => j !== i))}><Trash2 className="size-4" aria-hidden="true" /></button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button type="button" className="text-[13px] font-semibold text-brand" onClick={() => setAlloc([...alloc, ['', '0']])}>Add a row</button>
            <span className={cn('num text-[12.5px]', Math.round(total) === 100 ? 'text-good' : 'text-warn')}>Total {total.toFixed(0)}%</span>
          </div>
        </div>
        <Button onClick={save} disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</Button>
      </div>
    </Panel>
  );
}

/* -------------------------------------------------- categories and rules */

function CategoryDialog({ open, onOpenChange, categories }: { open: boolean; onOpenChange: (o: boolean) => void; categories: CategoryDto[] }): ReactNode {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [colour, setColour] = useState('#13654F');
  const [group, setGroup] = useState<CategoryDto['group']>('LIFESTYLE');
  const [parentId, setParentId] = useState<string>('none');
  const create = useMutation({
    mutationFn: () => api.createCategory({ name: name.trim(), colour, group, askGroup: 'OTHER', icon: 'tag', parentId: parentId === 'none' ? null : parentId }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.categories });
      toast.success('Category added');
      setName('');
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add the category'),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader><DialogTitle>New category</DialogTitle><DialogDescription>Categories can be used in budgets, rules and the To sort inbox.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="c-name">Name</Label><Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Group</Label>
              <Select value={group} onValueChange={(v) => setGroup(v as CategoryDto['group'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(['ESSENTIALS', 'LIFESTYLE', 'SAVINGS'] as const).map((g) => <SelectItem key={g} value={g}>{g[0] + g.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="c-col">Colour</Label><Input id="c-col" type="color" value={colour} onChange={(e) => setColour(e.target.value)} className="h-9 p-1" /></div>
          </div>
          <div className="grid gap-1.5">
            <Label>Inside (optional)</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Top level</SelectItem>
                {categories.filter((c) => !c.parentId && (c.group === 'ESSENTIALS' || c.group === 'LIFESTYLE')).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Add category</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RulesCard(): ReactNode {
  const api = useApi();
  const qc = useQueryClient();
  const rules = useRules();
  const categories = useCategories();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'USER' | 'SEED'>('USER');
  const byId = new Map(categories.data?.map((c) => [c.id, c]));
  const refresh = (): Promise<unknown> => Promise.all([qc.invalidateQueries({ queryKey: keys.rules }), qc.invalidateQueries({ queryKey: keys.categories }), invalidateMoney(qc)]);
  const del = useMutation({ mutationFn: (id: string) => api.deleteRule(id), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: (v: { id: string; active: boolean }) => api.updateRule(v.id, { active: v.active }), onSuccess: refresh });
  const archive = useMutation({ mutationFn: (v: { id: string; archived: boolean }) => api.updateCategory(v.id, { archived: v.archived }), onSuccess: refresh });
  const shown = (rules.data ?? []).filter((r) => r.source === filter);

  return (
    <Panel flush className={SPAN[12]}>
      <div className="grid gap-6 p-3 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">Categories</h3>
            <button type="button" className="text-[12.5px] font-semibold text-brand" onClick={() => setOpen(true)}>Add</button>
          </div>
          <div className="grid max-h-[340px] gap-0.5 overflow-y-auto">
            {categories.data?.filter((c) => c.group !== 'TRANSFER').map((c) => (
              <div key={c.id} className={cn('flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-raised', c.archived && 'opacity-50')}>
                <CategoryChip category={c} />
                <span className="text-[12px] text-ink-3">{c.group.toLowerCase()}{c.parentId ? ` · in ${byId.get(c.parentId)?.name}` : ''}</span>
                <button type="button" className="text-[12px] font-semibold text-ink-3 hover:text-ink" onClick={() => archive.mutate({ id: c.id, archived: !c.archived })}>{c.archived ? 'Restore' : 'Archive'}</button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">Rules</h3>
            <div className="inline-flex rounded-full border border-rule p-0.5 text-[12px] font-semibold">
              {(['USER', 'SEED'] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn('rounded-full px-2.5 py-0.5', filter === f ? 'bg-ink text-paper' : 'text-ink-2')}>
                  {f === 'USER' ? 'Yours' : 'Built in'}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {shown.length === 0 ? <p className="p-2 text-[13px] text-ink-2">Rules you create by answering To sort appear here.</p> : null}
            {shown.slice(0, 80).map((r) => (
              <div key={r.id} className="flex items-center gap-2 border-t border-rule py-2 text-[13px] first:border-0">
                <div className="min-w-0 flex-1">
                  <div className="mono-raw truncate">{r.matchType.toLowerCase()} · {r.pattern}</div>
                </div>
                <CategoryChip category={byId.get(r.categoryId) ?? null} />
                {r.source === 'USER' ? (
                  <button type="button" aria-label="Delete rule" className="text-ink-3 hover:text-bad" onClick={() => del.mutate(r.id)}><Trash2 className="size-4" aria-hidden="true" /></button>
                ) : (
                  <Switch checked={r.active} onCheckedChange={(active) => toggle.mutate({ id: r.id, active })} aria-label={`Rule ${r.pattern} on`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <CategoryDialog open={open} onOpenChange={setOpen} categories={categories.data ?? []} />
    </Panel>
  );
}

/* --------------------------------------------------------------- data/exit */

function DataCard(): ReactNode {
  const api = useApi();
  const auth = useAuth();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const stamp = new Date().toISOString().slice(0, 10);

  const exportData = async (format: 'csv' | 'json'): Promise<void> => {
    try {
      await downloadBlob(await api.exportData(format), `finally-${format === 'csv' ? 'transactions' : 'export'}-${stamp}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    }
  };
  const wipe = useMutation({
    mutationFn: () => api.deleteAllData(),
    onSuccess: async () => {
      qc.clear();
      setConfirm(false);
      setTyped('');
      toast.success('All data deleted');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete'),
  });

  return (
    <Panel className={SPAN[5]}>
      <PanelTitle>Your data</PanelTitle>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void exportData('csv')}>Export transactions (CSV)</Button>
          <Button size="sm" variant="outline" onClick={() => void exportData('json')}>Export everything (JSON)</Button>
        </div>
        <div className="border-t border-rule pt-3 text-[13px] text-ink-2">
          Signed in as <b className="text-ink">{auth.email}</b>
          <div className="mt-2"><Button size="sm" variant="outline" onClick={() => void auth.signOut()}>Sign out</Button></div>
        </div>
        <div className="border-t border-rule pt-3">
          <Button size="sm" variant="outline" className="border-bad text-bad hover:bg-bad-soft" onClick={() => setConfirm(true)}>Delete all data…</Button>
        </div>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete all data?</DialogTitle>
            <DialogDescription>Removes every account, payment, budget, goal and holding from Finally. Your bank is not affected. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5"><Label htmlFor="del">Type DELETE to confirm</Label><Input id="del" value={typed} onChange={(e) => setTyped(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" className="border-bad text-bad" disabled={typed !== 'DELETE' || wipe.isPending} onClick={() => wipe.mutate()}>{wipe.isPending ? 'Deleting…' : 'Delete everything'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function SettingsPage() {
  const me = useMe();
  if (me.error) return <ErrorNote error={me.error} retry={() => void me.refetch()} />;
  return (
    <>
      <PageHeader eyebrow="Read-only bank access via Enable Banking" title="Settings" />
      {!me.data ? (
        <LoadingBlock className="h-72" />
      ) : (
        <div className={GRID}>
          <ConnectionsCard />
          <NotificationsCard me={me.data} />
          <ProfileCard key={JSON.stringify(me.data.targetAllocation) + me.data.paydayDayOfMonth} me={me.data} />
          <DataCard />
          <RulesCard />
        </div>
      )}
    </>
  );
}
