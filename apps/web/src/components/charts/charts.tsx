import { eur, eur0 } from '@finally/api-client';
import type { CategoryRef } from '@finally/contracts';
import type { ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { categoryVar } from '@/lib/category';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthShort = (m: string): string => MONTH[Number(m.slice(5)) - 1] ?? m;
const axis = { fontSize: 11, fill: 'var(--ink-3)' } as const;

export function NetWorthChart({ series }: { series: Array<{ month: string; value: string }> }): ReactNode {
  const data = series.map((p) => ({ label: monthShort(p.month), value: Number(p.value) }));
  const config = { value: { label: 'Net worth', color: 'var(--brand)' } } satisfies ChartConfig;
  const min = Math.min(...data.map((d) => d.value));
  const max = Math.max(...data.map((d) => d.value));
  return (
    <ChartContainer config={config} className="aspect-auto h-[120px] w-full" role="img" aria-label="Net worth over 12 months">
      <AreaChart data={data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axis} interval="preserveStartEnd" minTickGap={28} />
        <YAxis hide domain={[Math.floor(min * 0.98), Math.ceil(max * 1.01)]} />
        <ChartTooltip cursor={{ stroke: 'var(--rule)' }} content={<ChartTooltipContent hideLabel formatter={(v) => <span className="num font-semibold">{eur(Number(v))}</span>} />} />
        <Area dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2} fill="var(--color-value)" fillOpacity={0.1} dot={false} activeDot={{ r: 4.5 }} />
      </AreaChart>
    </ChartContainer>
  );
}

export function SpendDonut({
  items,
  centreLabel,
}: {
  items: Array<{ category: CategoryRef; spent: string }>;
  centreLabel: string;
}): ReactNode {
  const total = items.reduce((a, i) => a + Number(i.spent), 0);
  const data = items.map((i) => ({ name: i.category.name, value: Number(i.spent), fill: categoryVar(i.category) }));
  const config = Object.fromEntries(items.map((i) => [i.category.slug, { label: i.category.name, color: categoryVar(i.category) }])) satisfies ChartConfig;
  return (
    <div className="relative">
      <ChartContainer config={config} className="aspect-square w-full max-w-[150px]" role="img" aria-label="Spending by category">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(v, name) => <span className="num">{name}: <b>{eur(Number(v))}</b></span>} />} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={47} outerRadius={70} paddingAngle={1.5} stroke="none" startAngle={90} endAngle={-270}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 grid max-w-[150px] place-content-center text-center">
        <div className="num font-display text-[15px] font-medium leading-tight">{eur0(total)}</div>
        <div className="text-[11px] text-ink-3">{centreLabel}</div>
      </div>
    </div>
  );
}

export function DayBars({
  days,
  spentByDay,
  evenPace,
  month,
}: {
  days: number;
  spentByDay: Array<{ day: number; spent: string }>;
  evenPace: string;
  month: string;
}): ReactNode {
  const spent = new Map(spentByDay.map((d) => [d.day, Number(d.spent)]));
  const data = Array.from({ length: days }, (_, i) => ({ day: i + 1, spent: spent.get(i + 1) ?? null, future: !spent.has(i + 1) }));
  const config = { spent: { label: 'Spent', color: 'var(--brand)' } } satisfies ChartConfig;
  const pace = Number(evenPace);
  return (
    <ChartContainer config={config} className="aspect-auto h-[170px] w-full" role="img" aria-label={`Spending by day in ${monthShort(month)}, excluding rent`}>
      <BarChart data={data} margin={{ top: 10, right: 4, left: -14, bottom: 0 }} barCategoryGap={3}>
        <CartesianGrid vertical={false} stroke="var(--rule)" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={axis} ticks={[1, 7, 14, 21, 28].filter((d) => d <= days)} />
        <YAxis tickLine={false} axisLine={false} tick={axis} tickFormatter={(v: number) => `€${v}`} width={44} />
        <ChartTooltip cursor={{ fill: 'var(--raised)' }} content={<ChartTooltipContent hideLabel formatter={(v, _n, item) => <span className="num">{String(item.payload?.['day'])} {monthShort(month)}: <b>{eur(Number(v))}</b></span>} />} />
        <ReferenceLine y={pace} stroke="var(--ink-3)" strokeDasharray="4 4" label={{ value: `even pace ${eur(pace)}/day`, position: 'insideTopRight', fill: 'var(--ink-3)', fontSize: 11 }} />
        <Bar dataKey="spent" radius={[2, 2, 0, 0]} fill="var(--color-spent)" minPointSize={0} />
      </BarChart>
    </ChartContainer>
  );
}

