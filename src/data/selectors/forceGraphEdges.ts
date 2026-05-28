/**
 * Force-Directed Graph edge derivation.
 *
 * Two concerns kept separate:
 *  - `simEdges`: full edge list the d3-force simulation reads, so the layout
 *    always reflects the complete topology.
 *  - `renderEdges`: subset rendered as line geometry, filtered/encoded per the
 *    user's chosen mode. Threshold changes only re-derive this; no re-layout.
 */

import type { DayReport, DriftMetric, Edge } from '../types';

export type EdgeEncoding = 'mergeable' | 'all-weighted';

export interface DeriveEdgesOptions {
  threshold: number;
  encoding: EdgeEncoding;
}

export interface RenderEdge {
  a: string;
  b: string;
  weight: number;
  /** Visual weight in [0, 1]; 1 = strongest visual emphasis. */
  intensity: number;
}

export interface DerivedEdges {
  simEdges: readonly Edge[];
  renderEdges: readonly RenderEdge[];
}

/** Min/max non-zero edge weight for the given metric. Useful for slider bounds. */
export function weightRange(
  report: DayReport,
  metric: DriftMetric,
): { min: number; max: number } {
  let min = Infinity;
  let max = 0;
  for (const e of report.edges[metric]) {
    if (e.weight <= 0) continue;
    if (e.weight < min) min = e.weight;
    if (e.weight > max) max = e.weight;
  }
  if (!Number.isFinite(min)) min = 0;
  return { min, max };
}

export function deriveEdges(
  report: DayReport,
  metric: DriftMetric,
  opts: DeriveEdgesOptions,
): DerivedEdges {
  const simEdges = report.edges[metric];

  if (opts.encoding === 'mergeable') {
    const kept: RenderEdge[] = [];
    for (const e of simEdges) {
      if (e.weight > opts.threshold) continue;
      // For mergeable mode, "cleaner merge" = stronger emphasis.
      const denom = opts.threshold > 0 ? opts.threshold : 1;
      const intensity = 1 - Math.min(1, e.weight / denom);
      kept.push({ a: e.a, b: e.b, weight: e.weight, intensity });
    }
    return { simEdges, renderEdges: kept };
  }

  // 'all-weighted': keep every non-zero edge; intensity ∝ weight (log scale to
  // match the matrix heatmap's perceptual encoding for the heavy-tailed range).
  const { max } = weightRange(report, metric);
  const logMax = Math.log1p(max);
  const rendered: RenderEdge[] = [];
  for (const e of simEdges) {
    if (e.weight <= 0) continue;
    const intensity = logMax > 0 ? Math.log1p(e.weight) / logMax : 0;
    rendered.push({ a: e.a, b: e.b, weight: e.weight, intensity });
  }
  return { simEdges, renderEdges: rendered };
}
