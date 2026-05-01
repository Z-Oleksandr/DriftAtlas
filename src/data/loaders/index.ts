/**
 * Data layer. The only place in the app that knows about JSON paths.
 * Components and hooks call `loadX()` — never `fetch('/data/...')` directly.
 */

import { z } from 'zod';
import { log } from '../../lib/log';
import { RepoIndex } from '../schema/repoIndex';
import { RepoTimeseries } from '../schema/repoTimeseries';
import { DayReport } from '../schema/dayReport';
import { Portfolio } from '../schema/portfolio';
import { LruCache, SessionCache } from './cache';

const BASE = `${import.meta.env.BASE_URL}data`;

const indexCache = new SessionCache<'index', RepoIndex>();
const portfolioCache = new SessionCache<'portfolio', Portfolio>();
const timeseriesCache = new SessionCache<string, RepoTimeseries>();
const dayCache = new LruCache<string, DayReport>(50);

async function fetchAndParse<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
  }
  const raw: unknown = await res.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    log.error('data', `schema mismatch at ${url}`, parsed.error.issues);
    throw new Error(`schema mismatch at ${url}`);
  }
  return parsed.data;
}

export function loadRepoIndex(): Promise<RepoIndex> {
  return indexCache.getOrFetch('index', () => fetchAndParse(`${BASE}/index.json`, RepoIndex));
}

export function loadPortfolio(): Promise<Portfolio> {
  return portfolioCache.getOrFetch('portfolio', () =>
    fetchAndParse(`${BASE}/portfolio.json`, Portfolio),
  );
}

export function loadRepoTimeseries(repo: string): Promise<RepoTimeseries> {
  return timeseriesCache.getOrFetch(repo, () =>
    fetchAndParse(`${BASE}/repos/${encodeURIComponent(repo)}/timeseries.json`, RepoTimeseries),
  );
}

export function loadDayReport(repo: string, date: string): Promise<DayReport> {
  return dayCache.getOrFetch(`${repo}/${date}`, () =>
    fetchAndParse(`${BASE}/repos/${encodeURIComponent(repo)}/days/${date}.json`, DayReport),
  );
}
