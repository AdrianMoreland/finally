import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/lib/theme';

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--toast-bg)',
          '--normal-text': 'var(--toast-ink)',
          '--normal-border': 'transparent',
          '--border-radius': '6px',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
