import { useQueue } from '@finally/api-client';
import { Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icon';
import { usePalette } from '@/lib/theme';

const TABS: Array<{ name: string; title: string; icon: IconName }> = [
  { name: 'index', title: 'Home', icon: 'overview' },
  { name: 'activity', title: 'Activity', icon: 'transactions' },
  { name: 'budgets', title: 'Budgets', icon: 'budgets' },
  { name: 'invest', title: 'Invest', icon: 'investments' },
  { name: 'more', title: 'More', icon: 'more' },
];

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
        tabBarLabelStyle: { fontFamily: 'HankenGrotesk_600SemiBold', fontSize: 10 },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color }) => <Icon name={t.icon} color={String(color)} />,
            ...(t.name === 'activity' && waiting > 0
              ? { tabBarBadge: waiting, tabBarBadgeStyle: { backgroundColor: '#F4E35E', color: '#3D3500', fontFamily: 'HankenGrotesk_600SemiBold', fontSize: 10 } }
              : {}),
          }}
        />
      ))}
    </Tabs>
  );
}
