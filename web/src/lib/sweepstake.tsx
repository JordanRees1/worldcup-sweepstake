import { createContext, useContext } from 'react';

/** The active sweepstake code (from the `/s/:code` route), provided to all tenant screens/hooks. */
const SweepstakeCodeContext = createContext<string>('');

export const SweepstakeCodeProvider = SweepstakeCodeContext.Provider;

export function useSweepstakeCode(): string {
  return useContext(SweepstakeCodeContext);
}
