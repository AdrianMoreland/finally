import type { ReactNode } from 'react';
import { HubList } from '@/components/kit';
import { Screen } from '@/components/screen';
import { SubTabs } from '@/components/sub-tabs';

export default function Grow(): ReactNode {
  return (
    <Screen eyebrow="Finally" title="Grow">
      <SubTabs
        active="investing"
        tabs={[
          { key: 'investing', label: 'Investing', href: '/investing' },
          { key: 'freedom', label: 'Freedom', href: '/freedom' },
          { key: 'holdings', label: 'Holdings', href: '/(tabs)/invest' },
          { key: 'tools', label: 'Tools', href: '/tools' },
        ]}
      />
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
