import { createContext, useContext } from 'react';
import type { DriftMetric } from '../data/types';

export interface DiffViewState {
  metric: DriftMetric;
  setMetric: (m: DriftMetric) => void;
  selectedBranch: string | null;
  setSelectedBranch: (b: string | null) => void;
}

export const DiffViewCtx = createContext<DiffViewState | null>(null);

export function useDiffView(): DiffViewState {
  const v = useContext(DiffViewCtx);
  if (!v) throw new Error('useDiffView must be used inside DiffViewProvider');
  return v;
}
