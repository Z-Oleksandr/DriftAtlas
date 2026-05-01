import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DriftMetric } from '../data/types';
import { ALL_METRICS } from '../data/types';
import { DayViewCtx, type DayViewState } from '../hooks/useDayView';

/**
 * Day-view shared selection state.
 *
 * - `metric` is URL state (bookmarkable). Read from `?metric=`, falling back to `line`.
 * - `selectedBranch` is transient hover/click state — local to the page and reset
 *   on navigation.
 */

function isMetric(value: string | null): value is DriftMetric {
  return value !== null && (ALL_METRICS as readonly string[]).includes(value);
}

export function DayViewProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const metricParam = params.get('metric');
  const metric: DriftMetric = isMetric(metricParam) ? metricParam : 'line';

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

  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  const value = useMemo<DayViewState>(
    () => ({ metric, setMetric, selectedBranch, setSelectedBranch }),
    [metric, setMetric, selectedBranch],
  );

  return <DayViewCtx.Provider value={value}>{children}</DayViewCtx.Provider>;
}
