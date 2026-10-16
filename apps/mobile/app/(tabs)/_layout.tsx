import { useQueue } from '@finally/api-client';
import { Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icon';
import { usePalette } from '@/lib/theme';

/** One navigation for web and phone: Today, Money, Plan, Grow. The other files here are pages reached from them. */
const TABS: Array<{ name: string; title: string; icon: IconName }> = [
  { name: 'index', title: 'Today', icon: 'overview' },
  { name: 'money', title: 'Money', icon: 'transactions' },
  { name: 'plan', title: 'Plan', icon: 'goals' },
  { name: 'grow', title: 'Grow', icon: 'investments' },
];
const HIDDEN = ['activity', 'budgets', 'invest'];

export default function TabsLayout(): ReactNode {
  const p = usePalette();
  const queue = useQueue();
  const waiting = queue.data?.count ?? 0;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.brand,
        tabBarInactiveTintColor: p.ink3,
        tabBarStyle: { backgroundColor: p.surface, borderTopColor: p.rule },
        tabBarLabelStyle: { fontFamily: 'Figtree_600SemiBold', fontSize: 10 },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color }) => <Icon name={t.icon} color={String(color)} />,
            ...(t.name === 'money' && waiting > 0
              ? { tabBarBadge: waiting, tabBarBadgeStyle: { backgroundColor: p.marker, color: p.markerInk, fontFamily: 'Figtree_600SemiBold', fontSize: 10 } }
              : {}),
          }}
        />
      ))}
      {HIDDEN.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  );
}
