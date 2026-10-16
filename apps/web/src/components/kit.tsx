import type { CheckState } from '@finally/contracts';
import { Minus, Plus } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Small building blocks shared by the screens. Pink (the marker) is only ever used for things that need the user. */

export function Seg<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<readonly [T, string]>;
  label: string;
  className?: string;
}): ReactNode {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex flex-wrap gap-1.5', className)}>
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-control border px-3 py-1.5 text-[13px] font-semibold transition-colors',
            value === v ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-2 hover:border-ink-3 hover:text-ink',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

const CALLOUT = {
  info: 'border-transparent bg-brand-soft text-ink',
  warn: 'border-transparent bg-warn-soft text-ink',
  act: 'border-transparent bg-pink-soft text-ink',
} as const;

export function Callout({ tone = 'info', children, className }: { tone?: keyof typeof CALLOUT; children: ReactNode; className?: string }): ReactNode {
  return <div className={cn('rounded-chip border px-3 py-2.5 text-[13px]', CALLOUT[tone], className)}>{children}</div>;
}

const CHIP = {
  plain: 'border-rule bg-transparent text-ink-2',
  ok: 'border-brand bg-transparent text-brand',
  mark: 'border-marker bg-marker font-bold text-marker-ink',
  pend: 'border-dashed border-ink-3 bg-transparent text-ink-3',
  warn: 'border-warn bg-transparent text-warn',
} as const;

export function Chip({ tone = 'plain', children, className }: { tone?: keyof typeof CHIP; children: ReactNode; className?: string }): ReactNode {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-chip border px-2 py-[2px] text-[11.5px] font-semibold', CHIP[tone], className)}>
      {children}
    </span>
  );
}

/** The ± steppers that sit next to a slider, so a real amount can be set precisely on a phone. */
export function Stepper({
  value,
  onChange,
  step,
  min = 0,
  max,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  max?: number;
  label: string;
}): ReactNode {
  const clamp = (v: number): number => Math.min(max ?? Infinity, Math.max(min, v));
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(clamp(value - step))} className="grid size-7 place-items-center rounded-control border border-rule text-ink-2 hover:border-brand hover:text-brand">
        <Minus className="size-3.5" aria-hidden="true" />
      </button>
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(clamp(value + step))} className="grid size-7 place-items-center rounded-control border border-rule text-ink-2 hover:border-brand hover:text-brand">
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

/**
 * A euro amount you can type, nudge with ± or drag. The typed value is committed on blur or Enter, so a half-typed
 * number never reaches the server. Dragging commits when released.
 */
