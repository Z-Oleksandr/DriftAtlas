import { z } from 'zod';
import { IsoDate } from './common';

export const Release = z.object({
  date: IsoDate,
  tag: z.string(),
});
export type Release = z.infer<typeof Release>;

export const DayPoint = z.object({
  date: IsoDate,
  lineDrift: z.number().nullable(),
  conflictDrift: z.number().nullable(),
  fileDrift: z.number().nullable(),
  branchesTotal: z.number().int().nullable(),
  branchesAnalyzed: z.number().int().nullable(),
  branchesFinal: z.number().int().nullable(),
  commits: z.number().int().nullable(),
});
export type DayPoint = z.infer<typeof DayPoint>;

export const RepoTimeseries = z.object({
  repo: z.string(),
  days: z.array(DayPoint),
  releases: z.array(Release).default([]),
});
export type RepoTimeseries = z.infer<typeof RepoTimeseries>;
