import { describe, expect, it } from 'vitest';
import type { Edge } from '../data/types';
import { computeForceLayout, type UseForceLayoutInput } from './useForceLayout';

const SEED = 0x5a017e1d;

function fixtureInput(overrides: Partial<UseForceLayoutInput> = {}): UseForceLayoutInput {
  const branches = ['main', 'feature/a', 'feature/b', 'feature/c', 'feature/d'];
  const edges: Edge[] = [
    { a: 'main', b: 'feature/a', weight: 2 },
    { a: 'main', b: 'feature/b', weight: 10 },
    { a: 'feature/a', b: 'feature/b', weight: 5 },
    { a: 'feature/b', b: 'feature/c', weight: 20 },
    { a: 'feature/c', b: 'feature/d', weight: 3 },
  ];
  return {
    branches,
    edges,
    dims: 3,
    repulsion: -120,
    distanceFn: (w) => 5 + Math.log1p(w) * 2,
    seed: SEED,
    pins: new Map(),
    iterations: 300,
    nodeRadius: 1.5,
    ...overrides,
  };
}

describe('computeForceLayout — determinism', () => {
  it('produces byte-identical positions on repeat invocation (3D)', () => {
    const a = computeForceLayout(fixtureInput());
    const b = computeForceLayout(fixtureInput());
    expect([...a.positions.entries()]).toEqual([...b.positions.entries()]);
    expect(a.maxRadius).toBe(b.maxRadius);
  });

  it('produces byte-identical positions on repeat invocation (2D)', () => {
    const a = computeForceLayout(fixtureInput({ dims: 2 }));
    const b = computeForceLayout(fixtureInput({ dims: 2 }));
    expect([...a.positions.entries()]).toEqual([...b.positions.entries()]);
  });

  it('is invariant to caller-supplied branch order', () => {
    const a = computeForceLayout(fixtureInput());
    const reordered = fixtureInput({
      branches: ['feature/d', 'feature/c', 'feature/b', 'feature/a', 'main'],
    });
    const b = computeForceLayout(reordered);
    for (const branch of a.positions.keys()) {
      expect(b.positions.get(branch)).toEqual(a.positions.get(branch));
    }
  });

  it('z is exactly 0 in 2D mode', () => {
    const out = computeForceLayout(fixtureInput({ dims: 2 }));
    for (const [, [, , z]] of out.positions) {
      expect(z).toBe(0);
    }
  });
});

describe('computeForceLayout — pins', () => {
  it('fixes pinned branches at the requested coordinates', () => {
    const pins = new Map<string, readonly [number, number, number]>([['main', [0, 0, 0]]]);
    const out = computeForceLayout(fixtureInput({ pins }));
    expect(out.positions.get('main')).toEqual([0, 0, 0]);
  });

  it('changing the pin set changes the layout', () => {
    const free = computeForceLayout(fixtureInput());
    const pinned = computeForceLayout(
      fixtureInput({ pins: new Map([['feature/c', [20, 0, 0]]]) }),
    );
    expect(pinned.positions.get('feature/c')).toEqual([20, 0, 0]);
    expect(free.positions.get('feature/c')).not.toEqual([20, 0, 0]);
  });
});

describe('computeForceLayout — robustness', () => {
  it('ignores edges referencing unknown branches', () => {
    const out = computeForceLayout(
      fixtureInput({
        edges: [
          { a: 'main', b: 'ghost', weight: 1 },
          { a: 'feature/a', b: 'main', weight: 1 },
        ],
      }),
    );
    expect(out.positions.size).toBe(5);
  });

  it('ignores self-loops', () => {
    expect(() =>
      computeForceLayout(fixtureInput({ edges: [{ a: 'main', b: 'main', weight: 1 }] })),
    ).not.toThrow();
  });

  it('handles a graph with no edges (isolated nodes)', () => {
    const out = computeForceLayout(fixtureInput({ edges: [] }));
    expect(out.positions.size).toBe(5);
  });
});
