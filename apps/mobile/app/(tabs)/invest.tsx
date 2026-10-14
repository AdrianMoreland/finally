import { eur, pct, shortDate, useInvestments, usePriceSeries } from '@finally/api-client';
import { SIGNALS_DISCLAIMER, type SignalDto } from '@finally/contracts';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { LineArea } from '@/components/charts/charts';
import { ErrorCard, LoadingCard, Screen } from '@/components/screen';
import { Card, SeverityTag, Text, Track } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

/** Signals carry no severity of their own; map the rule to how loudly it should speak. */
function severityOf(rule: string): 'ACT' | 'WATCH' | 'INFO' {
  if (rule.startsWith('drawdown_30') || rule === 'sma_death_cross') return 'ACT';
  if (rule.startsWith('drawdown') || rule.startsWith('rsi') || rule === 'allocation_drift' || rule === 'concentration') return 'WATCH';
  return 'INFO';
}

function Signal({ s, first }: { s: SignalDto; first: boolean }): ReactNode {
  return (
    <View className={cn('flex-row items-start justify-between gap-3 py-[9px]', !first && 'border-t border-rule')}>
      <View className="min-w-0 flex-1">
        <Text variant="semi" numberOfLines={2}>
          {s.title}
        </Text>
        <Text variant="mono" className="mt-0.5" numberOfLines={1}>
          rule {s.rule}
        </Text>
      </View>
      <SeverityTag severity={severityOf(s.rule)} />
    </View>
  );
}

export default function Invest(): ReactNode {
  const inv = useInvestments();
  const [selected, setSelected] = useState<string | null>(null);
  const symbolId = selected ?? inv.data?.holdings[0]?.instrument.id;
  const series = usePriceSeries(symbolId, 120);

  if (inv.error) {
    return (
      <Screen eyebrow="Prices delayed" title="Invest">
        <ErrorCard error={inv.error} retry={() => void inv.refetch()} />
      </Screen>
    );
  }
  if (!inv.data) {
    return (
      <Screen eyebrow="Prices delayed" title="Invest">
        <LoadingCard height={200} />
      </Screen>
    );
  }
  const d = inv.data;
  const gain = Number(d.gain);
  const lastDate = d.holdings.map((h) => h.priceDate).filter(Boolean).sort().at(-1);

  return (
    <Screen eyebrow={`Delayed prices${lastDate ? ` · ${shortDate(lastDate)}` : ''}`} title="Invest">
      <Card>
        <Text variant="big">{eur(d.total)}</Text>
        <Text variant="small" className="mt-1.5">
          <Text variant="small" className={gain >= 0 ? 'text-good' : 'text-bad'}>
            {eur(d.gain, { signed: true })} · {pct(d.gainPct)}
          </Text>{' '}
          all time
        </Text>
        <View className="mt-2">
          <LineArea values={d.series.map((p) => Number(p.value))} height={90} />
        </View>
      </Card>

      <Card className="gap-3">
        <View className="flex-row gap-2">
          {d.holdings.map((h) => (
            <Pressable
              key={h.instrument.id}
              onPress={() => setSelected(h.instrument.id)}
              className={cn('rounded-chip border px-3 py-1.5', h.instrument.id === symbolId ? 'border-ink bg-ink' : 'border-rule bg-surface')}
            >
              <Text className={cn('font-body-semi text-[12px]', h.instrument.id === symbolId ? 'text-paper' : 'text-ink-2')}>{h.instrument.symbol}</Text>
            </Pressable>
          ))}
        </View>
        {series.data ? (
          <LineArea values={series.data.bars.map((b) => Number(b.close))} secondary={series.data.sma50} height={150} showAxis />
        ) : (
          <LoadingCard height={150} />
        )}
        <Text variant="small">Price · dashed line is the 50-day average</Text>
      </Card>

      <Card className="px-4 py-3">
        {d.holdings.map((h, i) => (
          <View key={h.instrument.id} className={cn('gap-1.5 py-2.5', i > 0 && 'border-t border-rule')}>
            <View className="flex-row justify-between">
              <Text variant="semi">{h.instrument.symbol}</Text>
              <Text variant="num">{eur(h.value)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text variant="small">{Number(h.quantity)} × {eur(h.price)}</Text>
              <Text variant="small" className={Number(h.gain) >= 0 ? 'text-good' : 'text-bad'}>
                {eur(h.gain, { signed: true })} · {pct(h.gainPct)}
              </Text>
            </View>
            <Track value={h.share} tick={h.targetShare} height={6} />
            <Text variant="small">{pct(h.share)} of portfolio{h.targetShare != null ? ` · target ${h.targetShare}%` : ''}</Text>
          </View>
        ))}
      </Card>

      <Card className="px-4 py-3">
        <Text variant="eyebrow" className="mb-1">
          Signals
        </Text>
        {d.signals.length === 0 ? <Text variant="muted">No signals right now.</Text> : null}
        {d.signals.slice(0, 6).map((s, i) => (
          <Signal key={s.id} s={s} first={i === 0} />
        ))}
      </Card>

      <Card className="px-4 py-3">
        <Text variant="eyebrow" className="mb-1">
          Deemed disposal
        </Text>
        {d.deemedDisposals.slice(0, 4).map((l, i) => {
          const a = l.anniversaries[0];
          return a ? (
            <View key={l.lotId} className={cn('flex-row justify-between py-2', i > 0 && 'border-t border-rule')}>
              <Text variant="small" className="text-ink">
                {l.symbol} · {Number(l.quantity)} units
              </Text>
              <Text variant="small">
                {shortDate(a.date)} {a.date.slice(0, 4)} · est. {eur(a.estimatedTax)}
              </Text>
            </View>
          ) : null;
        })}
      </Card>

      <Text variant="small" className="px-1 text-ink-3">
        {SIGNALS_DISCLAIMER} Tax figures are estimates.
      </Text>
    </Screen>
  );
}
