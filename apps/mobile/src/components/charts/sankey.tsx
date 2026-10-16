import { eur0 } from '@finally/api-client';
import { layoutSankey, shareText, type CfShape } from '@finally/finance-core';
import { useId, useMemo, type ReactNode } from 'react';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop, Text as SvgText, TSpan } from 'react-native-svg';
import { useColourOf, usePalette } from '@/lib/theme';

interface Props {
  cf: CfShape;
  width: number;
  height?: number;
  /** Tighter: no shares, narrower bars (Today and the phone Cash flow screen). */
  mini?: boolean;
  nodeWidth?: number;
  merge?: number;
  /** Screen-reader summary. */
  label: string;
}

/** The cash flow Sankey on the phone: static, two columns. The geometry is shared with the web (finance-core). */
export function Sankey({ cf, width, height, mini = true, nodeWidth = 8, merge, label }: Props): ReactNode {
  const uid = useId().replace(/:/g, '');
  const colourOf = useColourOf();
  const p = usePalette();
  const lay = useMemo(() => layoutSankey(cf, { width, columns: 2, height, nodeWidth, mini, merge }), [cf, width, height, nodeWidth, mini, merge]);
  if (lay.empty) return null;
  return (
    <Svg width="100%" height={lay.height} viewBox={`0 0 ${lay.width} ${lay.height}`} accessibilityRole="image" accessibilityLabel={label}>
      <Defs>
        {lay.links.map((l, i) => (
          <LinearGradient key={i} id={`g${uid}${i}`} gradientUnits="userSpaceOnUse" x1={l.x0} x2={l.x1} y1="0" y2="0">
            <Stop offset="0" stopColor={colourOf(l.fromColour)} />
            <Stop offset="1" stopColor={colourOf(l.toColour)} />
          </LinearGradient>
        ))}
      </Defs>
      {lay.links.map((l, i) => (
        <Path key={i} d={l.d} fill={`url(#g${uid}${i})`} opacity={l.pass ? 0.18 : 0.34} />
      ))}
      {lay.nodes.map((n) => (
        <G key={n.key}>
          <Rect x={n.x} y={n.y} width={lay.nodeWidth} height={n.h} rx={2} fill={colourOf(n.colour)} />
          {n.label.mode === 'two' ? (
            <>
              <SvgText x={n.label.x} y={n.label.y1} textAnchor={n.label.anchor} fontSize={11.5} fontWeight="500" fill={p.ink2}>
                {n.name}
              </SvgText>
              <SvgText x={n.label.x} y={n.label.y2} textAnchor={n.label.anchor} fontSize={12} fontWeight="700" fill={p.ink}>
                {eur0(n.value)}
                {n.label.share !== null ? <TSpan fill={p.ink3}> · {shareText(n.label.share)}</TSpan> : null}
              </SvgText>
            </>
          ) : n.label.mode === 'one' ? (
            <SvgText x={n.label.x} y={n.label.y} textAnchor={n.label.anchor} fontSize={11.5} fontWeight="500" fill={p.ink2}>
              {n.name} <TSpan fontWeight="700" fill={p.ink}>{eur0(n.value)}</TSpan>
            </SvgText>
          ) : null}
        </G>
      ))}
    </Svg>
  );
}
