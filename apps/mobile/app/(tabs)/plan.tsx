import type { ReactNode } from 'react';
import { HubList } from '@/components/kit';
import { Screen } from '@/components/screen';

export default function Plan(): ReactNode {
  return (
    <Screen eyebrow="Finally" title="Plan">
      <HubList
        items={[
          { href: '/payday', label: 'Payday plan', note: 'Where your pay goes, and the standing orders' },
          { href: '/pots', label: 'Pots & ladder', note: 'Rainy day, planned spends, treats, investing' },
          { href: '/people', label: 'People', note: 'What you owe and what is owed to you' },
          { href: '/bonus', label: 'Bonus', note: 'What a bonus is worth after tax' },
          { href: '/tax', label: 'Tax & pay', note: 'Credits, payslip check, take-home' },
        ]}
      />
    </Screen>
  );
}
