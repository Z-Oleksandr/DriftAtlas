/**
 * Headless, deterministic force-directed layout for the FDG panel.
 *
 * Determinism guarantees (see code_rules §3 FDG exception):
 *  1. Inputs are canonicalised — branch list is sorted alphabetically before the
 *     simulation is built, so caller order does not affect output.
 *  2. Initial node positions are derived from a stable hash of the branch name,
 *     not from `Math.random()` or insertion order.
 *  3. The simulation's PRNG is seeded with `FDG_SEED` via `d3.randomLcg`.
 *  4. The auto-stepper is stopped immediately and a fixed number of `tick()`
 *     iterations are run synchronously, then positions are frozen.
 *
 * Result: identical inputs (branches, edges, dims, repulsion, distanceFn, seed,
 * pins, iterations) → byte-identical positions on the reference environment.
 */

import { useMemo } from 'react';
import { randomLcg } from 'd3';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNode,
  type SimulationLink,
} from 'd3-force-3d';
import type { Edge } from '../data/types';

export type Vec3 = readonly [number, number, number];
export type Dims = 2 | 3;

interface FdgNode extends SimulationNode {
  branch: string;
}

interface FdgLink extends SimulationLink<FdgNode> {
  weight: number;
}

export interface UseForceLayoutInput {
  branches: readonly string[];
  edges: readonly Edge[];
  dims: Dims;
  /** Negative for repulsion (typical range −60 … −200). */
  repulsion: number;
  /** Maps a conflict weight to a target link distance. */
  distanceFn: (weight: number) => number;
  seed: number;
  /** Branches with fixed positions (drag-to-pin). Keys = branch names. */
  pins: ReadonlyMap<string, Vec3>;
  /** Optional override; default is enough for alpha to settle. */
  iterations?: number;
  /** Node radius for the collide force, in world units. */
  nodeRadius?: number;
}

export interface FdgLayout {
  /** Frozen final positions keyed by branch name. */
  positions: ReadonlyMap<string, Vec3>;
  /** Distance from origin of the furthest node — useful for camera framing. */
  maxRadius: number;
}

const DEFAULT_ITERATIONS = 300;
const DEFAULT_NODE_RADIUS = 1.5;
const INITIAL_RADIUS = 10;

/** FNV-1a 32-bit hash; deterministic, no allocations. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Distribute a branch's initial position on a sphere (3D) or circle (2D),
 * keyed by name-hash. Avoids the dependence on input array index of the
 * d3-force-3d default initializer.
 */
function initialPosition(branch: string, dims: Dims, radius: number): Vec3 {
  const h = hashStr(branch);
  const u = h / 0x100000000;
  const v = ((h >>> 16) | ((h & 0xffff) << 16)) / 0x100000000;
  const phi = u * Math.PI * 2;
  if (dims === 2) {
    return [radius * Math.cos(phi), radius * Math.sin(phi), 0];
  }
  const cosTheta = 1 - 2 * v;
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  return [radius * sinTheta * Math.cos(phi), radius * cosTheta, radius * sinTheta * Math.sin(phi)];
}

/** Convert an unsigned 32-bit seed to a d3.randomLcg seed in [0, 1). */
function seedToUnit(seed: number): number {
  return ((seed >>> 0) % 0xffffffff) / 0xffffffff;
}

export function computeForceLayout(input: UseForceLayoutInput): FdgLayout {
  const sortedBranches = [...input.branches].sort();

  const nodes: FdgNode[] = sortedBranches.map((b) => {
    const [x, y, z] = initialPosition(b, input.dims, INITIAL_RADIUS);
    const node: FdgNode = { branch: b, x, y, z };
    const pin = input.pins.get(b);
    if (pin) {
      node.fx = pin[0];
      node.fy = pin[1];
      if (input.dims === 3) node.fz = pin[2];
    }
    return node;
  });

  const known = new Set(sortedBranches);
  const links: FdgLink[] = [];
  for (const e of input.edges) {
    if (!known.has(e.a) || !known.has(e.b) || e.a === e.b) continue;
    links.push({ source: e.a, target: e.b, weight: e.weight });
  }

  const radius = input.nodeRadius ?? DEFAULT_NODE_RADIUS;

  const sim = forceSimulation<FdgNode>(nodes, input.dims)
    .randomSource(randomLcg(seedToUnit(input.seed)))
    .force(
      'link',
      forceLink<FdgNode, FdgLink>(links)
        .id((n) => n.branch)
        .distance((l) => input.distanceFn(l.weight))
        .strength(0.5),
    )
    .force('charge', forceManyBody<FdgNode>().strength(input.repulsion))
    .force('collide', forceCollide<FdgNode>(radius))
    .force('center', forceCenter<FdgNode>(0, 0, 0).strength(0.05))
    .stop();

  sim.tick(input.iterations ?? DEFAULT_ITERATIONS);

  const positions = new Map<string, Vec3>();
  let maxRadius = 0;
  for (const n of nodes) {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    const z = input.dims === 3 ? (n.z ?? 0) : 0;
    positions.set(n.branch, [x, y, z]);
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r > maxRadius) maxRadius = r;
  }

  return { positions, maxRadius };
}

export function useForceLayout(input: UseForceLayoutInput): FdgLayout {
  // Deps list the individual fields rather than the `input` object so callers
  // don't have to memoise the wrapper — the simulation is pure in its inputs
  // and only re-runs when a field reference actually changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => computeForceLayout(input), [
    input.branches,
    input.edges,
    input.dims,
    input.repulsion,
    input.distanceFn,
    input.seed,
    input.pins,
    input.iterations,
    input.nodeRadius,
  ]);
}
