import { eur0 } from '@finally/api-client';
import type { MonthDto } from '@finally/contracts';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type BurnCompare = 'last' | 'usual';

/** Width of the element, so the chart can use three x labels on narrow screens. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e?.contentRect.width ?? 600)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/**
 * Cumulative flexible spending against the budget, with a forecast and either last month or your usual pace.
 * A port of the prototype's chart: axes at four gridlines, dashed budget line, solid spend line with an end dot.
 */
export function BurnChart({ burn, monthLabel, compare = 'usual' }: { burn: MonthDto['burn']; monthLabel: string; compare?: BurnCompare }): ReactNode {
  const [ref, box] = useWidth<HTMLDivElement>();
  const narrow = box < 450;
  const W = 600;
  const H = 220;
  const pl = narrow ? 38 : 46;
  const pr = narrow ? 64 : 78;
  const pt = 14;
  const pb = 24;
  const dim = burn.pace.length;
  const day = burn.spent.length;
  const cum = burn.spent.map((p) => Number(p.value));
  const B = Number(burn.budget);
  const proj = Number(burn.projected);
  const pace = burn.pace.map((p) => Number(p.value));
  const fc = burn.forecast.map((p) => [p.day, Number(p.value)] as const);
  const prev = compare === 'last' ? burn.previous.map((p) => Number(p.value)) : null;
  const mx = Math.max(100, Math.ceil((Math.max(B, proj, ...cum, ...(prev ?? [0])) * 1.08) / 100) * 100);
  const X = (d: number): number => pl + ((d - 1) * (W - pl - pr)) / Math.max(1, dim - 1);
  const Y = (v: number): number => pt + (1 - v / mx) * (H - pt - pb);
  const path = (pts: ReadonlyArray<readonly [number, number]>): string => pts.map(([d, v], i) => `${i ? 'L' : 'M'}${X(d).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  const ticks = [0, 1, 2, 3, 4].map((i) => (mx / 4) * i);
  const xl = narrow ? [1, 15, dim] : [1, 8, 15, 22, dim];
  const last = fc.at(-1);
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Flexible spending so far this month against the budget, with a forecast">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-l" x1={pl} x2={W - pr} y1={Y(t).toFixed(1)} y2={Y(t).toFixed(1)} />
            <text className="ax" x={pl - 6} y={(Y(t) + 4).toFixed(1)} textAnchor="end">
              {eur0(Math.round(t))}
            </text>
          </g>
        ))}
        <line className="ln-b" x1={pl} x2={W - pr} y1={Y(B).toFixed(1)} y2={Y(B).toFixed(1)} />
        <text className="lbl2" x={W - pr + 6} y={(Y(B) + 4).toFixed(1)}>
          budget {eur0(B)}
        </text>
        {prev ? <path className="ln-prev" d={path(prev.map((v, i) => [Math.min(dim, i + 1), v] as const))} /> : <path className="ln-q" d={path(pace.map((v, i) => [i + 1, v] as const))} />}
        <path className="ln-f" d={path(fc)} />
        <path className="ln" d={path(cum.map((v, i) => [i + 1, v] as const))} />
        <circle className="endpt" cx={X(day).toFixed(1)} cy={Y(cum[day - 1] ?? 0).toFixed(1)} r="4.5" />
        {last ? (
          <text className="lbl" x={W - pr + 6} y={(Y(last[1]) + 4).toFixed(1)}>
            {eur0(proj)}
          </text>
        ) : null}
        {xl.map((d) => (
          <text key={d} className="ax" x={X(d).toFixed(1)} y={H - 6} textAnchor="middle">
            {d} {monthLabel}
          </text>
        ))}
      </svg>
    </div>
  );
}
