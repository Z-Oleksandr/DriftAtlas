import { describe, expect, it } from 'vitest';
import type { DayReport, Edge } from '../types';
import { diffDayReports } from './dayReportDiff';

interface ReportSpec {
  date: string;
  branches: string[];
  edges?: Edge[];
  drift?: number;
}

function makeReport(spec: ReportSpec): DayReport {
  const branches = spec.branches;
  const edges = spec.edges ?? [];
  const n = branches.length;
  const zeroPoint: [number, number, number] = [0, 0, 0];
  return {
    repo: 'demo',
    date: spec.date,
    branches,
    drift: { line: spec.drift ?? 5, conflict: 1, file: 0.1 },
    pointClouds: {
      line: branches.map(() => zeroPoint),
      conflict: branches.map(() => zeroPoint),
      file: branches.map(() => zeroPoint),
    },
    edges: { line: edges, conflict: [], file: [] },
    ordering: {
      line: branches.map((_, i) => i),
      conflict: branches.map((_, i) => i),
      file: branches.map((_, i) => i),
    },
    madContribution: {
      line: branches.map(() => 0),
      conflict: branches.map(() => 0),
      file: branches.map(() => 0),
    },
    branchCounts: { total: n, analyzed: n, final: n },
  };
}

describe('diffDayReports — identical days', () => {
  it('produces zero deltas and the no-change headline', () => {
    const from = makeReport({
      date: '2024-04-01',
      branches: ['main', 'a'],
      edges: [{ a: 'main', b: 'a', weight: 10 }],
      drift: 5,
    });
    const to = makeReport({
      date: '2024-04-02',
      branches: ['main', 'a'],
      edges: [{ a: 'main', b: 'a', weight: 10 }],
      drift: 5,
    });

    const diff = diffDayReports(from, to, 'line');

    expect(diff.deltaDrift).toBe(0);
    expect(diff.deltaDriftPct).toBe(0);
    expect(diff.pairDeltas).toEqual([]);
    expect(diff.branchDeltas.every((d) => d.kind === 'persisted')).toBe(true);
    expect(diff.branchDeltas.every((d) => d.kind === 'persisted' && d.deltaMass === 0)).toBe(true);
    expect(diff.attribution.headline).toBe(
      'No branches changed between 2024-04-01 and 2024-04-02 on the line metric.',
    );
    expect(diff.attribution.bullets).toEqual([]);
  });
});

describe('diffDayReports — appeared branch', () => {
  it('classifies the new branch and emits the appeared headline', () => {
    const from = makeReport({
      date: '2024-04-01',
      branches: ['main', 'a', 'b', 'c', 'd'],
      edges: [{ a: 'main', b: 'a', weight: 1 }],
      drift: 4,
    });
    const to = makeReport({
      date: '2024-04-02',
      branches: ['main', 'a', 'b', 'c', 'd', 'feature/payments'],
      edges: [
        { a: 'main', b: 'a', weight: 1 },
        { a: 'feature/payments', b: 'main', weight: 25 },
        { a: 'feature/payments', b: 'a', weight: 25 },
        { a: 'feature/payments', b: 'b', weight: 25 },
        { a: 'feature/payments', b: 'c', weight: 25 },
      ],
      drift: 8,
    });

    const diff = diffDayReports(from, to, 'line');

    const top = diff.branchDeltas[0];
    expect(top?.kind).toBe('appeared');
    expect(top && top.kind === 'appeared' ? top.name : null).toBe('feature/payments');
    expect(top && top.kind === 'appeared' ? top.toPartners : null).toBe(4);

    expect(diff.attribution.headline).toBe(
      'Drift rose by 100%: feature/payments appeared and conflicts with 4 branches.',
    );

    const newPair = diff.pairDeltas.find(
      (p) => p.kind === 'new' && p.a === 'a' && p.b === 'feature/payments',
    );
    expect(newPair).toBeDefined();
  });

  it('handles appeared branch with zero edges', () => {
    const from = makeReport({
      date: '2024-04-01',
      branches: ['main'],
      edges: [],
      drift: 1,
    });
    const to = makeReport({
      date: '2024-04-02',
      branches: ['main', 'orphan'],
      edges: [],
      drift: 1,
    });
    const diff = diffDayReports(from, to, 'line');
    // 'orphan' has toMass=0 so contribution magnitude is 0; ranks tie with main (also 0).
    // Names tie-break: 'main' < 'orphan'. No branch has non-zero contribution → no-change template.
    expect(diff.attribution.headline).toBe(
      'No branches changed between 2024-04-01 and 2024-04-02 on the line metric.',
    );
  });
});

