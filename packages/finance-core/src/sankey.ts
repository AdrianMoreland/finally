import { mergeSmallGroups, type CfShape } from './cashflow';

/** Geometry only: renderers (web SVG, react-native-svg) draw it. Plain numbers, since these are pixels. */
export interface SankeyOptions {
  /** Width of the drawing area. */
  width: number;
  /** Three columns (sources, groups, categories) or two. */
  columns: 2 | 3;
  /** Fixed height; otherwise derived from the content. */
  height?: number;
  /** Node bar width. */
  nodeWidth?: number;
  /** Small drawing (Today, phone): tighter gaps, no shares. */
  mini?: boolean;
  /** Fold groups under this share of the total into "Everything else". */
  merge?: number;
}

export type SankeyLabel =
  | { mode: 'none' }
  | { mode: 'one'; x: number; y: number; anchor: 'start' | 'end' }
  | { mode: 'two'; x: number; y1: number; y2: number; anchor: 'start' | 'end'; share: number | null };

export interface SankeyNode {
  /** `s:`, `g:` or `c:` prefixed. */
  key: string;
  id: string;
  col: 0 | 1 | 2;
  /** Category nodes: the group they belong to. */
  gid?: string;
  name: string;
  colour: string;
  value: number;
  pass: boolean;
  x: number;
  y: number;
  h: number;
  label: SankeyLabel;
}

export interface SankeyLink {
  from: string;
  to: string;
  value: number;
  pass: boolean;
  x0: number;
  x1: number;
  /** Closed ribbon path. */
  d: string;
  h: number;
  fromColour: string;
  toColour: string;
}

export interface SankeyLayout {
  width: number;
  height: number;
  nodeWidth: number;
  nodes: SankeyNode[];
  links: SankeyLink[];
  /** True when there is nothing to draw. */
  empty: boolean;
}

interface Work {
  key: string;
  id: string;
  col: 0 | 1 | 2;
  gid?: string;
  name: string;
  colour: string;
  v: number;
  pass: boolean;
  x: number;
  y: number;
  h: number;
  oy: number;
  iy: number;
}

const sumOf = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const f1 = (n: number): string => n.toFixed(1);

