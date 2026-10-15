import type { ReactNode } from 'react';
import { HubList } from '@/components/kit';
import { Screen } from '@/components/screen';

export default function Grow(): ReactNode {
  return (
    <Screen eyebrow="Finally" title="Grow">
      <HubList
        items={[
          { href: '/investing', label: 'Investing', note: 'Readiness, rules, wrappers, practice account' },
          { href: '/freedom', label: 'Freedom', note: 'Your "enough" number' },
          { href: '/(tabs)/invest', label: 'Holdings', note: 'What you own and signals' },
          { href: '/tools', label: 'Tools', note: 'Calculators' },
        ]}
      />
    </Screen>
  );
}
