import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ALL_METRICS } from '../data/types';
import type { DriftMetric } from '../data/types';
import { DiffViewCtx, type DiffViewState } from '../hooks/useDiffView';

/**
 * Diff-view shared selection state — intentionally smaller than DayViewContext.
 *
 * - `metric` is URL state (`?metric=`), default `line`.
 * - `selectedBranch` is transient hover/click state, local to the page.
 *
 * No panel mode, no FDG pins; the diff view has nothing analogous.
 */

function isMetric(value: string | null): value is DriftMetric {
  return value !== null && (ALL_METRICS as readonly string[]).includes(value);
}

export function DiffViewProvider({ children }: { children: ReactNode }) {
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

  const value = useMemo<DiffViewState>(
    () => ({ metric, setMetric, selectedBranch, setSelectedBranch }),
    [metric, setMetric, selectedBranch],
  );

  return <DiffViewCtx.Provider value={value}>{children}</DiffViewCtx.Provider>;
}
