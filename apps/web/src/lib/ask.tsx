import { useAsk, useAskEvaluate } from '@finally/api-client';
import type { AskResponse, ParsedQueryDto } from '@finally/contracts';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface AskTurn {
  id: number;
  text: string;
  response: AskResponse | null;
  pending: boolean;
  error: string | null;
}

interface AskCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
  thread: AskTurn[];
  /** Ask a question (opens the panel). Follow-ups such as "and September?" reuse the last spending question. */
  submit: (text: string) => void;
  /** Re-run a turn after its "Read as" chips were changed. */
  reread: (turnId: number, query: ParsedQueryDto) => void;
  clear: () => void;
}

const Ctx = createContext<AskCtx | null>(null);

export function AskProvider({ children }: { children: ReactNode }): ReactNode {
  const ask = useAsk();
  const evaluate = useAskEvaluate();
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<AskTurn[]>([]);
  const [seq, setSeq] = useState(1);

  const patch = useCallback((id: number, p: Partial<AskTurn>): void => setThread((t) => t.map((x) => (x.id === id ? { ...x, ...p } : x))), []);

  const submit = useCallback(
    (raw: string): void => {
      const text = raw.trim();
      if (!text) return;
      const id = seq;
      setSeq(id + 1);
      const previous = [...thread].reverse().find((t) => t.response?.query)?.response?.query ?? null;
      setThread((t) => [...t, { id, text, response: null, pending: true, error: null }]);
      setOpen(true);
      ask.mutate(
        { text, previous },
        {
          onSuccess: (response) => patch(id, { response, pending: false }),
          onError: (e) => patch(id, { pending: false, error: e instanceof Error ? e.message : 'Something went wrong' }),
        },
      );
    },
    [ask, patch, seq, thread],
  );

  const reread = useCallback(
    (turnId: number, query: ParsedQueryDto): void => {
      patch(turnId, { pending: true });
      evaluate.mutate(query, {
        onSuccess: (response) => patch(turnId, { response, pending: false }),
        onError: (e) => patch(turnId, { pending: false, error: e instanceof Error ? e.message : 'Something went wrong' }),
      });
    },
    [evaluate, patch],
  );

  const value = useMemo<AskCtx>(() => ({ open, setOpen, thread, submit, reread, clear: () => setThread([]) }), [open, thread, submit, reread]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAskPanel(): AskCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAskPanel outside AskProvider');
  return v;
}
