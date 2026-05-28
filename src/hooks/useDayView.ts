import { createContext, useContext } from 'react';
import type { DriftMetric, PanelMode } from '../data/types';

export type PinnedPos = readonly [number, number, number];

export interface DayViewState {
  metric: DriftMetric;
  setMetric: (m: DriftMetric) => void;
  selectedBranch: string | null;
  setSelectedBranch: (b: string | null) => void;
  panelMode: PanelMode;
  setPanelMode: (m: PanelMode) => void;
  pinnedBranches: ReadonlyMap<string, PinnedPos>;
  pinBranch: (branch: string, pos: PinnedPos) => void;
  unpinBranch: (branch: string) => void;
  clearPins: () => void;
}

export const DayViewCtx = createContext<DayViewState | null>(null);

export function useDayView(): DayViewState {
  const v = useContext(DayViewCtx);
  if (!v) throw new Error('useDayView must be used inside DayViewProvider');
  return v;
}