export function AmountField({
  label,
  sub,
  value,
  onCommit,
  min = 0,
  max = 1000,
  step = 5,
  slider = true,
  prefix = '€',
  suffix,
  colour,
  decimals = 0,
  disabled,
}: {
  label: string;
  sub?: string;
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  slider?: boolean;
  prefix?: string;
  suffix?: string;
  colour?: string;
  decimals?: number;
  disabled?: boolean;
}): ReactNode {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => setDraft(value.toFixed(decimals)), [value, decimals]);
  const shown = drag ?? value;
  const commit = (raw: string): void => {
    const n = Number(raw.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(n) && n !== value) onCommit(Math.min(max * 10, Math.max(min, n)));
    else setDraft(value.toFixed(decimals));
  };
  const pctFill = Math.min(100, Math.max(0, ((shown - min) / Math.max(1, max - min)) * 100));
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="min-w-0 text-[13.5px] font-medium">
          {colour ? <i className="mr-2 inline-block size-2.5 rounded-[2px] align-middle" style={{ background: `var(${colour})` }} /> : null}
          {label}
          {sub ? <small className="block text-[12px] font-normal text-ink-3">{sub}</small> : null}
        </label>
        <span className="flex items-center gap-2">
          <span className="relative">
            {prefix ? <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">{prefix}</span> : null}
            <Input
              id={id}
              inputMode="decimal"
              disabled={disabled}
              value={drag != null ? shown.toFixed(decimals) : draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className={cn('num h-8 w-[92px] text-right', prefix && 'pl-5', suffix && 'pr-6')}
            />
            {suffix ? <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">{suffix}</span> : null}
          </span>
          <Stepper value={value} onChange={onCommit} step={step} min={min} label={label} />
        </span>
      </div>
      {slider ? (
        <input
          type="range"
          aria-label={`${label} slider`}
          min={min}
          max={max}
          step={step}
          value={Math.min(max, shown)}
          disabled={disabled}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={() => {
            if (drag != null && drag !== value) onCommit(drag);
            setDrag(null);
          }}
          onKeyUp={() => {
            if (drag != null && drag !== value) onCommit(drag);
            setDrag(null);
          }}
          style={{ ['--p' as string]: `${pctFill}%`, ['--tone' as string]: colour ? `var(${colour})` : 'var(--brand)' }}
          className="w-full"
        />
      ) : null}
    </div>
  );
}

const TRI: ReadonlyArray<readonly [CheckState, string]> = [
  ['TODO', 'Not done'],
  ['DONE', 'Done'],
  ['NA', "Doesn't apply"],
];

/** Not done / Done / Doesn't apply: one switch could mean claimed, eligible or asked, so there are three states. */
export function Tri({
  label,
  hint,
  state,
  onChange,
  busy,
}: {
  label: string;
  hint?: string;
  state: CheckState;
  onChange: (s: CheckState) => void;
  busy?: boolean;
}): ReactNode {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-rule py-2.5 first:border-t-0 first:pt-0">
      <span className="min-w-[200px] flex-1 text-[13.5px]">
        <span className={cn(state === 'NA' && 'text-ink-3')}>{label}</span>
        {hint ? <small className="block text-[12px] text-ink-3">{hint}</small> : null}
      </span>
      <span role="group" aria-label={label} className="inline-flex gap-1">
        {TRI.map(([s, l]) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            aria-pressed={state === s}
            onClick={() => state !== s && onChange(s)}
            className={cn(
              'rounded-control border px-2.5 py-[3px] text-[12px] font-semibold transition-colors',
              state === s ? (s === 'DONE' ? 'border-fill bg-fill text-on-fill' : 'border-ink bg-ink text-paper') : 'border-rule text-ink-2 hover:border-ink-3 hover:text-ink',
            )}
          >
            {l}
          </button>
        ))}
      </span>
    </div>
  );
}

/** A thin stacked bar: how a pay packet is split. */
export function StackBar({ parts, label }: { parts: Array<{ name: string; value: number; colour: string }>; label: string }): ReactNode {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  return (
    <div role="img" aria-label={label} className="flex h-[22px] gap-0.5 overflow-hidden rounded-full bg-track">
      {parts.map((p) =>
        p.value > 0 ? <span key={p.name} title={p.name} style={{ width: `${(p.value / total) * 100}%`, background: `var(${p.colour})` }} /> : null,
      )}
    </div>
  );
}

export function Key({ items }: { items: Array<{ name: string; colour: string; text?: string }> }): ReactNode {
  return (
    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5">
          <i className="size-2.5 rounded-[2px]" style={{ background: i.colour.startsWith('--') ? `var(${i.colour})` : i.colour }} />
          {i.text ?? i.name}
        </span>
      ))}
    </div>
  );
}

/** A label and a value on one line, with a rule above all but the first. */
export function Line({ label, value, strong, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: 'good' | 'warn' }): ReactNode {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 border-t border-rule py-1.5 text-[13px] first:border-t-0', strong && 'font-semibold')}>
      <span className={cn(!strong && 'text-ink-2')}>{label}</span>
      <b className={cn('num text-right font-semibold', tone === 'good' && 'text-good', tone === 'warn' && 'text-warn')}>{value}</b>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }): ReactNode {
  return <div className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">{children}</div>;
}
