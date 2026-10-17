import {
  Briefcase,
  CalendarCheck,
  ChartPie,
  Calculator,
  ClipboardCheck,
  Gift,
  House,
  Infinity as InfinityIcon,
  ListChecks,
  PiggyBank,
  Receipt,
  ReceiptText,
  Sprout,
  Target,
  TrendingUp,
  Users,
  Waypoints,
  Wallet,
  CalendarDays,
  LayoutList,
  type LucideIcon,
} from 'lucide-react';

/** One navigation for web and phone: four sections, each with the pages inside it. */
export interface NavPage {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  key: 'today' | 'money' | 'plan' | 'grow';
  label: string;
  to: string;
  icon: LucideIcon;
  /** Pages shown as chips or an indented list when the section is open. */
  pages: NavPage[];
}

export const SECTIONS: NavSection[] = [
  { key: 'today', label: 'Today', to: '/', icon: House, pages: [] },
  {
    key: 'money',
    label: 'Money',
    to: '/money/payments',
    icon: Wallet,
    pages: [
      { to: '/money/payments', label: 'Transactions', icon: LayoutList },
      { to: '/money/sort', label: 'To sort', icon: ListChecks },
      { to: '/money/cashflow', label: 'Cash flow', icon: Waypoints },
      { to: '/money/spending', label: 'Spending', icon: ChartPie },
      { to: '/money/budgets', label: 'Budgets', icon: Target },
      { to: '/money/bills', label: 'Bills & subscriptions', icon: Receipt },
      { to: '/money/month', label: 'This month', icon: CalendarDays },
      { to: '/money/review', label: 'Review', icon: ClipboardCheck },
    ],
  },
  {
    key: 'plan',
    label: 'Plan',
    to: '/plan/payday',
    icon: CalendarCheck,
    pages: [
      { to: '/plan/payday', label: 'Payday plan', icon: CalendarCheck },
      { to: '/plan/pots', label: 'Pots', icon: PiggyBank },
      { to: '/plan/people', label: 'People', icon: Users },
      { to: '/plan/bonus', label: 'Bonus', icon: Gift },
      { to: '/plan/tax', label: 'Tax & pay', icon: ReceiptText },
    ],
  },
  {
    key: 'grow',
    label: 'Grow',
    to: '/grow/investing',
    icon: Sprout,
    pages: [
      { to: '/grow/investing', label: 'Investing', icon: TrendingUp },
      { to: '/grow/freedom', label: 'Freedom', icon: InfinityIcon },
      { to: '/grow/holdings', label: 'Holdings', icon: Briefcase },
      { to: '/grow/tools', label: 'Tools', icon: Calculator },
    ],
  },
];

export function sectionOf(pathname: string): NavSection {
  if (pathname === '/' || pathname === '') return SECTIONS[0]!;
  return SECTIONS.find((s) => s.key !== 'today' && pathname.startsWith(`/${s.key}`)) ?? SECTIONS[0]!;
}
