import { monogram } from '@finally/finance-core';
import { Link } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Card header: title and a muted figure on the left, a link or dropdown on the right. */
export function CardTitle({ children, note, right, className }: { children: ReactNode; note?: ReactNode; right?: ReactNode; className?: string }): ReactNode {
  return (
    <h3 className={cn('mb-3 flex flex-wrap items-center justify-between gap-2 text-[15px] font-semibold text-ink', className)}>
      <span>
        {children}
        {note ? <span className="ml-2 text-[13px] font-medium text-ink-3">{note}</span> : null}
      </span>
      {right ? <span className="text-[13px] font-semibold text-brand">{right}</span> : null}
    </h3>
  );
}

/** The dropdown that sits in a card header: a native select with a custom chevron. */
export function HeaderSelect<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<readonly [T, string]>;
  label: string;
}): ReactNode {
  return (
    <label className="relative inline-flex">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none rounded-control border border-rule bg-surface py-1.5 pl-[11px] pr-[30px] text-[13px] font-medium text-ink outline-none hover:border-ink-3 focus-visible:border-brand"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
    </label>
  );
}

/** A KPI tile. With `to` it is a link and shows a mint "go" label on hover. */
export function Kpi({
  label,
  value,
  unit,
  sub,
  subTone,
  go,
  to,
  valueTone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  subTone?: 'good' | 'warn';
  go?: string;
  to?: string;
  valueTone?: 'good' | 'warn';
}): ReactNode {
  const body = (
    <>
      <span className="flex items-center justify-between text-[12.5px] font-medium text-ink-2">
        {label}
        {go ? <span className="text-[12px] font-semibold text-brand opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{go} ›</span> : null}
      </span>
      <b className={cn('num font-display text-[26px] font-normal leading-tight tracking-[-0.01em] md:max-[860px]:text-[21px]', valueTone === 'good' && 'text-good', valueTone === 'warn' && 'text-warn')}>
        {value}
        {unit ? <small className="ml-1 text-[13px] font-medium text-ink-2">{unit}</small> : null}
      </b>
      {sub ? <span className={cn('text-[12.5px] text-ink-3', subTone === 'good' && 'text-good', subTone === 'warn' && 'text-warn')}>{sub}</span> : null}
    </>
  );
  const cls = 'group grid content-start gap-1 rounded-card border border-hair bg-surface px-4 py-3.5 text-left';
  return to ? (
    <Link to={to as never} className={cn(cls, 'hover:border-brand/45')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Two-letter round avatar for a payee, tinted with the colour it is shown in. */
export function Monogram({ name, colour }: { name: string; colour: string }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className="grid size-7 flex-none place-items-center rounded-full border text-[10.5px] font-bold"
      style={{
        color: colour,
        borderColor: `color-mix(in srgb, ${colour} 32%, transparent)`,
        background: `color-mix(in srgb, ${colour} 16%, var(--surface))`,
      }}
    >
      {monogram(name)}
    </span>
  );
}

/** Switch row used under charts: a label, a sub line and the toggle. */
export function ToggleRow({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub: ReactNode }): ReactNode {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-[22px] w-10 flex-none rounded-full transition-colors',
          checked ? 'bg-fill' : 'bg-raised shadow-[inset_0_0_0_1.5px_var(--track)]',
        )}
      >
        <i className={cn('absolute top-[3px] size-4 rounded-full transition-all', checked ? 'left-[21px] bg-on-fill' : 'left-[3px] bg-ink-3')} />
      </button>
      <span className="grid text-[13px]">
        <b className="font-semibold">{label}</b>
        <span className="text-[12px] text-ink-3">{sub}</span>
      </span>
    </label>
  );
}
