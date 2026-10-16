import { eur, eur0 } from '@finally/api-client';
import { isNodeSelected, layoutSankey, shareText, type CfShape, type SankeyNode } from '@finally/finance-core';
import { useId, useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const css = (name: string): string => (name.startsWith('--') ? `var(${name})` : name);

interface Props {
  cf: CfShape;
  /** Three columns (sources, groups, categories) or two. */
  columns: 2 | 3;
  width?: number;
  height?: number;
  nodeWidth?: number;
  mini?: boolean;
  merge?: number;
  /** Selected node key: `s:…`, `g:…` or `c:…`. */
  sel?: string | null;
  onSelect?: (key: string) => void;
  /** Screen-reader summary of the whole chart. */
  label: string;
}

/** The cash flow Sankey. Geometry comes from finance-core; this only draws it. */
export function Sankey({ cf, columns, width = 1000, height, nodeWidth, mini, merge, sel = null, onSelect, label }: Props): ReactNode {
  const uid = useId().replace(/:/g, '');
  const lay = useMemo(() => layoutSankey(cf, { width, columns, height, nodeWidth, mini, merge }), [cf, width, columns, height, nodeWidth, mini, merge]);
  if (lay.empty) return <p className="m-0 text-[13px] text-ink-3">Nothing moved in this period.</p>;
  const byKey = new Map(lay.nodes.map((n) => [n.key, n]));
  const hit = (n: SankeyNode | undefined): boolean => !!n && isNodeSelected(n, sel);
  return (
    <svg className={cn('cf-svg', sel && 'has-sel')} viewBox={`0 0 ${lay.width} ${lay.height}`} width="100%" role="img" aria-label={label}>
      <defs>
        {lay.links.map((l, i) => (
          <linearGradient key={i} id={`cfg-${uid}-${i}`} gradientUnits="userSpaceOnUse" x1={l.x0} x2={l.x1} y1="0" y2="0">
            <stop offset="0" style={{ stopColor: css(l.fromColour) }} />
            <stop offset="1" style={{ stopColor: css(l.toColour) }} />
          </linearGradient>
        ))}
      </defs>
      {lay.links.map((l, i) => (
        <path key={i} d={l.d} fill={`url(#cfg-${uid}-${i})`} className={cn('cf-link', (hit(byKey.get(l.from)) || hit(byKey.get(l.to))) && 'on', l.pass && 'pass')} />
      ))}
      {lay.nodes.map((n) => {
        const interactive = !!onSelect;
        const lab = n.label;
        return (
          <g
            key={n.key}
            className={cn('cf-node', hit(n) && 'on')}
            {...(interactive
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': `${n.name}, ${eur0(n.value)}`,
                  onClick: () => onSelect(n.key),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(n.key);
                    }
                  },
                }
              : {})}
          >
            <rect x={n.x} y={n.y} width={lay.nodeWidth} height={n.h} rx="2" style={{ fill: css(n.colour) }} />
            {lab.mode === 'two' ? (
              <>
                <text className="cf-l1" x={lab.x} y={lab.y1} textAnchor={lab.anchor}>
                  {n.name}
                </text>
                <text className="cf-l2" x={lab.x} y={lab.y2} textAnchor={lab.anchor}>
                  {eur0(n.value)}
                  {lab.share !== null ? <tspan className="cf-l3"> · {shareText(lab.share)}</tspan> : null}
                </text>
              </>
            ) : lab.mode === 'one' ? (
              <text className="cf-l1" x={lab.x} y={lab.y} textAnchor={lab.anchor}>
                {n.name} <tspan className="cf-l2">{eur0(n.value)}</tspan>
              </text>
            ) : null}
            <title>{`${n.name}: ${eur(n.value)}`}</title>
          </g>
        );
      })}
    </svg>
  );
}
