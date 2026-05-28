import { loadDayReport } from '../data/loaders';
import type { AsyncResult, DayReport } from '../data/types';
import { useAsync } from './useAsync';

export interface DayReportPair {
  from: DayReport;
  to: DayReport;
}

/**
 * Loads two day reports in parallel via the shared LRU cache, returning a single
 * `AsyncResult` for the pair. Rejects when inputs are missing or when both dates
 * are the same (a diff of a day against itself is meaningless and we'd rather
 * surface it explicitly than render an empty matrix).
 */
export function useDayReportPair(
  repo: string | undefined,
  fromDate: string | undefined,
  toDate: string | undefined,
): AsyncResult<DayReportPair> {
  return useAsync(`pair:${repo ?? ''}:${fromDate ?? ''}:${toDate ?? ''}`, () => {
    if (!repo || !fromDate || !toDate) {
      return Promise.reject(new Error('missing repo or dates'));
    }
    if (fromDate === toDate) {
      return Promise.reject(new Error('from and to must differ'));
    }
    return Promise.all([loadDayReport(repo, fromDate), loadDayReport(repo, toDate)]).then(
      ([from, to]) => ({ from, to }),
    );
  });
}
