import { z } from 'zod';
import { IsoDate } from './common';

const PerMetricSeries = z.object({
  line: z.array(z.number().nullable()),
  conflict: z.array(z.number().nullable()),
  file: z.array(z.number().nullable()),
});

export const PortfolioRepo = z.object({
  name: z.string(),
  drifts: PerMetricSeries,
  commits: z.array(z.number().int().nullable()),
});
export type PortfolioRepo = z.infer<typeof PortfolioRepo>;

export const Portfolio = z.object({
  dates: z.array(IsoDate),
  repos: z.array(PortfolioRepo),
});
export type Portfolio = z.infer<typeof Portfolio>;
