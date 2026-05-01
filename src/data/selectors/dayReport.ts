/**
 * Pure derivations from `DayReport`. No I/O, no React. Densification, neighbour lookup,
 * branch ranking — all the data shaping that charts need but shouldn't compute themselves.
 */

import type { DayReport, DriftMetric, Edge } from '../types';

const ZERO_EPSILON = 1e-12;

export interface BranchSummary {
  name: string;
  index: number;
  conflictMass: number;
  partnerCount: number;
  distanceToMain: number | null;
  madContribution: number;
  isAtOrigin: boolean;
}

/** Build an n×n dense matrix from the edge list. Symmetric; diagonal is zero. */
export function densifyEdges(branches: readonly string[], edges: readonly Edge[]): number[][] {
  const n = branches.length;
  const indexOf = new Map<string, number>();
  for (let i = 0; i < n; i += 1) indexOf.set(branches[i] ?? '', i);

  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const e of edges) {
    const i = indexOf.get(e.a);
    const j = indexOf.get(e.b);
    if (i === undefined || j === undefined) continue;
    matrix[i]![j] = e.weight;
    matrix[j]![i] = e.weight;
  }
  return matrix;
}

/** Branches whose 3D point sits at the origin (no measured conflicts on this metric). */
export function findOriginBranches(
  branches: readonly string[],
  points: readonly [number, number, number][],
): string[] {
  const out: string[] = [];
  for (let i = 0; i < branches.length; i += 1) {
    const p = points[i];
    if (!p) continue;
    if (
      Math.abs(p[0]) < ZERO_EPSILON &&
      Math.abs(p[1]) < ZERO_EPSILON &&
      Math.abs(p[2]) < ZERO_EPSILON
    ) {
      const name = branches[i];
      if (name) out.push(name);
    }
  }
  return out;
}

/** Per-branch summary statistics for the ranking table and selection coloring. */
export function summarizeBranches(report: DayReport, metric: DriftMetric): BranchSummary[] {
  const { branches, pointClouds, edges, madContribution } = report;
  const matrix = densifyEdges(branches, edges[metric]);
  const points = pointClouds[metric];
  const mad = madContribution[metric];

  const mainIndex = branches.indexOf('main');
  const mainPoint = mainIndex >= 0 ? points[mainIndex] : undefined;

  return branches.map((name, i) => {
    const row = matrix[i] ?? [];
    let mass = 0;
    let partners = 0;
    for (let j = 0; j < row.length; j += 1) {
      const w = row[j] ?? 0;
      if (w > 0) {
        mass += w;
        partners += 1;
      }
    }
    const point = points[i];
    let distanceToMain: number | null = null;
    if (mainPoint && point && i !== mainIndex) {
      const dx = point[0] - mainPoint[0];
      const dy = point[1] - mainPoint[1];
      const dz = point[2] - mainPoint[2];
      distanceToMain = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return {
      name,
      index: i,
      conflictMass: mass,
      partnerCount: partners,
      distanceToMain,
      madContribution: mad[i] ?? 0,
      isAtOrigin:
        !!point &&
        Math.abs(point[0]) < ZERO_EPSILON &&
        Math.abs(point[1]) < ZERO_EPSILON &&
        Math.abs(point[2]) < ZERO_EPSILON,
    };
  });
}

/** Branches connected to `branch` by a non-zero edge for the given metric. */
export function neighborsOf(report: DayReport, metric: DriftMetric, branch: string): Set<string> {
  const out = new Set<string>();
  for (const e of report.edges[metric]) {
    if (e.a === branch) out.add(e.b);
    else if (e.b === branch) out.add(e.a);
  }
  return out;
}
