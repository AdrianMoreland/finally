import type { InsightDto } from '@finally/contracts';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SeverityTag } from '@/components/common';

export function InsightList({
  items,
  toSort = 0,
  limit,
}: {
  items: InsightDto[];
  toSort?: number;
  limit?: number;
}): ReactNode {
  const shown = limit ? items.slice(0, Math.max(0, limit - (toSort ? 1 : 0))) : items;
  return (
    <div className="grid gap-2.5">
      {toSort > 0 ? (
        <Row severity="YOU" title={`${toSort} merchant${toSort === 1 ? '' : 's'} need a category`} body="Answer once per merchant and every past and future payment follows." to="/sort" />
      ) : null}
      {shown.map((i) => (
        <Row key={i.id} severity={i.severity} title={i.title} body={i.body} />
      ))}
      {shown.length === 0 && toSort === 0 ? <p className="text-[13px] text-ink-2">Nothing to flag. Insights appear here after each sync.</p> : null}
    </div>
  );
}

function Row({
  severity,
  title,
  body,
  to,
}: {
  severity: 'ACT' | 'WATCH' | 'INFO' | 'YOU';
  title: string;
  body: string;
  to?: string;
}): ReactNode {
  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 border-t border-rule py-3 first:border-t-0 first:pt-0 last:pb-0">
      <SeverityTag severity={severity} />
      <h4 className="text-[14px] font-semibold leading-[1.35]">
        {to ? (
          <Link to={to} className="hover:underline">
            {title}
          </Link>
        ) : (
          title
        )}
      </h4>
      <p className="col-start-2 text-[13px] text-ink-2">{body}</p>
    </div>
  );
}
