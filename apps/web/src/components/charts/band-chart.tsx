import { eur0 } from '@finally/api-client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface BandMark {
  n: number;
  name: string;
  date: string | null;
  /** Years from today. */
  at: number;
}

const niceStep = (mx: number): number => {
  for (const s of [50e3, 100e3, 200e3, 250e3, 500e3, 1e6, 2e6, 5e6, 1e7]) if (mx / s <= 6) return s;
  return 2e7;
};
const kfmt = (t: number): string => (t >= 1e6 ? `€${t / 1e6}m` : `€${t / 1000}k`);

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e?.contentRect.width ?? 640)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const monthYear = (d: string): string => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/**
 * The range of outcomes by age: a p10 to p90 band, the typical path, a dashed "enough" line and numbered milestone
 * markers. Markers closer than 17px stack downward.
 */
export function BandChart({ p10, p50, p90, target, startAge, marks }: { p10: number[]; p50: number[]; p90: number[]; target: number; startAge: number; marks: BandMark[] }): ReactNode {
  const [ref, box] = useWidth();
  const W = 640;
  const H = 230;
  const narrow = box < 450;
  const pl = narrow ? 44 : 56;
  const pr = 16;
  const pt = 12;
  const pb = 24;
  const n = p50.length;
  const mx = Math.max(target * 1.15, ...p90);
  const X = (i: number): number => pl + (i * (W - pl - pr)) / (n - 1);
  const Y = (v: number): number => pt + (1 - v / mx) * (H - pt - pb);
  const step = niceStep(mx);
  const ticks: number[] = [];
  for (let t = 0; t <= mx; t += step) ticks.push(t);
  const up = p90.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  const dn = p10.map((v, i) => [X(i), Y(v)] as const).reverse().map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  let lastX = -99;
  let lvl = 0;
  const shown = marks.filter((m) => m.at >= 0 && m.at <= n - 1);
  const placed = shown.map((m) => {
    const xv = X(m.at);
    lvl = xv - lastX < 17 ? lvl + 1 : 0;
    lastX = xv;
    return { m, x: xv, cy: pt + 6 + lvl * 17 };
  });
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Range of outcomes for your invested pot by age">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-l" x1={pl} x2={W - pr} y1={Y(t).toFixed(1)} y2={Y(t).toFixed(1)} />
            <text className="ax" x={pl - 6} y={(Y(t) + 4).toFixed(1)} textAnchor="end">{kfmt(t)}</text>
          </g>
        ))}
        <path className="band" d={`${up}${dn}Z`} />
        <path className="ln" d={p50.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('')} />
        <line className="ln-b" x1={pl} x2={W - pr} y1={Y(target).toFixed(1)} y2={Y(target).toFixed(1)} />
        <text className="lbl2" x={pl + 6} y={(Y(target) - 6).toFixed(1)}>enough: {eur0(target)}</text>
        {placed.map(({ m, x, cy }) => (
          <g key={m.n}>
            <line className="ms-line" x1={x.toFixed(1)} x2={x.toFixed(1)} y1={cy + 7} y2={H - pb} />
            <circle className="ms-dot" cx={x.toFixed(1)} cy={cy} r="7" />
            <text className="ms-n" x={x.toFixed(1)} y={cy + 3.5} textAnchor="middle">{m.n}</text>
          </g>
        ))}
        {Array.from({ length: Math.ceil(n / (narrow ? 10 : 5)) }, (_, k) => k * (narrow ? 10 : 5)).filter((i) => i < n).map((i) => (
          <text key={i} className="ax" x={X(i).toFixed(1)} y={H - 6} textAnchor={i === 0 ? 'start' : 'middle'}>age {startAge + i}</text>
        ))}
      </svg>
      <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2">
        {marks.map((m) => (
          <li key={m.n} className="inline-flex items-center gap-1.5">
            <span className="grid size-[18px] place-items-center rounded-full border-[1.5px] border-pink text-[10px] font-bold text-ink">{m.n}</span>
            {m.name}
            {m.date ? <span className="text-ink-3"> · {monthYear(m.date)}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
