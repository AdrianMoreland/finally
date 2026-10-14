import { eur } from '@finally/api-client';
import type { DeemedDisposalDto } from '@finally/contracts';
import type { ReactNode } from 'react';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const t = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return (y ?? 0) + ((m ?? 1) - 1) / 12 + ((d ?? 1) - 1) / 365;
};

/**
 * Timeline of each ETF lot's 8-year anniversary. Hand-drawn SVG: a Gantt-style chart is clearer than a generic
 * chart library here.
 */
export function DeemedDisposalChart({ lots, today }: { lots: DeemedDisposalDto[]; today: string }): ReactNode {
  if (lots.length === 0) return <p className="text-[13px] text-ink-2">No exit-tax lots held.</p>;
  const W = 640;
  const rowH = 40;
  const top = 30;
  const pl = 190;
  const pr = 20;
  const y0 = Number(today.slice(0, 4));
  const last = Math.max(...lots.map((l) => Number(l.anniversaries[0]?.date.slice(0, 4) ?? y0)));
  const y1 = Math.max(y0 + 5, last + 1);
  const X = (v: number): number => pl + ((v - y0) / (y1 - y0)) * (W - pl - pr);
  const H = top + lots.length * rowH + 10;
  const now = X(t(today));
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 520 }} role="img" aria-label="Deemed disposal dates for each ETF lot">
        {years.map((y) => (
          <g key={y}>
            <line className="grid-l" x1={X(y)} x2={X(y)} y1={top - 8} y2={H - 6} />
            <text className="ax" x={X(y)} y={top - 14} textAnchor="middle">{y}</text>
          </g>
        ))}
        <line className="today" x1={now} x2={now} y1={top - 8} y2={H - 6} />
        {lots.map((l, i) => {
          const a = l.anniversaries[0];
          if (!a) return null;
          const y = top + i * rowH + 18;
          const [by, bm, bd] = l.acquiredAt.split('-').map(Number);
          const xd = X(t(a.date));
          const [ay, am] = a.date.split('-').map(Number);
          return (
            <g key={l.lotId}>
              <text className="lbl" x={0} y={y - 3}>{l.symbol} · {Number(l.quantity)} units</text>
              <text className="lbl2" x={0} y={y + 12}>
                bought {bd} {MON[(bm ?? 1) - 1]} {by} · est. {eur(a.estimatedTax)}
              </text>
              <line className="grid-l" x1={now} x2={xd} y1={y} y2={y} style={{ stroke: 'var(--brand)', opacity: 0.35, strokeWidth: 2 }} />
              <path className="dia" d={`M${xd} ${y - 7}l7 7l-7 7l-7 -7z`} />
              <text className="ax" x={xd} y={y - 11} textAnchor="middle">{MON[(am ?? 1) - 1]} {ay}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
