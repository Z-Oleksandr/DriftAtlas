import { loadRepoTimeseries } from '../data/loaders';
import type { AsyncResult, RepoTimeseries } from '../data/types';
import { useAsync } from './useAsync';

export function useRepoTimeseries(repo: string | undefined): AsyncResult<RepoTimeseries> {
  return useAsync(`timeseries:${repo ?? ''}`, () => {
    if (!repo) return Promise.reject(new Error('missing repo'));
    return loadRepoTimeseries(repo);
  });
}
