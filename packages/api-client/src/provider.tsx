import { createContext, useContext, type ReactNode } from 'react';
import { FinallyApi } from './client';

const ApiContext = createContext<FinallyApi | null>(null);

export function ApiProvider({ api, children }: { api: FinallyApi; children: ReactNode }): ReactNode {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): FinallyApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
