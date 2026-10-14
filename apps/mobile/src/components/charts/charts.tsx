import { useFont } from '@shopify/react-native-skia';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Area, Bar, CartesianChart, Line } from 'victory-native';
import { usePalette } from '@/lib/theme';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MONO = require('@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf') as number;

type Point = { x: number; y: number; sma?: number | null };

/** Area + line chart for a single series, optionally with a dashed second series (moving average). */
export function LineArea({
  values,
  secondary,
  height = 110,
  showAxis = false,
}: {
  values: number[];
  secondary?: Array<number | null>;
  height?: number;
  showAxis?: boolean;
}): ReactNode {
  const p = usePalette();
  const font = useFont(MONO, 10);
  const data: Point[] = values.map((y, i) => ({ x: i, y, sma: secondary?.[i] ?? null }));
  if (data.length < 2) return <View style={{ height }} />;
  const all = values.concat((secondary ?? []).filter((v): v is number => v !== null));
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.1 || 1;
  return (
    <View style={{ height }}>
      <CartesianChart
        data={data}
        xKey="x"
        yKeys={secondary ? ['y', 'sma'] : ['y']}
        domain={{ y: [min - pad, max + pad] }}
        domainPadding={{ left: 2, right: 2 }}
        axisOptions={
          showAxis && font
            ? { font, lineColor: p.rule, labelColor: p.ink3, tickCount: { x: 0, y: 4 }, formatYLabel: (v: number | null | undefined) => (v == null ? '' : `€${Math.round(v)}`) }
            : { tickCount: { x: 0, y: 0 }, lineWidth: 0, labelColor: 'transparent' }
        }
      >
        {({ points, chartBounds }) => (
          <>
            <Area points={points.y} y0={chartBounds.bottom} color={p.brand} opacity={0.12} curveType="natural" />
            {secondary && 'sma' in points ? <Line points={points['sma' as 'y']} color={p.ink3} strokeWidth={1.5} curveType="natural" connectMissingData={false} /> : null}
            <Line points={points.y} color={p.brand} strokeWidth={2} curveType="natural" />
          </>
        )}
      </CartesianChart>
    </View>
  );
}

/** Bars for spend per day. */
export function DayBars({ values, height = 110 }: { values: number[]; height?: number }): ReactNode {
  const p = usePalette();
  const data = values.map((y, i) => ({ x: i + 1, y }));
  if (data.length === 0) return <View style={{ height }} />;
  return (
    <View style={{ height }}>
      <CartesianChart
        data={data}
        xKey="x"
        yKeys={['y']}
        domainPadding={{ left: 8, right: 8, top: 8 }}
        axisOptions={{ tickCount: { x: 0, y: 0 }, lineWidth: 0, labelColor: 'transparent' }}
      >
        {({ points, chartBounds }) => (
          <Bar points={points.y} chartBounds={chartBounds} color={p.brand} roundedCorners={{ topLeft: 2, topRight: 2 }} barWidth={Math.max(3, 260 / Math.max(values.length, 20) - 3)} />
        )}
      </CartesianChart>
    </View>
  );
}
