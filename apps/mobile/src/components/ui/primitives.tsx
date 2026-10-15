import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View, type PressableProps, type TextProps, type ViewProps } from 'react-native';
import { cn } from '@/lib/cn';

/* -------------------------------------------------------------- Text */

const textVariants = cva('text-ink', {
  variants: {
    variant: {
      body: 'font-body text-[14px]',
      semi: 'font-body-semi text-[14px]',
      muted: 'font-body text-[13px] text-ink-2',
      small: 'font-body text-[12px] text-ink-2',
      eyebrow: 'font-body-bold text-[11px] uppercase tracking-[1.2px] text-brand',
      mono: 'font-mono text-[11px] text-ink-3',
      title: 'font-display text-[30px] leading-[34px]',
      heading: 'font-display-medium text-[17px]',
      big: 'font-display-medium text-[36px] leading-[40px] tracking-[-0.4px]',
      num: 'font-body-semi text-[14px]',
    },
  },
  defaultVariants: { variant: 'body' },
});

export function Text({ variant, className, ...props }: TextProps & VariantProps<typeof textVariants>): ReactNode {
  return <RNText className={cn(textVariants({ variant }), className)} {...props} />;
}

/* -------------------------------------------------------------- Card */

export function Card({ className, ...props }: ViewProps): ReactNode {
  return <View className={cn('rounded-card bg-surface p-4', className)} {...props} />;
}

/* ------------------------------------------------------------ Button */

const buttonVariants = cva('flex-row items-center justify-center gap-2 rounded-control px-4 py-3', {
  variants: {
    variant: {
      primary: 'bg-fill',
      outline: 'border-[1.5px] border-rule',
      ghost: '',
      marker: 'bg-marker',
      danger: 'border-[1.5px] border-bad',
    },
    size: { md: '', sm: 'px-3 py-2' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

const buttonText: Record<string, string> = {
  primary: 'text-on-fill',
  outline: 'text-ink',
  ghost: 'text-brand',
  marker: 'text-marker-ink',
  danger: 'text-bad',
};

export function Button({
  variant = 'primary',
  size,
  loading,
  children,
  className,
  disabled,
  ...props
}: PressableProps & VariantProps<typeof buttonVariants> & { loading?: boolean; className?: string; children: ReactNode }): ReactNode {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), (disabled || loading) && 'opacity-60', className)}
      {...props}
    >
      {loading ? <ActivityIndicator size="small" /> : null}
      {typeof children === 'string' ? (
        <Text variant="semi" className={buttonText[variant ?? 'primary']}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------- Track */

/** Progress bar with an optional tick at "where an even pace would put you today". */
export function Track({
  value,
  tick,
  color,
  height = 6,
}: {
  value: number;
  tick?: number | null;
  color?: string;
  height?: number;
}): ReactNode {
  const clamp = (n: number): number => Math.max(0, Math.min(100, n));
  return (
    <View className="rounded-[3px] bg-track" style={{ height, justifyContent: 'center' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp(value)) }}>
      <View className={cn('absolute bottom-0 left-0 top-0 rounded-[3px]', !color && 'bg-fill')} style={{ width: `${clamp(value)}%`, backgroundColor: color }} />
      {tick != null ? (
        <View className="absolute w-[2px] bg-needle" style={{ left: `${clamp(tick)}%`, top: -4, bottom: -4 }} />
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------- Severity */

const SEV = {
  ACT: { box: 'border-pink', text: 'text-pink', label: 'ACT' },
  WATCH: { box: 'border-warn', text: 'text-warn', label: 'WATCH' },
  INFO: { box: 'border-brand', text: 'text-brand', label: 'INFO' },
  YOU: { box: 'border-marker bg-marker', text: 'text-marker-ink', label: 'YOU' },
} as const;

export function SeverityTag({ severity }: { severity: keyof typeof SEV }): ReactNode {
  const s = SEV[severity];
  return (
    <View className={cn('self-start rounded-[3px] border-[1.5px] px-[6px] py-[2px]', s.box)}>
      <Text className={cn('font-body-bold text-[10px] tracking-[1px]', s.text)}>{s.label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------ Marker */

/** The highlighter-yellow chip: anything waiting for the user, and nothing else. */
export function MarkerChip({ children, onPress }: { children: ReactNode; onPress?: () => void }): ReactNode {
  const inner = (
    <View className="self-start flex-row items-center gap-2 rounded-chip bg-marker px-3 py-2">
      <Text variant="semi" className="text-marker-ink">
        {children}
      </Text>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button">
      {inner}
    </Pressable>
  ) : (
    inner
  );
}
