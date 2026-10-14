/** "HH:mm" → minutes since midnight */
const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const hm = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Dublin',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Minutes since midnight in Europe/Dublin. */
export function dublinMinutes(at: Date): number {
  const parts = hm.formatToParts(at);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/**
 * Whether `at` falls in the user's quiet hours (Europe/Dublin). Handles windows that cross midnight, such as
 * 22:00-08:00. Equal start and end means no quiet hours.
 */
export function isQuietHours(at: Date, start: string, end: string): boolean {
  const now = dublinMinutes(at);
  const s = minutes(start);
  const e = minutes(end);
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
}