describe('diffDayReports — disappeared branch', () => {
  it('classifies the removed branch and emits the disappeared headline', () => {
    const from = makeReport({
      date: '2024-04-01',
      branches: ['main', 'a', 'legacy'],
      edges: [
        { a: 'main', b: 'legacy', weight: 10 },
        { a: 'a', b: 'legacy', weight: 10 },
      ],
      drift: 5,
    });
    const to = makeReport({
      date: '2024-04-02',
      branches: ['main', 'a'],
      edges: [],
      drift: 0.5,
    });

    const diff = diffDayReports(from, to, 'line');

    const top = diff.branchDeltas[0];
    expect(top?.kind).toBe('disappeared');
    expect(top && top.kind === 'disappeared' ? top.name : null).toBe('legacy');
    expect(top && top.kind === 'disappeared' ? top.fromPartners : null).toBe(2);

    expect(diff.attribution.headline).toBe(
      'Drift fell by 90%: legacy disappeared, removing 2 conflicts.',
    );
  });
});

describe('diffDayReports — pair changes', () => {
  it('classifies an increased pair and propagates Δmass to both endpoints', () => {
    const from = makeReport({
      date: '2024-04-01',
      branches: ['main', 'a'],
      edges: [{ a: 'main', b: 'a', weight: 10 }],
      drift: 5,
    });
    const to = makeReport({
      date: '2024-04-02',
      branches: ['main', 'a'],
      edges: [{ a: 'main', b: 'a', weight: 50 }],
      drift: 7,
    });
    const diff = diffDayReports(from, to, 'line');

    expect(diff.pairDeltas).toHaveLength(1);
    const p = diff.pairDeltas[0];
    expect(p?.kind).toBe('increased');
    expect(p?.deltaWeight).toBe(40);

    const main = diff.branchDeltas.find((d) => d.name === 'main');
    const a = diff.branchDeltas.find((d) => d.name === 'a');
    expect(main?.kind === 'persisted' && main.deltaMass).toBe(40);
    expect(a?.kind === 'persisted' && a.deltaMass).toBe(40);
  });

  it('classifies a decreased pair', () => {
    const from = makeReport({
      date: '2024-04-01',
      branches: ['main', 'a'],
      edges: [{ a: 'main', b: 'a', weight: 50 }],
      drift: 7,
    });
    const to = makeReport({
      date: '2024-04-02',
      branches: ['main', 'a'],
      edges: [{ a: 'main', b: 'a', weight: 10 }],
      drift: 5,
    });
    const diff = diffDayReports(from, to, 'line');
    expect(diff.pairDeltas[0]?.kind).toBe('decreased');
    expect(diff.pairDeltas[0]?.deltaWeight).toBe(-40);
  });

  it('drops pairs with Δ === 0 from output', () => {
    const from = makeReport({
      date: '2024-04-01',
      branches: ['main', 'a', 'b'],
      edges: [
        { a: 'main', b: 'a', weight: 10 },
        { a: 'main', b: 'b', weight: 5 },
      ],
    });
    const to = makeReport({
      date: '2024-04-02',
      branches: ['main', 'a', 'b'],
      edges: [
        { a: 'main', b: 'a', weight: 10 },
        { a: 'main', b: 'b', weight: 7 },
      ],
    });
    const diff = diffDayReports(from, to, 'line');
    expect(diff.pairDeltas).toHaveLength(1);
    expect(diff.pairDeltas[0]?.deltaWeight).toBe(2);
  });
});

