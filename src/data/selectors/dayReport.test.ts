import { describe, expect, it } from 'vitest';
import type { DayReport } from '../types';
import { densifyEdges, findOriginBranches, neighborsOf, summarizeBranches } from './dayReport';

function makeReport(overrides: Partial<DayReport> = {}): DayReport {
  const branches = ['main', 'feature/a', 'feature/b'];
  const base: DayReport = {
    repo: 'demo',
    date: '2024-04-01',
    branches,
    drift: { line: 5, conflict: 1, file: 0.1 },
    pointClouds: {
      line: [
        [0, 0, 0],
        [3, 0, 0],
        [0, 4, 0],
      ],
      conflict: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      file: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
    },
    edges: {
      line: [
        { a: 'main', b: 'feature/a', weight: 100 },
        { a: 'feature/a', b: 'feature/b', weight: 50 },
      ],
      conflict: [{ a: 'main', b: 'feature/a', weight: 5 }],
      file: [],
    },
    ordering: {
      line: [0, 1, 2],
      conflict: [0, 1, 2],
      file: [0, 1, 2],
    },
    madContribution: {
      line: [0, 3, 4],
      conflict: [0, 1, 1],
      file: [0, 0, 0],
    },
    branchCounts: { total: 3, analyzed: 3, final: 3 },
  };
  return { ...base, ...overrides };
}

describe('densifyEdges', () => {
  it('produces a symmetric matrix with zero diagonal', () => {
    const branches = ['a', 'b', 'c'];
    const edges = [
      { a: 'a', b: 'b', weight: 7 },
      { a: 'b', b: 'c', weight: 9 },
    ];
    const m = densifyEdges(branches, edges);
    expect(m).toEqual([
      [0, 7, 0],
      [7, 0, 9],
      [0, 9, 0],
    ]);
  });

  it('ignores edges referencing unknown branches', () => {
    const m = densifyEdges(['a', 'b'], [{ a: 'a', b: 'ghost', weight: 99 }]);
    expect(m).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('returns a zero matrix when there are no edges', () => {
    const m = densifyEdges(['a', 'b'], []);
    expect(m).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });
});

describe('findOriginBranches', () => {
  it('finds branches whose 3D point is at the origin', () => {
    const result = findOriginBranches(
      ['a', 'b', 'c'],
      [
        [0, 0, 0],
        [1, 2, 3],
        [0, 0, 0],
      ],
    );
    expect(result).toEqual(['a', 'c']);
  });
});

describe('neighborsOf', () => {
  it('returns the set of branches connected to the target on the given metric', () => {
    const report = makeReport();
    expect(neighborsOf(report, 'line', 'feature/a')).toEqual(new Set(['main', 'feature/b']));
    expect(neighborsOf(report, 'conflict', 'feature/a')).toEqual(new Set(['main']));
    expect(neighborsOf(report, 'file', 'feature/a')).toEqual(new Set());
  });

  it('returns an empty set for unknown branches', () => {
    const report = makeReport();
    expect(neighborsOf(report, 'line', 'ghost')).toEqual(new Set());
  });
});

describe('summarizeBranches', () => {
  it('computes conflict mass, partner count, and distance to main', () => {
    const report = makeReport();
    const out = summarizeBranches(report, 'line');

    const main = out.find((r) => r.name === 'main');
    const a = out.find((r) => r.name === 'feature/a');
    const b = out.find((r) => r.name === 'feature/b');

    expect(main?.conflictMass).toBe(100); // main↔a only
    expect(main?.partnerCount).toBe(1);
    expect(main?.distanceToMain).toBeNull();

    expect(a?.conflictMass).toBe(150); // 100 + 50
    expect(a?.partnerCount).toBe(2);
    expect(a?.distanceToMain).toBe(3); // (3,0,0) - (0,0,0)

    expect(b?.conflictMass).toBe(50);
    expect(b?.partnerCount).toBe(1);
    expect(b?.distanceToMain).toBe(4);
  });

  it('marks branches at the origin', () => {
    const report = makeReport();
    const out = summarizeBranches(report, 'file');
    expect(out.every((r) => r.isAtOrigin)).toBe(true);
  });
});
