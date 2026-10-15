import { useQueue } from '@finally/api-client';
import type { ReactNode } from 'react';
import { HubList } from '@/components/kit';
import { Screen } from '@/components/screen';

export default function Money(): ReactNode {
  const queue = useQueue();
  return (
    <Screen eyebrow="Finally" title="Money">
      <HubList
        items={[
          { href: '/(tabs)/activity', label: 'Payments', note: 'Every payment, grouped by day' },
          { href: '/categorise', label: 'To sort', note: 'One tap per merchant', badge: queue.data?.count },
          { href: '/(tabs)/budgets', label: 'Budgets', note: 'How much is left, and a day' },
          { href: '/bills', label: 'Bills & subscriptions', note: 'Found from your history' },
          { href: '/month', label: 'This month', note: 'Are you on track?' },
          { href: '/review', label: 'Review', note: 'Weekly review and month close' },
        ]}
      />
    </Screen>
  );
}
