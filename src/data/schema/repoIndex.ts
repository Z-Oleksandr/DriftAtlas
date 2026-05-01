import { z } from 'zod';
import { IsoDate } from './common';

export const RepoIndexEntry = z.object({
  name: z.string(),
  dateRange: z.tuple([IsoDate, IsoDate]).nullable(),
  dayCount: z.number().int().nonnegative(),
  dayWithDriftCount: z.number().int().nonnegative(),
  analyzedDays: z.array(IsoDate),
});
export type RepoIndexEntry = z.infer<typeof RepoIndexEntry>;

export const RepoIndex = z.object({
  generatedAt: z.string(),
  analysisRun: z.string(),
  repos: z.array(RepoIndexEntry),
});
export type RepoIndex = z.infer<typeof RepoIndex>;
