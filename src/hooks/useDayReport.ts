import { loadDayReport } from '../data/loaders';
import type { AsyncResult, DayReport } from '../data/types';
import { useAsync } from './useAsync';

export function useDayReport(
  repo: string | undefined,
  date: string | undefined,
): AsyncResult<DayReport> {
  return useAsync(`day:${repo ?? ''}:${date ?? ''}`, () => {
    if (!repo || !date) return Promise.reject(new Error('missing repo or date'));
    return loadDayReport(repo, date);
  });
}
