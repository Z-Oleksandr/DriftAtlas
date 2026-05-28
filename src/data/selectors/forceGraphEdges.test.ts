import { describe, expect, it } from 'vitest';
import type { DayReport } from '../types';
import { deriveEdges, weightRange } from './forceGraphEdges';

function makeReport(): DayReport {
  return {
    repo: 'demo',
    date: '2024-04-01',
    branches: ['main', 'feature/a', 'feature/b', 'feature/c'],
    drift: { line: 5, conflict: 1, file: 0.1 },
    pointClouds: {
      line: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      conflict: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      file: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
    },
    edges: {
      line: [
        { a: 'main', b: 'feature/a', weight: 2 },
        { a: 'main', b: 'feature/b', weight: 10 },
        { a: 'feature/a', b: 'feature/b', weight: 5 },
        { a: 'feature/b', b: 'feature/c', weight: 20 },
      ],
      conflict: [{ a: 'main', b: 'feature/a', weight: 1 }],
      file: [],
    },
    ordering: { line: [0, 1, 2, 3], conflict: [0, 1, 2, 3], file: [0, 1, 2, 3] },
    madContribution: { line: [0, 1, 2, 3], conflict: [0, 1, 0, 0], file: [0, 0, 0, 0] },
    branchCounts: { total: 4, analyzed: 4, final: 4 },
  };
}

describe('weightRange', () => {
  it('returns min/max of non-zero weights', () => {
    expect(weightRange(makeReport(), 'line')).toEqual({ min: 2, max: 20 });
  });

  it('returns zeros for an empty metric', () => {
    expect(weightRange(makeReport(), 'file')).toEqual({ min: 0, max: 0 });
  });
});

describe('deriveEdges — mergeable', () => {
  it('keeps edges at or below the threshold and drops the rest', () => {
    const out = deriveEdges(makeReport(), 'line', { threshold: 5, encoding: 'mergeable' });
    const kept = out.renderEdges.map((e) => `${e.a}-${e.b}`).sort();
    expect(kept).toEqual(['feature/a-feature/b', 'main-feature/a']);
  });

  it('still exposes the full edge list to the simulation', () => {
    const out = deriveEdges(makeReport(), 'line', { threshold: 5, encoding: 'mergeable' });
    expect(out.simEdges).toHaveLength(4);
  });

  it('intensity is higher for cleaner merges (lower weight)', () => {
    const out = deriveEdges(makeReport(), 'line', { threshold: 10, encoding: 'mergeable' });
    const easy = out.renderEdges.find((e) => e.weight === 2);
    const harder = out.renderEdges.find((e) => e.weight === 10);
    expect(easy && harder).toBeTruthy();
    expect(easy!.intensity).toBeGreaterThan(harder!.intensity);
    expect(harder!.intensity).toBe(0);
  });

  it('keys edges by branch name (does not depend on branch order)', () => {
    const report = makeReport();
    const reordered: DayReport = {
      ...report,
      branches: ['feature/c', 'feature/b', 'feature/a', 'main'],
    };
    const a = deriveEdges(report, 'line', { threshold: 100, encoding: 'mergeable' });
    const b = deriveEdges(reordered, 'line', { threshold: 100, encoding: 'mergeable' });
    expect(b.renderEdges).toEqual(a.renderEdges);
  });
});

describe('deriveEdges — all-weighted', () => {
  it('keeps every non-zero edge', () => {
    const out = deriveEdges(makeReport(), 'line', { threshold: 0, encoding: 'all-weighted' });
    expect(out.renderEdges).toHaveLength(4);
  });

  it('intensity grows with weight (log-scaled)', () => {
    const out = deriveEdges(makeReport(), 'line', { threshold: 0, encoding: 'all-weighted' });
    const sorted = [...out.renderEdges].sort((x, y) => x.weight - y.weight);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]!.intensity).toBeGreaterThanOrEqual(sorted[i - 1]!.intensity);
    }
    expect(sorted[sorted.length - 1]!.intensity).toBeCloseTo(1, 5);
  });

  it('handles empty metric gracefully', () => {
    const out = deriveEdges(makeReport(), 'file', { threshold: 0, encoding: 'all-weighted' });
    expect(out.renderEdges).toEqual([]);
  });
});
