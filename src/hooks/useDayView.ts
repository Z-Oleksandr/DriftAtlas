import { createContext, useContext } from 'react';
import type { DriftMetric } from '../data/types';

export interface DayViewState {
  metric: DriftMetric;
  setMetric: (m: DriftMetric) => void;
  selectedBranch: string | null;
  setSelectedBranch: (b: string | null) => void;
}

export const DayViewCtx = createContext<DayViewState | null>(null);

export function useDayView(): DayViewState {
  const v = useContext(DayViewCtx);
  if (!v) throw new Error('useDayView must be used inside DayViewProvider');
  return v;
}
