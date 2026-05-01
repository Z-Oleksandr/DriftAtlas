import { loadRepoIndex } from '../data/loaders';
import type { AsyncResult, RepoIndex } from '../data/types';
import { useAsync } from './useAsync';

export function useRepoIndex(): AsyncResult<RepoIndex> {
  return useAsync('index', loadRepoIndex);
}
