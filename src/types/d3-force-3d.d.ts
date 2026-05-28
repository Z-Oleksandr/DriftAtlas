/**
 * Minimal ambient typings for `d3-force-3d` (v3.0.6).
 *
 * No `@types/d3-force-3d` exists on npm. This shim covers only the API surface
 * we actually call from `useForceLayout`. Extend it (rather than reach for `any`)
 * if more of the library is needed later.
 *
 * Mirrors the public API documented in the package README and read from
 * `node_modules/d3-force-3d/src/*.js`.
 */

declare module 'd3-force-3d' {
  export interface SimulationNode {
    index?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
  }

  export interface SimulationLink<N extends SimulationNode> {
    source: string | number | N;
    target: string | number | N;
    index?: number;
  }

  export interface Force<N extends SimulationNode> {
    (alpha: number): void;
    initialize?(nodes: N[], random: () => number): void;
  }

  export interface Simulation<N extends SimulationNode> {
    restart(): this;
    stop(): this;
    tick(iterations?: number): this;
    nodes(): N[];
    nodes(nodes: N[]): this;
    alpha(): number;
    alpha(value: number): this;
    alphaMin(): number;
    alphaMin(value: number): this;
    alphaDecay(): number;
    alphaDecay(value: number): this;
    alphaTarget(): number;
    alphaTarget(value: number): this;
    velocityDecay(): number;
    velocityDecay(value: number): this;
    randomSource(): () => number;
    randomSource(source: () => number): this;
    numDimensions(): number;
    numDimensions(n: number): this;
    force(name: string): Force<N> | undefined;
    force(name: string, force: Force<N> | null): this;
    on(typenames: 'tick' | 'end', listener: (() => void) | null): this;
  }

  export function forceSimulation<N extends SimulationNode>(
    nodes?: N[],
    numDimensions?: number,
  ): Simulation<N>;

  export interface LinkForce<N extends SimulationNode, L extends SimulationLink<N>>
    extends Force<N> {
    links(): L[];
    links(links: L[]): this;
    id(accessor: (node: N) => string | number): this;
    distance(value: number | ((link: L, i: number, links: L[]) => number)): this;
    strength(value: number | ((link: L, i: number, links: L[]) => number)): this;
    iterations(n: number): this;
  }
  export function forceLink<N extends SimulationNode, L extends SimulationLink<N>>(
    links?: L[],
  ): LinkForce<N, L>;

  export interface ManyBodyForce<N extends SimulationNode> extends Force<N> {
    strength(value: number | ((node: N, i: number, nodes: N[]) => number)): this;
    theta(value: number): this;
    distanceMin(value: number): this;
    distanceMax(value: number): this;
  }
  export function forceManyBody<N extends SimulationNode>(): ManyBodyForce<N>;

  export interface CollideForce<N extends SimulationNode> extends Force<N> {
    radius(value: number | ((node: N, i: number, nodes: N[]) => number)): this;
    strength(value: number): this;
    iterations(n: number): this;
  }
  export function forceCollide<N extends SimulationNode>(
    radius?: number | ((node: N) => number),
  ): CollideForce<N>;

  export interface CenterForce<N extends SimulationNode> extends Force<N> {
    x(value: number): this;
    y(value: number): this;
    z(value: number): this;
    strength(value: number): this;
  }
  export function forceCenter<N extends SimulationNode>(
    x?: number,
    y?: number,
    z?: number,
  ): CenterForce<N>;

  export interface PositionForce<N extends SimulationNode> extends Force<N> {
    strength(value: number | ((node: N, i: number, nodes: N[]) => number)): this;
  }
  export function forceX<N extends SimulationNode>(
    x?: number | ((node: N) => number),
  ): PositionForce<N>;
  export function forceY<N extends SimulationNode>(
    y?: number | ((node: N) => number),
  ): PositionForce<N>;
  export function forceZ<N extends SimulationNode>(
    z?: number | ((node: N) => number),
  ): PositionForce<N>;
}
