import type { ReactNode } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

const PATHS: Record<string, ReactNode> = {
  overview: <Path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  transactions: <Path d="M4 6h16M4 12h16M4 18h10" />,
  budgets: (
    <>
      <Path d="M4 20h16" />
      <Path d="M6.5 17v-6M12 17V6M17.5 17v-3" />
    </>
  ),
  investments: (
    <>
      <Path d="M3 17l6-6 4 4 8-8" />
      <Path d="M15 7h6v6" />
    </>
  ),
  more: (
    <>
      <Circle cx="6" cy="12" r="1.3" />
      <Circle cx="12" cy="12" r="1.3" />
      <Circle cx="18" cy="12" r="1.3" />
    </>
  ),
  insights: <Path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />,
  goals: (
    <>
      <Circle cx="12" cy="12" r="8" />
      <Circle cx="12" cy="12" r="4" />
    </>
  ),
  tools: (
    <>
      <Path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <Path d="M8.5 7h7M8.5 12h1M12 12h1M15 12h.5M8.5 16h1M12 16h1M15 16h.5" />
    </>
  ),
  settings: (
    <>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  chevron: <Path d="M9 6l6 6-6 6" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: string }): ReactNode {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </Svg>
  );
}
