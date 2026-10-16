import { useQueue } from '@finally/api-client';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { CashflowPane } from '@/components/cashflow-pane';
import { Screen } from '@/components/screen';
import { SubTabs, type SubTab } from '@/components/sub-tabs';
import { ActivityList } from './activity';

/** Money: Activity and Cash flow open in place; the other chips open their screens. */
export default function Money(): ReactNode {
  const queue = useQueue();
  const params = useLocalSearchParams<{ sub?: string }>();
  const [sub, setSub] = useState<'tx' | 'flow'>(params.sub === 'flow' ? 'flow' : 'tx');
  const tabs: SubTab[] = [
    { key: 'tx', label: 'Activity' },
    { key: 'sort', label: 'To sort', href: '/categorise', badge: queue.data?.count },
    { key: 'flow', label: 'Cash flow' },
    { key: 'budgets', label: 'Budgets', href: '/(tabs)/budgets' },
    { key: 'bills', label: 'Bills', href: '/bills' },
    { key: 'month', label: 'This month', href: '/month' },
    { key: 'review', label: 'Review', href: '/review' },
  ];
  const chips = <SubTabs tabs={tabs} active={sub} onSelect={(k) => setSub(k as 'tx' | 'flow')} />;
  if (sub === 'tx') return <ActivityList top={chips} />;
  return (
    <Screen eyebrow="Where your money went" title="Money">
      {chips}
      <CashflowPane />
    </Screen>
  );
}
