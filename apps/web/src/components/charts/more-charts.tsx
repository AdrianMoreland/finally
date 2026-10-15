import { eur, eur0 } from '@finally/api-client';
import type { MonthDto } from '@finally/contracts';
import type { ReactNode } from 'react';
import { Area, AreaChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

const axis = { fontSize: 11, fill: 'var(--ink-3)' } as const;
const kfmt = (v: number): string => (v >= 1000 ? `€${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `€${Math.round(v)}`);

/** Cumulative flexible spend against the budget, your usual pace and a forecast: "am I on track?" at a glance. */
export function BurnChart({ burn, month }: { burn: MonthDto['burn']; month: string }): ReactNode {
  const spent = new Map(burn.spent.map((p) => [p.day, Number(p.value)]));
  const forecast = new Map(burn.forecast.map((p) => [p.day, Number(p.value)]));
  const data = burn.pace.map((p) => ({ day: p.day, pace: Number(p.value), spent: spent.get(p.day) ?? null, forecast: forecast.get(p.day) ?? null }));
  const budget = Number(burn.budget);
  const max = Math.ceil(Math.max(budget, Number(burn.projected), ...data.map((d) => d.spent ?? 0)) * 1.1 / 100) * 100;
  const config = {
    spent: { label: 'Spent so far', color: 'var(--brand)' },
    forecast: { label: 'Forecast', color: 'var(--brand)' },
    pace: { label: 'Your usual pace', color: 'var(--ink-3)' },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full" role="img" aria-label={`Flexible spending so far in ${month} against budget, with a forecast`}>
      <ComposedChart data={data} margin={{ top: 12, right: 64, left: -6, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--rule)" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={axis} ticks={[1, 8, 15, 22, data.length]} />
        <YAxis domain={[0, max]} tickLine={false} axisLine={false} tick={axis} tickFormatter={kfmt} width={46} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(d) => `Day ${d}`} formatter={(v, name) => <span className="num">{name === 'spent' ? 'Spent' : name === 'forecast' ? 'Forecast' : 'Usual pace'}: <b>{eur(Number(v))}</b></span>} />} />
        <ReferenceLine y={budget} stroke="var(--ink-2)" strokeDasharray="2 3" label={{ value: `budget ${eur0(budget)}`, position: 'right', fill: 'var(--ink-2)', fontSize: 11 }} />
        <Line dataKey="pace" type="monotone" stroke="var(--color-pace)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        <Line dataKey="forecast" type="monotone" stroke="var(--color-forecast)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
        <Line dataKey="spent" type="monotone" stroke="var(--color-spent)" strokeWidth={2.5} dot={false} activeDot={{ r: 4.5 }} connectNulls={false} />
      </ComposedChart>
    </ChartContainer>
  );
}

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
export function BandChart({ p10, p50, p90, target, startAge }: { p10: number[]; p50: number[]; p90: number[]; target: number; startAge: number }): ReactNode {
  const data = p50.map((v, i) => ({ age: startAge + i, p10: p10[i]!, p50: v, p90: p90[i]!, range: [p10[i]!, p90[i]!] as [number, number] }));
  const config = {
    p50: { label: 'Middle path', color: 'var(--brand)' },
    p90: { label: 'Good run', color: 'var(--ink-3)' },
    p10: { label: 'Weak run', color: 'var(--ink-3)' },
  } satisfies ChartConfig;
  const max = Math.max(target * 1.1, ...p90);
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full" role="img" aria-label="Simulated savings by age against your enough number">
      <ComposedChart data={data} margin={{ top: 12, right: 70, left: -4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--rule)" />
        <XAxis dataKey="age" tickLine={false} axisLine={false} tick={axis} minTickGap={24} />
        <YAxis domain={[0, max]} tickLine={false} axisLine={false} tick={axis} tickFormatter={kfmt} width={52} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(a) => `Age ${a}`} formatter={(v, name) => <span className="num">{name === 'p50' ? 'Middle' : name === 'p90' ? 'Good run' : 'Weak run'}: <b>{eur0(Number(v))}</b></span>} />} />
        <ReferenceLine y={target} stroke="var(--ink)" strokeDasharray="3 3" label={{ value: `enough ${kfmt(target)}`, position: 'right', fill: 'var(--ink)', fontSize: 11 }} />
        <Line dataKey="p90" type="monotone" stroke="var(--color-p90)" strokeDasharray="2 3" strokeWidth={1.25} dot={false} />
        <Line dataKey="p10" type="monotone" stroke="var(--color-p10)" strokeDasharray="2 3" strokeWidth={1.25} dot={false} />
        <Line dataKey="p50" type="monotone" stroke="var(--color-p50)" strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ChartContainer>
  );
}

/** What is left to pay back over time. */
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
