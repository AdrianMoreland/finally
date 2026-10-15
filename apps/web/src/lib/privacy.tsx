import { isPrivate, setPrivacy } from '@finally/api-client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const KEY = 'finally-privacy';

interface PrivacyCtx {
  on: boolean;
  toggle: () => void;
}

const Ctx = createContext<PrivacyCtx | null>(null);

const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

// Set before the first render so no amount flashes on screen.
setPrivacy(read());

/** Privacy mode hides every amount. The formatter holds the switch; this context re-renders the app when it flips. */
export function PrivacyProvider({ children }: { children: ReactNode }): ReactNode {
  const [on, setOn] = useState(isPrivate);
  const toggle = useCallback(() => {
    setOn((prev) => {
      const next = !prev;
      setPrivacy(next);
      try {
        localStorage.setItem(KEY, next ? '1' : '0');
      } catch {
        /* private browsing: the choice just does not persist */
      }
      return next;
    });
  }, []);
  const value = useMemo(() => ({ on, toggle }), [on, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrivacy(): PrivacyCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePrivacy outside PrivacyProvider');
  return v;
}
