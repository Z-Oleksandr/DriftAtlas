import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ALL_METRICS, ALL_PANEL_MODES } from '../data/types';
import type { DriftMetric, PanelMode } from '../data/types';
import { DayViewCtx, type DayViewState, type PinnedPos } from '../hooks/useDayView';

/**
 * Day-view shared selection state.
 *
 * - `metric` and `panelMode` are URL state (bookmarkable). Read from `?metric=`
 *   and `?panel=`, each falling back to a documented default.
 * - `selectedBranch` is transient hover/click state — local to the page and
 *   reset on navigation.
 * - `pinnedBranches` carries Force-Directed Graph drag-to-pin positions. Local
 *   only; reset when the provider remounts (which Day.tsx triggers per-date
 *   via a `key`).
 */

function isMetric(value: string | null): value is DriftMetric {
  return value !== null && (ALL_METRICS as readonly string[]).includes(value);
}

function isPanelMode(value: string | null): value is PanelMode {
  return value !== null && (ALL_PANEL_MODES as readonly string[]).includes(value);
}

export function DayViewProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const metricParam = params.get('metric');
  const metric: DriftMetric = isMetric(metricParam) ? metricParam : 'line';
  const panelParam = params.get('panel');
  const panelMode: PanelMode = isPanelMode(panelParam) ? panelParam : 'mds';

  const setMetric = useCallback(
    (m: DriftMetric) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (m === 'line') next.delete('metric');
          else next.set('metric', m);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setPanelMode = useCallback(
    (m: PanelMode) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (m === 'mds') next.delete('panel');
          else next.set('panel', m);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [pinnedBranches, setPinnedBranches] = useState<ReadonlyMap<string, PinnedPos>>(
    () => new Map(),
  );

  const pinBranch = useCallback((branch: string, pos: PinnedPos) => {
    setPinnedBranches((prev) => {
      const next = new Map(prev);
      next.set(branch, pos);
      return next;
    });
  }, []);

  const unpinBranch = useCallback((branch: string) => {
    setPinnedBranches((prev) => {
      if (!prev.has(branch)) return prev;
      const next = new Map(prev);
      next.delete(branch);
      return next;
    });
  }, []);

  const clearPins = useCallback(() => {
    setPinnedBranches((prev) => (prev.size === 0 ? prev : new Map()));
  }, []);

  const value = useMemo<DayViewState>(
    () => ({
      metric,
      setMetric,
      selectedBranch,
      setSelectedBranch,
      panelMode,
      setPanelMode,
      pinnedBranches,
      pinBranch,
      unpinBranch,
      clearPins,
    }),
    [
      metric,
      setMetric,
      selectedBranch,
      panelMode,
      setPanelMode,
      pinnedBranches,
      pinBranch,
      unpinBranch,
      clearPins,
    ],
  );

  return <DayViewCtx.Provider value={value}>{children}</DayViewCtx.Provider>;
}
