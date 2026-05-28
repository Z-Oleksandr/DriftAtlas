/** Re-exports for convenience. New code should import from `./schema/*` directly. */
export type { RepoIndex, RepoIndexEntry } from './schema/repoIndex';
export type { RepoTimeseries, DayPoint, Release } from './schema/repoTimeseries';
export type { DayReport, Edge, Vec3, MetricKey } from './schema/dayReport';
export type { Portfolio, PortfolioRepo } from './schema/portfolio';
export { ALL_METRICS } from './schema/common';
export type { DriftMetric, IsoDate } from './schema/common';

export type AsyncResult<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: T };

/** Which left-column panel is visible on the Day view. URL-synced via `?panel=`. */
export type PanelMode = 'mds' | 'fdg2d' | 'fdg3d';
export const ALL_PANEL_MODES: readonly PanelMode[] = ['mds', 'fdg2d', 'fdg3d'];