describe('diffDayReports — sort tie-breaks', () => {
  it('breaks ties between branches with identical |Δmass| by lex-smaller name first', () => {
    const from = makeReport({
      date: '2024-04-01',
      branches: ['main', 'zebra', 'alpha'],
      edges: [
        { a: 'main', b: 'alpha', weight: 10 },
        { a: 'main', b: 'zebra', weight: 10 },
      ],
    });
    const to = makeReport({
      date: '2024-04-02',
      branches: ['main', 'zebra', 'alpha'],
      edges: [
        { a: 'main', b: 'alpha', weight: 20 },
        { a: 'main', b: 'zebra', weight: 20 },
      ],
    });
    const diff = diffDayReports(from, to, 'line');
    // alpha and zebra both have ΔMass = 10; main has Δmass = 20 (sum), so main ranks first.
    // Among alpha & zebra (tied), alpha (lex-smaller) comes first.
    expect(diff.branchDeltas[0]?.name).toBe('main');
    expect(diff.branchDeltas[1]?.name).toBe('alpha');
    expect(diff.branchDeltas[2]?.name).toBe('zebra');
  });

  it('breaks ties between pairs with identical |Δweight| by (a,b) lex', () => {
    const from = makeReport({
      date: '2024-04-01',
      branches: ['a', 'b', 'c', 'd'],
      edges: [
        { a: 'a', b: 'd', weight: 0 },
        { a: 'b', b: 'c', weight: 0 },
      ],
    });
    const to = makeReport({
      date: '2024-04-02',
      branches: ['a', 'b', 'c', 'd'],
      edges: [
        { a: 'a', b: 'd', weight: 5 },
        { a: 'b', b: 'c', weight: 5 },
      ],
    });
    const diff = diffDayReports(from, to, 'line');
    expect(diff.pairDeltas[0]?.a).toBe('a');
    expect(diff.pairDeltas[0]?.b).toBe('d');
    expect(diff.pairDeltas[1]?.a).toBe('b');
    expect(diff.pairDeltas[1]?.b).toBe('c');
  });
});

describe('diffDayReports — drift scalar edge cases', () => {
  it('returns null deltaDriftPct when driftFrom === 0 and uses absolute clause', () => {
    const from = makeReport({
      date: '2024-04-01',
      branches: ['main', 'a'],
      edges: [],
      drift: 0,
    });
    const to = makeReport({
      date: '2024-04-02',
      branches: ['main', 'a'],
      edges: [{ a: 'main', b: 'a', weight: 25 }],
      drift: 3.142,
    });
    const diff = diffDayReports(from, to, 'line');
    expect(diff.deltaDriftPct).toBeNull();
    // headline uses absolute form: "by 3.142"
    expect(diff.attribution.headline).toMatch(/^Drift rose by 3\.142:/);
  });
});

describe('diffDayReports — empty to.branches', () => {
  it('classifies every from branch as disappeared and sets unionBranches to from sorted', () => {
    const from = makeReport({
      date: '2024-04-01',
      branches: ['main', 'a', 'b'],
      edges: [{ a: 'main', b: 'a', weight: 5 }],
      drift: 5,
    });
    const to = makeReport({
      date: '2024-04-02',
      branches: [],
      edges: [],
      drift: 0,
    });
    const diff = diffDayReports(from, to, 'line');
    expect(diff.unionBranches).toEqual(['a', 'b', 'main']);
    expect(diff.branchDeltas.every((d) => d.kind === 'disappeared')).toBe(true);
  });
});

describe('diffDayReports — determinism and purity', () => {
  it('produces byte-identical output on repeat invocation', () => {
    const from = makeReport({
      date: '2024-04-01',
      branches: ['main', 'a', 'b'],
      edges: [{ a: 'main', b: 'a', weight: 10 }],
    });
    const to = makeReport({
      date: '2024-04-02',
      branches: ['main', 'a', 'c'],
      edges: [{ a: 'main', b: 'c', weight: 30 }],
    });
    const first = diffDayReports(from, to, 'line');
    const second = diffDayReports(from, to, 'line');
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('does not mutate the input reports', () => {
    const from = makeReport({
      date: '2024-04-01',
      branches: ['b', 'a'],
      edges: [{ a: 'a', b: 'b', weight: 3 }],
    });
    const to = makeReport({
      date: '2024-04-02',
      branches: ['b', 'a'],
      edges: [{ a: 'a', b: 'b', weight: 9 }],
    });
    const fromSnapshot = JSON.stringify(from);
    const toSnapshot = JSON.stringify(to);
    diffDayReports(from, to, 'line');
    expect(JSON.stringify(from)).toBe(fromSnapshot);
    expect(JSON.stringify(to)).toBe(toSnapshot);
  });
});
