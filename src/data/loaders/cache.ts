/**
 * Two cache strategies:
 *  - `sessionCache` retains entries for the session; used for the small index
 *    and per-repo time series.
 *  - `LruCache` evicts oldest entries when capacity is exceeded; used for
 *    per-day reports (≈1,470 candidates).
 *
 * Both store *promises* so concurrent callers de-duplicate the in-flight fetch.
 */

export class SessionCache<K, V> {
  private readonly entries = new Map<K, Promise<V>>();

  getOrFetch(key: K, fetchFn: () => Promise<V>): Promise<V> {
    const existing = this.entries.get(key);
    if (existing) return existing;
    const promise = fetchFn().catch((err: unknown) => {
      this.entries.delete(key);
      throw err;
    });
    this.entries.set(key, promise);
    return promise;
  }

  clear(): void {
    this.entries.clear();
  }
}

export class LruCache<K, V> {
  private readonly entries = new Map<K, Promise<V>>();
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  getOrFetch(key: K, fetchFn: () => Promise<V>): Promise<V> {
    const existing = this.entries.get(key);
    if (existing) {
      // Mark as recently used by re-inserting at the end of the iteration order.
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing;
    }
    const promise = fetchFn().catch((err: unknown) => {
      this.entries.delete(key);
      throw err;
    });
    this.entries.set(key, promise);
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as K | undefined;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return promise;
  }
}
