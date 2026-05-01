import type { RepoIndex, RepoTimeSeries } from './types';

const BASE = `${import.meta.env.BASE_URL}data`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`fetch ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function fetchIndex(): Promise<RepoIndex> {
  return getJson<RepoIndex>(`${BASE}/index.json`);
}

export function fetchRepoTimeSeries(name: string): Promise<RepoTimeSeries> {
  return getJson<RepoTimeSeries>(`${BASE}/repos/${encodeURIComponent(name)}/timeseries.json`);
}
