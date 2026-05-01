import { z } from 'zod';
import { DriftMetric, IsoDate } from './common';

/**
 * Edge-list representation of a (possibly sparse) symmetric distance matrix.
 * Edges are keyed by branch name (not index) — see code_rules §14.1.
 * Symmetrized at parse time; downstream code may assume `weight` reflects
 * an undirected pair.
 */
export const Edge = z.object({
  a: z.string(),
  b: z.string(),
  weight: z.number().nonnegative(),
});
export type Edge = z.infer<typeof Edge>;

export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3>;

const PerMetric = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ line: value, conflict: value, file: value });

export const DayReport = z.object({
  repo: z.string(),
  date: IsoDate,
  branches: z.array(z.string()),
  drift: PerMetric(z.number()),
  pointClouds: PerMetric(z.array(Vec3)),
  edges: PerMetric(z.array(Edge)),
  ordering: PerMetric(z.array(z.number().int().nonnegative())),
  madContribution: PerMetric(z.array(z.number().nonnegative())),
  branchCounts: z.object({
    total: z.number().int(),
    analyzed: z.number().int(),
    final: z.number().int(),
  }),
});
export type DayReport = z.infer<typeof DayReport>;

export type MetricKey = DriftMetric;
