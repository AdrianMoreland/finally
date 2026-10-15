import { isPrivate, setPrivacy } from '@finally/api-client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface PrivacyCtx {
  on: boolean;
  toggle: () => void;
}

const Ctx = createContext<PrivacyCtx>({ on: false, toggle: () => undefined });

/** Privacy mode hides every amount (the formatter holds the switch). Screens are re-keyed when it flips. */
export function PrivacyProvider({ children }: { children: ReactNode }): ReactNode {
  const [on, setOn] = useState(isPrivate);
  const toggle = useCallback(() => {
    setOn((prev) => {
      setPrivacy(!prev);
      return !prev;
    });
  }, []);
  const value = useMemo(() => ({ on, toggle }), [on, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePrivacy = (): PrivacyCtx => useContext(Ctx);