export function PriceChart({
  bars,
  sma50,
  symbol,
}: {
  bars: Array<{ date: string; close: string }>;
  sma50: Array<number | null>;
  symbol: string;
}): ReactNode {
  const data = bars.map((b, i) => ({ date: b.date, close: Number(b.close), sma: sma50[i] ?? null }));
  const values = data.flatMap((d) => [d.close, d.sma ?? d.close]);
  const min = Math.floor(Math.min(...values) / 5) * 5;
  const max = Math.ceil(Math.max(...values) / 5) * 5;
  const config = {
    close: { label: 'Price', color: 'var(--brand)' },
    sma: { label: '50-day average', color: 'var(--ink-3)' },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full" role="img" aria-label={`${symbol} price with 50-day moving average`}>
      <LineChart data={data} margin={{ top: 12, right: 12, left: -6, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--rule)" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={axis} minTickGap={42} tickFormatter={(d: string) => monthShort(d.slice(0, 7))} />
        <YAxis domain={[min, max]} tickLine={false} axisLine={false} tick={axis} tickFormatter={(v: number) => `€${v}`} width={48} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => <span className="num">{name === 'close' ? 'Price' : '50-day'}: <b>{eur(Number(v))}</b></span>} />} />
        <Line dataKey="sma" type="monotone" stroke="var(--color-sma)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={false} />
        <Line dataKey="close" type="monotone" stroke="var(--color-close)" strokeWidth={2} dot={false} activeDot={{ r: 4.5 }} />
      </LineChart>
    </ChartContainer>
  );
}

export function GrowthChart({ series }: { series: Array<{ year: number; value: string; contributed: string }> }): ReactNode {
  const data = series.map((s) => ({ year: s.year, value: Number(s.value), contributed: Number(s.contributed) }));
  const config = {
    value: { label: 'Value', color: 'var(--brand)' },
    contributed: { label: 'Paid in', color: 'var(--ink-3)' },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[200px] w-full" role="img" aria-label="Growth over time">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--rule)" />
        <XAxis dataKey="year" tickLine={false} axisLine={false} tick={axis} tickFormatter={(y: number) => `${y}y`} />
        <YAxis tickLine={false} axisLine={false} tick={axis} tickFormatter={(v: number) => (v >= 1000 ? `€${Math.round(v / 1000)}k` : `€${v}`)} width={52} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(y) => `Year ${y}`} formatter={(v, name) => <span className="num">{name === 'value' ? 'Value' : 'Paid in'}: <b>{eur(Number(v))}</b></span>} />} />
        <Area dataKey="contributed" type="monotone" stroke="var(--color-contributed)" fill="var(--color-contributed)" fillOpacity={0.08} strokeDasharray="4 4" dot={false} />
        <Area dataKey="value" type="monotone" stroke="var(--color-value)" fill="var(--color-value)" fillOpacity={0.12} strokeWidth={2} dot={false} />
      </AreaChart>
    </ChartContainer>
  );
}

export function SparkArea({ values, label }: { values: number[]; label: string }): ReactNode {
  const data = values.map((v, i) => ({ i, v }));
  const config = { v: { label, color: 'var(--brand)' } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[110px] w-full" role="img" aria-label={label}>
      <AreaChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Area dataKey="v" type="monotone" stroke="var(--color-v)" strokeWidth={2} fill="var(--color-v)" fillOpacity={0.1} dot={false} />
      </AreaChart>
    </ChartContainer>
  );
}
