import { CalendarCheck, House, Sprout, Wallet, type LucideIcon } from 'lucide-react';

/** One navigation for web and phone: four sections, each with the pages inside it. */
export interface NavPage {
  to: string;
  label: string;
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
      { to: '/money/payments', label: 'Payments' },
      { to: '/money/sort', label: 'To sort' },
      { to: '/money/budgets', label: 'Budgets' },
      { to: '/money/bills', label: 'Bills' },
      { to: '/money/month', label: 'Month' },
      { to: '/money/review', label: 'Review' },
    ],
  },
  {
    key: 'plan',
    label: 'Plan',
    to: '/plan/payday',
    icon: CalendarCheck,
    pages: [
      { to: '/plan/payday', label: 'Payday plan' },
      { to: '/plan/pots', label: 'Pots' },
      { to: '/plan/people', label: 'People' },
      { to: '/plan/bonus', label: 'Bonus' },
      { to: '/plan/tax', label: 'Tax & pay' },
    ],
  },
  {
    key: 'grow',
    label: 'Grow',
    to: '/grow/investing',
    icon: Sprout,
    pages: [
      { to: '/grow/investing', label: 'Investing' },
      { to: '/grow/freedom', label: 'Freedom' },
      { to: '/grow/holdings', label: 'Holdings' },
      { to: '/grow/tools', label: 'Tools' },
    ],
  },
];

export function sectionOf(pathname: string): NavSection {
  if (pathname === '/' || pathname === '') return SECTIONS[0]!;
  return SECTIONS.find((s) => s.key !== 'today' && pathname.startsWith(`/${s.key}`)) ?? SECTIONS[0]!;
}