/** Port of the prototype's layout: stack both sides over the same total and link the overlaps, so ribbons never cross. */
export function layoutSankey(input: CfShape, o: SankeyOptions): SankeyLayout {
  const cf = o.merge ? mergeSmallGroups(input, o.merge) : input;
  const nw = o.nodeWidth ?? 10;
  const top = 4;
  const bot = 4;
  const three = o.columns === 3;
  const mk = (col: 0 | 1 | 2, prefix: string, n: { id: string; name: string; colour: string; v: string; pass?: boolean }, gid?: string): Work => ({
    key: `${prefix}${n.id}`,
    id: n.id,
    col,
    gid,
    name: n.name,
    colour: n.colour,
    v: Number(n.v),
    pass: !!n.pass,
    x: 0,
    y: 0,
    h: 0,
    oy: 0,
    iy: 0,
  });
  const c0 = cf.sources.map((n) => mk(0, 's:', n));
  const c1 = cf.groups.map((n) => mk(1, 'g:', n));
  const c2 = three ? cf.groups.flatMap((g) => g.cats.map((c) => mk(2, 'c:', c, g.id))) : [];
  const cols = three ? [c0, c1, c2] : [c0, c1];
  const gaps = three ? [14, 12, 11] : [14, o.mini ? 7 : 10];
  const out = Number(cf.out) || 1;
  const passV = sumOf(c1.filter((g) => g.pass).map((g) => g.v));
  const grow = 1 + passV / out;
  const H = o.height ?? Math.round((three ? Math.max(460, c2.length * 30 + 40) : 400) * grow);
  const usable = H - top - bot;
  if (!c0.length || !c1.length) return { width: o.width, height: H, nodeWidth: nw, nodes: [], links: [], empty: true };

  const k = Math.min(...cols.filter((c) => c.length).map((c, i) => (usable - gaps[i]! * (c.length - 1)) / Math.max(1e-9, sumOf(c.map((n) => n.v)))));
  const X = three ? [0, Math.round(o.width * 0.5 - nw / 2), o.width - nw] : [0, o.width - nw];
  cols.forEach((col, ci) => {
    const h = sumOf(col.map((n) => n.v)) * k + gaps[ci]! * (col.length - 1);
    let y = top + (usable - h) / 2;
    for (const n of col) {
      n.x = X[ci]!;
      n.y = y;
      n.h = Math.max(1.5, n.v * k);
      n.oy = y;
      n.iy = y;
      y += n.v * k + gaps[ci]!;
    }
  });

  const pairs: Array<{ s: Work; t: Work; v: number }> = [];
  const mainS = c0.filter((s) => !s.pass);
  const mainG = c1.filter((g) => !g.pass);
  const T = sumOf(mainG.map((g) => g.v)) || 1;
  const sTotal = Math.max(1e-9, sumOf(mainS.map((x) => x.v)));
  {
    let a = 0;
    const iv = mainG.map((g) => {
      const r: [number, number] = [a, a + g.v];
      a += g.v;
      return r;
    });
    let b0 = 0;
    for (const s of mainS) {
      const b1 = b0 + s.v * (T / sTotal);
      mainG.forEach((g, j) => {
        const v = Math.min(b1, iv[j]![1]) - Math.max(b0, iv[j]![0]);
        if (v > 0.01) pairs.push({ s, t: g, v });
      });
      b0 = b1;
    }
  }
  for (const s of c0.filter((x) => x.pass)) for (const g of c1.filter((x) => x.pass)) pairs.push({ s, t: g, v: Math.min(s.v, g.v) });
  if (three) for (const g of c1) for (const c of c2.filter((x) => x.gid === g.id)) pairs.push({ s: g, t: c, v: c.v });

  const links: SankeyLink[] = [];
  for (const { s, t, v } of pairs) {
    const h = v * k;
    if (h < 0.25) continue;
    const x0 = s.x + nw;
    const x1 = t.x;
    const y0 = s.oy;
    const y1 = t.iy;
    s.oy += h;
    t.iy += h;
    const xm = (x0 + x1) / 2;
    const d = `M${f1(x0)} ${f1(y0)}C${f1(xm)} ${f1(y0)} ${f1(xm)} ${f1(y1)} ${f1(x1)} ${f1(y1)}L${f1(x1)} ${f1(y1 + h)}C${f1(xm)} ${f1(y1 + h)} ${f1(xm)} ${f1(y0 + h)} ${f1(x0)} ${f1(y0 + h)}Z`;
    links.push({ from: s.key, to: t.key, value: v, pass: s.pass, x0, x1, d, h, fromColour: s.colour, toColour: t.colour });
  }

  const tot = Number(cf.out) || 1;
  const totIn = Number(cf.inn) + Math.max(0, Number(cf.out) - Number(cf.inn)) || 1;
  const nodes: SankeyNode[] = [];
  cols.forEach((col, ci) =>
    col.forEach((n) => {
      const left = ci === 0;
      const x = left ? n.x + nw + 8 : n.x - 8;
      const anchor = left ? 'start' : 'end';
      const cy = n.y + n.h / 2;
      const pitch = n.h + gaps[ci]!;
      let label: SankeyLabel = { mode: 'none' };
      if (n.h >= 30) label = { mode: 'two', x, y1: cy - 3, y2: cy + 13, anchor, share: n.pass || o.mini ? null : n.v / (left ? totIn : tot) };
      else if (pitch >= 12.5) label = { mode: 'one', x, y: cy + 4, anchor };
      nodes.push({ key: n.key, id: n.id, col: n.col, gid: n.gid, name: n.name, colour: n.colour, value: n.v, pass: n.pass, x: n.x, y: n.y, h: n.h, label });
    }),
  );
  return { width: o.width, height: H, nodeWidth: nw, nodes, links, empty: false };
}

/** A node is lit when it is the selection, or (for a category) when its whole group is selected. */
export function isNodeSelected(node: Pick<SankeyNode, 'key' | 'col' | 'gid'>, sel: string | null): boolean {
  if (!sel) return false;
  return node.key === sel || (node.col === 2 && sel === `g:${node.gid}`);
}

/** Share text such as `35%` (one decimal under 10%). */
export function shareText(share: number): string {
  return `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
}
