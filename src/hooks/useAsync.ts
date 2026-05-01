import { useEffect, useState } from 'react';
import { log } from '../lib/log';
import type { AsyncResult } from '../data/types';

/**
 * Wraps a one-shot promise into a discriminated AsyncResult. Re-runs whenever
 * `key` changes; ignores stale resolutions if the key changed mid-flight.
 */
export function useAsync<T>(key: string, fn: () => Promise<T>): AsyncResult<T> {
  const [state, setState] = useState<AsyncResult<T>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    // Reset to loading state when the cache key changes — fetch-on-key-change is
    // a deliberate pattern for this hook.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: 'loading' });
    fn()
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        log.error('data', `useAsync(${key}) failed`, message);
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
