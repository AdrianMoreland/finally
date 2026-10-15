import type { CategoryRef } from '@finally/contracts';
import type { ReactNode } from 'react';
import { categoryVar } from '@/lib/category';
import { cn } from '@/lib/utils';

/** Surface card in the prototype's style: 10px radius, hairline border, 16/18 padding. */
export function Panel({
  className,
  children,
  flush,
}: {
  className?: string;
  children: ReactNode;
  flush?: boolean;
}): ReactNode {
  return (
    <section className={cn('min-w-0 rounded-[6px] bg-surface', flush ? 'p-1.5' : 'px-[18px] py-4', className)}>
      {children}
    </section>
  );
}

export function PanelTitle({ children, action }: { children: ReactNode; action?: ReactNode }): ReactNode {
  return (
    <h3 className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-[16px] font-medium text-ink-2">
      <span>{children}</span>
      {action ? <span className="text-[13px] font-semibold text-brand">{action}</span> : null}
    </h3>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lead,
  right,
}: {
  eyebrow?: ReactNode;
  title: string;
  lead?: ReactNode;
  right?: ReactNode;
}): ReactNode {
  return (
    <header className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand">{eyebrow}</div> : null}
        <h1 className="mt-1.5 font-display text-[30px] font-light leading-[1.05] text-balance md:text-[34px]">{title}</h1>
        {lead ? <p className="mt-1.5 max-w-[62ch] text-ink-2">{lead}</p> : null}
      </div>
      {right}
    </header>
  );
}

export function Big({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return <div className={cn('num font-display text-[36px] font-medium leading-none tracking-[-0.01em]', className)}>{children}</div>;
}

export function Sub({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return <div className={cn('mt-1.5 text-[13px] text-ink-2', className)}>{children}</div>;
}

/** A category with its colour dot. Unsorted payments use the marker chip: the only use of that colour. */
export function CategoryChip({
  category,
  kind,
  onClick,
}: {
  category: Pick<CategoryRef, 'slug' | 'colour' | 'name'> | null;
  kind?: string;
  onClick?: () => void;
}): ReactNode {
  const base = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] border px-2 py-[2px] pl-1.5 text-[12px] font-medium';
  if (!category) {
    const cls = cn(base, 'border-marker bg-marker font-bold text-marker-ink');
    return onClick ? (
      <button type="button" className={cls} onClick={onClick}>
        To sort
      </button>
    ) : (
      <span className={cls}>To sort</span>
    );
  }
  const muted = kind === 'TRANSFER';
  const content = (
    <>
      <i className="size-2 rounded-full" style={{ background: categoryVar(category) }} />
      {category.name}
    </>
  );
  const cls = cn(base, 'border-rule bg-transparent', muted && 'text-ink-3');
  return onClick ? (
    <button type="button" className={cn(cls, 'hover:border-brand')} onClick={onClick}>
      {content}
    </button>
  ) : (
    <span className={cls}>{content}</span>
  );
}

const SEV: Record<string, string> = {
  ACT: 'text-pink',
  WATCH: 'text-warn',
  INFO: 'text-brand',
  YOU: 'bg-marker !border-marker text-marker-ink',
};
const SEV_LABEL: Record<string, string> = { ACT: 'Act', WATCH: 'Watch', INFO: 'Info', YOU: 'You' };

export function SeverityTag({ severity }: { severity: 'ACT' | 'WATCH' | 'INFO' | 'YOU' }): ReactNode {
  return (
    <span className={cn('mt-px whitespace-nowrap rounded-[3px] border-[1.5px] border-current px-1.5 py-[2px] text-[10.5px] font-bold uppercase tracking-[0.08em]', SEV[severity])}>
      {SEV_LABEL[severity]}
    </span>
  );
}

/** Progress track with an optional tick for "where an even pace would put you today". */
export function Track({
  value,
  tick,
  color = 'var(--brand)',
  height = 6,
  className,
}: {
  value: number;
  tick?: number | null;
  color?: string;
  height?: number;
  className?: string;
}): ReactNode {
  return (
    <div
      className={cn('relative rounded-[3px] bg-track', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(Math.min(100, Math.max(0, value)))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <i className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
      {tick != null ? (
        <b className="absolute -bottom-[5px] -top-[5px] w-0.5 bg-needle" style={{ left: `${Math.min(100, Math.max(0, tick))}%` }} />
      ) : null}
    </div>
  );
}

export function KeyValue({ items }: { items: Array<[ReactNode, ReactNode]> }): ReactNode {
  return (
    <div className="grid gap-2 text-[13px]">
      {items.map(([k, v], i) => (
        <div key={i} className={cn('flex justify-between gap-2.5', i > 0 && 'border-t border-rule pt-2')}>
          <span>{k}</span>
          <b className="num text-right font-semibold">{v}</b>
        </div>
      ))}
    </div>
  );
}

export function Disclaimer({ children }: { children: ReactNode }): ReactNode {
  return <div className="mt-3 border-t border-dashed border-rule pt-2.5 text-[12px] text-ink-3">{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }): ReactNode {
  return (
    <Panel className="px-4 py-12 text-center text-ink-2">
      <h2 className="mb-1.5 font-display text-[22px] font-medium text-ink">{title}</h2>
      {children}
    </Panel>
  );
}

export function LoadingBlock({ className }: { className?: string }): ReactNode {
  return <div className={cn('animate-pulse rounded-[6px] bg-raised', className ?? 'h-32')} aria-busy="true" />;
}

export function ErrorNote({ error, retry }: { error: unknown; retry?: () => void }): ReactNode {
  return (
    <Panel className="text-ink-2">
      <p className="font-semibold text-bad">Something went wrong.</p>
      <p className="mt-1 text-[13px]">{error instanceof Error ? error.message : 'Unexpected error.'}</p>
      {retry ? (
        <button type="button" className="mt-2 font-semibold text-brand" onClick={retry}>
          Try again
        </button>
      ) : null}
    </Panel>
  );
}
