import { z } from 'zod';

/**
 * The three drift metrics produced by the Driftool. Treated as first-class
 * throughout the app — never silently default to one without an explicit
 * user choice (see code_rules §10.5, §14.4).
 */
export const DriftMetric = z.enum(['line', 'conflict', 'file']);
export type DriftMetric = z.infer<typeof DriftMetric>;

export const ALL_METRICS: readonly DriftMetric[] = ['line', 'conflict', 'file'] as const;

/** ISO date string (YYYY-MM-DD). On-disk dates stay as strings; parse to Date only at use. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export type IsoDate = z.infer<typeof IsoDate>;
