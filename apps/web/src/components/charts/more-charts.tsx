import { eur } from '@finally/api-client';
import type { ReactNode } from 'react';
import { Area, AreaChart, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

const axis = { fontSize: 11, fill: 'var(--ink-3)' } as const;

/** A generic line over time (net worth, payoff, balance). */
export function TimeLine({ points, label, zero }: { points: Array<{ label: string; value: number }>; label: string; zero?: boolean }): ReactNode {
  const config = { value: { label, color: 'var(--brand)' } } satisfies ChartConfig;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals, zero ? 0 : Infinity);
  const hi = Math.max(...vals, zero ? 0 : -Infinity);
  const pad = (hi - lo) * 0.08 || 50;
  return (
    <ChartContainer config={config} className="aspect-auto h-[130px] w-full" role="img" aria-label={label}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axis} interval="preserveStartEnd" minTickGap={26} />
        <YAxis hide domain={[lo - pad, hi + pad]} />
        {zero ? <ReferenceLine y={0} stroke="var(--rule)" /> : null}
        <ChartTooltip cursor={{ stroke: 'var(--rule)' }} content={<ChartTooltipContent hideLabel formatter={(v) => <span className="num font-semibold">{eur(Number(v))}</span>} />} />
        <Area dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2} fill="var(--color-value)" fillOpacity={0.1} dot={false} activeDot={{ r: 4.5 }} />
      </AreaChart>
    </ChartContainer>
  );
}

/** Freedom: where the middle path and the wider range of outcomes go, with the "enough" line. */
export function PayoffChart({ series }: { series: Array<{ date: string; left: string }> }): ReactNode {
  const data = series.map((s) => ({ label: `${s.date.slice(5, 7)}/${s.date.slice(2, 4)}`, value: Number(s.left) }));
  const config = { value: { label: 'Left to pay back', color: 'var(--c-eating)' } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[120px] w-full" role="img" aria-label="What is left to pay back over time">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axis} interval="preserveStartEnd" minTickGap={30} />
        <YAxis hide domain={[0, 'dataMax']} />
        <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(v) => <span className="num font-semibold">{eur(Number(v))} left</span>} />} />
        <Line dataKey="value" type="stepAfter" stroke="var(--color-value)" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}
