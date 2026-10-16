/** Which Today cards show, and in what order. Saved per device. */
export interface TodayLayout {
  order: string[];
  hidden: Record<string, boolean>;
}

export const LAYOUT_KEY = 'finally-v4-layout';

/** Read whatever was stored: drop unknown ids and duplicates, append cards that are missing, keep only true flags. */
export function normaliseLayout(raw: unknown, ids: readonly string[]): TodayLayout {
  const src = raw && typeof raw === 'object' ? (raw as { order?: unknown; hidden?: unknown }) : {};
  const stored = Array.isArray(src.order) ? src.order.filter((x): x is string => typeof x === 'string') : [];
  const order = [...new Set(stored.filter((id) => ids.includes(id)))];
  for (const id of ids) if (!order.includes(id)) order.push(id);
  const hiddenIn = src.hidden && typeof src.hidden === 'object' ? (src.hidden as Record<string, unknown>) : {};
  const hidden: Record<string, boolean> = {};
  for (const id of ids) if (hiddenIn[id] === true) hidden[id] = true;
  return { order, hidden };
}

/** Move a card one step up (-1) or down (1). Ends stay put. */
export function moveCard(layout: TodayLayout, id: string, dir: -1 | 1): TodayLayout {
  const i = layout.order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= layout.order.length) return layout;
  const order = [...layout.order];
  [order[i], order[j]] = [order[j]!, order[i]!];
  return { ...layout, order };
}

export function toggleHidden(layout: TodayLayout, id: string): TodayLayout {
  const hidden = { ...layout.hidden };
  if (hidden[id]) delete hidden[id];
  else hidden[id] = true;
  return { ...layout, hidden };
}

export function loadLayout(ids: readonly string[]): TodayLayout {
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    return normaliseLayout(raw ? JSON.parse(raw) : null, ids);
  } catch {
    return normaliseLayout(null, ids);
  }
}

export function saveLayout(layout: TodayLayout): void {
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    /* private window or blocked storage: the layout just lasts this visit */
  }
}
