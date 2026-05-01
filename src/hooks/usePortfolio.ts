import { loadPortfolio } from '../data/loaders';
import type { AsyncResult, Portfolio } from '../data/types';
import { useAsync } from './useAsync';

export function usePortfolio(): AsyncResult<Portfolio> {
  return useAsync('portfolio', loadPortfolio);
}
