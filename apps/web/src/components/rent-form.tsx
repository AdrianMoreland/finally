import { eur, usePatchPrefs, usePrefs } from '@finally/api-client';
import type { RentPrefs } from '@finally/contracts';
import { Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { LoadingBlock, Panel, PanelTitle } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface RentRow {
  id: string;
  name: string;
  match: string;
}

/** The rent settings card: used under Settings and in the setup flow. `onSaved` runs after a successful save. */
export function RentSettings({ className, onSaved, suggest }: { className?: string; onSaved?: () => void; suggest?: { total: string; day: number } | null }): ReactNode {
  const prefs = usePrefs();
  if (!prefs.data) return <Panel className={className}><LoadingBlock className="h-40" /></Panel>;
  return <RentForm key={JSON.stringify(prefs.data.rent)} rent={prefs.data.rent} className={className} onSaved={onSaved} suggest={suggest ?? null} />;
}

function RentForm({ rent, className, onSaved, suggest }: { rent: RentPrefs; className?: string; onSaved?: () => void; suggest: { total: string; day: number } | null }): ReactNode {
  const patch = usePatchPrefs();
  const [total, setTotal] = useState(Number(rent.total) > 0 ? String(Number(rent.total)) : suggest ? String(Number(suggest.total)) : '');
  const [day, setDay] = useState(String(rent.household >= 2 || !suggest ? rent.day : suggest.day));
  const [household, setHousehold] = useState(String(rent.household));
  const [rows, setRows] = useState<RentRow[]>(rent.flatmates.map((f) => ({ id: f.id, name: f.name, match: f.matchers.map((m) => m.value).join(', ') })));
  const people = Math.max(1, Math.min(12, Math.round(Number(household) || 1)));
  const own = Number(total) > 0 && people >= 2 ? Number(total) / people : null;

  const save = (): void => {
    patch.mutate(
      {
        rent: {
          total: (Number(total) || 0).toFixed(2),
          day: Math.min(28, Math.max(1, Math.round(Number(day) || 1))),
          household: people,
          flatmates: rows
            .filter((r) => r.name.trim())
            .map((r, i) => ({
              id: r.id || `m${i + 1}`,
              name: r.name.trim(),
              matchers: r.match
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)
                .map((value) => ({ kind: 'text' as const, value })),
            })),
        },
      },
      { onSuccess: () => { toast.success('Rent saved. Payments are being re-sorted.'); onSaved?.(); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save') },
    );
  };

  return (
    <Panel className={className}>
      <PanelTitle>Rent you front</PanelTitle>
      <p className="mb-3 text-[13px] text-ink-2">
        If you pay the landlord in full and the people you live with send their share back, Finally counts only your share as rent. What you front, and what they repay, is
        neither spending nor income.
      </p>
      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-1.5"><Label htmlFor="r-total">Landlord takes (€)</Label><Input id="r-total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="2500" className="h-9" /></div>
          <div className="grid gap-1.5"><Label htmlFor="r-day">On day</Label><Input id="r-day" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} className="h-9" /></div>
          <div className="grid gap-1.5"><Label htmlFor="r-house">People sharing</Label><Input id="r-house" inputMode="numeric" value={household} onChange={(e) => setHousehold(e.target.value)} className="h-9" /></div>
        </div>
        <p className="text-[12.5px] text-ink-3">
          {own != null ? `Your rent is ${eur(own)} a month. ` : 'Enter the total and how many of you share it (yourself included). 1 turns this off. '}
        </p>
        {people >= 2 ? (
          <div className="grid gap-2">
            <Label>The others, and how their transfers look in your bank</Label>
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" className="h-9 w-[130px]" aria-label="Name" />
                <Input value={r.match} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, match: e.target.value } : x)))} placeholder="Text in the bank description, e.g. a surname" className="h-9 flex-1" aria-label="Text to match" />
                <button type="button" className="text-ink-3 hover:text-ink" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" aria-hidden="true" /></button>
              </div>
            ))}
            <div>
              <button type="button" className="text-[13px] font-semibold text-brand" onClick={() => setRows([...rows, { id: `m${Date.now().toString(36)}`, name: '', match: '' }])}>
                Add a person
              </button>
            </div>
          </div>
        ) : null}
        <Button onClick={save} disabled={patch.isPending}>{patch.isPending ? 'Saving…' : 'Save'}</Button>
      </div>
    </Panel>
  );
}

