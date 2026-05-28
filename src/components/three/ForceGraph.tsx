/**
 * Force-Directed Graph panel for one (repo, day, metric).
 *
 * Peer to `PointCloud3D` in the same panel slot, swapped via `panelMode`. Shares
 * the same shared-selection contract (rule §10.7 linked highlighting), the same
 * main-at-origin convention, and the same Viridis spread colouring.
 *
 * Differences from PointCloud3D:
 *  - Topology is explicit: edges drawn as line segments. `mergeable` mode
 *    thresholds edges by weight so clean-merge clusters become connected
 *    components (Karl's "no conflict as focus" framing).
 *  - Outlier rings are MDS-specific and intentionally omitted here.
 *  - Layout is computed in-browser via seeded `d3-force-3d` — see §3 FDG
 *    exception in code_rules.md for the determinism contract.
 *  - 2D and 3D share one node/edge code path; only the camera rig and the
 *    simulation's `numDimensions` differ.
 */

import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  Html,
  Line,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei';
import { interpolateViridis } from 'd3';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { Camera, WebGLRenderer } from 'three';
import type { DayReport } from '../../data/types';
import { useDayView } from '../../hooks/useDayView';
import type { PinnedPos } from '../../hooks/useDayView';
import { deriveEdges, weightRange, type EdgeEncoding } from '../../data/selectors/forceGraphEdges';
import { useForceLayout, type Dims, type Vec3 } from '../../hooks/useForceLayout';
import { FDG_SEED } from './seed';
import ForceGraphControls from './ForceGraphControls';
import styles from './ForceGraph.module.css';

const MAIN_BRANCH = 'main';
const DEFAULT_REPULSION = -120;
const EDGE_BASE_OPACITY = 0.25;
const EDGE_MAX_OPACITY = 0.85;

interface Props {
  report: DayReport;
  dims: Dims;
}

interface IsolatedSplit {
  active: string[];
  isolated: string[];
}

function splitIsolated(
  report: DayReport,
  simEdges: readonly { a: string; b: string }[],
): IsolatedSplit {
  const connected = new Set<string>();
  for (const e of simEdges) {
    connected.add(e.a);
    connected.add(e.b);
  }
  const active: string[] = [];
  const isolated: string[] = [];
  for (const b of report.branches) {
    if (b === MAIN_BRANCH) {
      active.push(b);
      continue;
    }
    if (connected.has(b)) active.push(b);
    else isolated.push(b);
  }
  return { active, isolated };
}

function AutoOrthoCamera({ cam }: { cam: number }) {
  const size = useThree((s) => s.size);
  const zoom = Math.min(size.width, size.height) / (2.4 * Math.max(cam, 1));
  return (
    <OrthographicCamera
      makeDefault
      position={[0, 0, cam * 4]}
      zoom={zoom}
      near={0.1}
      far={cam * 50}
    />
  );
}

/**
 * Project a screen-space pointer event into world coordinates on a plane.
 *
 * In 2D mode the plane is z=0 (and orientation is fixed). In 3D mode we use a
 * plane through the drag-start position perpendicular to the camera's forward
 * vector, so the node tracks the cursor "in front of" the user.
 */
function projectPointer(
  evt: PointerEvent,
  gl: WebGLRenderer,
  camera: Camera,
  raycaster: Raycaster,
  ndc: Vector2,
  plane: Plane,
  out: Vector3,
): boolean {
  const rect = gl.domElement.getBoundingClientRect();
  ndc.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.ray.intersectPlane(plane, out);
  return hit !== null;
}

interface DragState {
  branch: string;
  pointerId: number;
  plane: Plane;
  moved: boolean;
}

interface NodeViewModel {
  branch: string;
  pos: Vec3;
  color: string;
  isMain: boolean;
  radius: number;
  isPinned: boolean;
}

interface NodeMeshProps {
  node: NodeViewModel;
  dims: Dims;
  isDragged: boolean;
  onHover: (branch: string) => void;
  onUnhover: () => void;
  onDragStart: (branch: string, pointerId: number, plane: Plane) => void;
  onDragMove: (branch: string, pos: Vec3) => void;
  onDragEnd: (branch: string, pointerId: number, moved: boolean) => void;
}

function NodeMesh({
  node,
  dims,
  isDragged,
  onHover,
  onUnhover,
  onDragStart,
  onDragMove,
  onDragEnd,
}: NodeMeshProps) {
  const { camera, gl } = useThree();
  const raycasterRef = useRef(new Raycaster());
  const ndcRef = useRef(new Vector2());
  const planeRef = useRef<Plane | null>(null);
  const intersectRef = useRef(new Vector3());
  const movedRef = useRef(false);

  const buildPlane = useCallback(
    (start: Vec3): Plane => {
      if (dims === 2) {
        return new Plane(new Vector3(0, 0, 1), 0);
      }
      const camDir = new Vector3();
      camera.getWorldDirection(camDir);
      // Plane normal points back at the camera; passes through the node.
      const normal = camDir.clone().negate();
      const constant = -normal.dot(new Vector3(start[0], start[1], start[2]));
      return new Plane(normal, constant);
    },
    [camera, dims],
  );

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const plane = buildPlane(node.pos);
    planeRef.current = plane;
    movedRef.current = false;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    onDragStart(node.branch, e.pointerId, plane);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const plane = planeRef.current;
    if (!plane || !isDragged) return;
    const hit = projectPointer(
      e.nativeEvent,
      gl,
      camera,
      raycasterRef.current,
      ndcRef.current,
      plane,
      intersectRef.current,
    );
    if (!hit) return;
    movedRef.current = true;
    onDragMove(node.branch, [intersectRef.current.x, intersectRef.current.y, intersectRef.current.z]);
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!isDragged) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    onDragEnd(node.branch, e.pointerId, movedRef.current);
    planeRef.current = null;
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(node.branch);
  };

  const handlePointerOut = () => {
    onUnhover();
  };

  const sphereArgs: [number, number, number] = node.isMain
    ? [node.radius, 24, 24]
    : [node.radius, 16, 16];
  const color = node.isMain ? '#2a4d8f' : node.color;

  return (
    <group position={node.pos}>
      <mesh
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <sphereGeometry args={sphereArgs} />
        <meshStandardMaterial color={color} />
      </mesh>
      {node.isPinned && (
        <mesh>
          <ringGeometry args={[node.radius * 1.5, node.radius * 1.8, 24]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.85} />
        </mesh>
      )}
      {/* "main" label is rendered by the parent on hover only, so the
          permanent label doesn't occlude the dense centre of the graph. */}
    </group>
  );
}

export default function ForceGraph({ report, dims }: Props) {
  const {
    metric,
    selectedBranch,
    setSelectedBranch,
    pinnedBranches,
    pinBranch,
    unpinBranch,
    clearPins,
  } = useDayView();

  const range = useMemo(() => weightRange(report, metric), [report, metric]);

  const [thresholdOverride, setThresholdOverride] = useState<number | null>(null);
  const [encoding, setEncoding] = useState<EdgeEncoding>('mergeable');
  const [repulsion, setRepulsion] = useState<number>(DEFAULT_REPULSION);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Reset the threshold override when the metric changes — its units differ
  // wildly between line/conflict/file (a 20-line cutoff would silently zero
  // out a file-drift graph). Using the "adjusting state on prop change" idiom
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes)
  // instead of an effect avoids the cascading-render lint and an extra paint.
  const [lastMetric, setLastMetric] = useState(metric);
  if (lastMetric !== metric) {
    setLastMetric(metric);
    setThresholdOverride(null);
  }

  const threshold = thresholdOverride ?? range.max;

  const { simEdges, renderEdges } = useMemo(
    () => deriveEdges(report, metric, { threshold, encoding }),
    [report, metric, threshold, encoding],
  );

  const { active, isolated } = useMemo(
    () => splitIsolated(report, simEdges),
    [report, simEdges],
  );

  const simEdgesForActive = useMemo(() => {
    const activeSet = new Set(active);
    return simEdges.filter((e) => activeSet.has(e.a) && activeSet.has(e.b));
  }, [active, simEdges]);

  // main auto-anchored at origin; user-pin overrides if set.
  const pins = useMemo(() => {
    const m = new Map<string, Vec3>();
    if (report.branches.includes(MAIN_BRANCH)) m.set(MAIN_BRANCH, [0, 0, 0]);
    for (const [branch, pos] of pinnedBranches) {
      m.set(branch, pos);
    }
    return m;
  }, [report.branches, pinnedBranches]);

  const userPinCount = pinnedBranches.size;

  // Heavy-tailed weight → world distance. Mirror the matrix heatmap's log scale.
  const distanceFn = useMemo(() => {
    const max = range.max;
    const logMax = Math.log1p(max);
    return (w: number) => {
      if (logMax <= 0) return 8;
      const t = Math.log1p(w) / logMax;
      return 4 + t * 22;
    };
  }, [range.max]);

  const layout = useForceLayout({
    branches: active,
    edges: simEdgesForActive,
    dims,
    repulsion,
    distanceFn,
    seed: FDG_SEED,
    pins,
  });

  const mad = report.madContribution[metric];
  const maxMad = useMemo(() => Math.max(...mad, 1), [mad]);

  const cam = Math.max(layout.maxRadius * 2.6, 12);
  const nodeRadius = Math.max(cam * 0.018, 0.35);
  const mainRadius = Math.max(cam * 0.025, 0.4);
  const isolatedRadius = Math.max(cam * 0.022, 0.4);
  const edgeBaseWidth = 1.0;
  const edgeMaxWidth = 2.5;

  const nodeViews = useMemo<NodeViewModel[]>(() => {
    const out: NodeViewModel[] = [];
    for (const branch of active) {
      const pos = layout.positions.get(branch);
      if (!pos) continue;
      const idx = report.branches.indexOf(branch);
      const m = idx >= 0 ? (mad[idx] ?? 0) : 0;
      const isMain = branch === MAIN_BRANCH;
      out.push({
        branch,
        pos,
        color: interpolateViridis(m / maxMad),
        isMain,
        radius: isMain ? mainRadius : nodeRadius,
        isPinned: pinnedBranches.has(branch),
      });
    }
    return out;
  }, [
    active,
    layout,
    report.branches,
    mad,
    maxMad,
    mainRadius,
    nodeRadius,
    pinnedBranches,
  ]);

  if (active.length === 0 && isolated.length === 0) {
    return (
      <div className={styles.wrap}>
        <div className={styles.canvas}>
          <div className={styles.empty}>No branches to graph for this metric.</div>
        </div>
      </div>
    );
  }

  const isolatedAnchor: Vec3 = [-cam * 0.35, cam * 0.35, 0];

  const positionOf = (branch: string): Vec3 | null => {
    return layout.positions.get(branch) ?? null;
  };

  const handleHover = (branch: string) => {
    setSelectedBranch(branch);
  };
  const handleUnhover = () => {
    setSelectedBranch(null);
  };

  const handleDragStart = (branch: string, pointerId: number, plane: Plane) => {
    setDrag({ branch, pointerId, plane, moved: false });
  };
  const handleDragMove = (branch: string, pos: Vec3) => {
    pinBranch(branch, pos as unknown as PinnedPos);
  };
  const handleDragEnd = (branch: string, _pointerId: number, moved: boolean) => {
    // A click without movement on a pinned non-main node unpins it; on
    // unpinned nodes a no-move click just confirms selection (already set on
    // hover/over).
    if (!moved && branch !== MAIN_BRANCH && pinnedBranches.has(branch)) {
      unpinBranch(branch);
    }
    setDrag(null);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.canvas}>
        <Canvas frameloop="demand" dpr={[1, 2]}>
          {dims === 3 ? (
            <PerspectiveCamera
              makeDefault
              position={[cam, cam, cam]}
              fov={45}
              near={0.1}
              far={cam * 20}
            />
          ) : (
            <AutoOrthoCamera cam={cam} />
          )}
          <ambientLight intensity={0.6} />
          <directionalLight position={[cam, cam, cam]} intensity={0.6} />
          <OrbitControls
            makeDefault
            enableDamping
            enabled={drag === null}
            enableRotate={dims === 3}
            target={[0, 0, 0]}
          />

          {/* Edges */}
          {renderEdges.map((e) => {
            const a = positionOf(e.a);
            const b = positionOf(e.b);
            if (!a || !b) return null;
            const opacity =
              EDGE_BASE_OPACITY + e.intensity * (EDGE_MAX_OPACITY - EDGE_BASE_OPACITY);
            const lineWidth = edgeBaseWidth + e.intensity * (edgeMaxWidth - edgeBaseWidth);
            return (
              <Line
                key={`${e.a}|${e.b}`}
                points={[a, b]}
                color="#475569"
                lineWidth={lineWidth}
                transparent
                opacity={opacity}
              />
            );
          })}

          {/* Origin pile-up: branches with no edges in this metric */}
          {isolated.length > 0 && (
            <group position={isolatedAnchor}>
              <mesh>
                <octahedronGeometry args={[isolatedRadius, 0]} />
                <meshStandardMaterial color="#94a3b8" />
              </mesh>
              <Html className={styles.label} center>
                {isolated.length} no-conflict branches
              </Html>
            </group>
          )}

          {/* Branch nodes (main + active). Per-mesh so each can handle drag. */}
          {nodeViews.map((n) => (
            <NodeMesh
              key={n.branch}
              node={n}
              dims={dims}
              isDragged={drag?.branch === n.branch}
              onHover={handleHover}
              onUnhover={handleUnhover}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
            />
          ))}

          {/* Selection highlight */}
          {selectedBranch &&
            (() => {
              const pos = positionOf(selectedBranch);
              if (!pos) return null;
              const isMainSelected = selectedBranch === MAIN_BRANCH;
              return (
                <group position={pos}>
                  <mesh>
                    <sphereGeometry args={[Math.max(cam * 0.024, 0.45), 16, 16]} />
                    <meshBasicMaterial color="#f59e0b" wireframe />
                  </mesh>
                  <Html
                    className={`${styles.label} ${isMainSelected ? styles.labelMain : styles.labelHover}`}
                    center
                  >
                    {selectedBranch}
                  </Html>
                </group>
              );
            })()}
        </Canvas>

        <div className={styles.legend}>
          <div className={styles.legendRow}>
            <span className={styles.swatchMain} /> main (anchor)
          </div>
          <div className={styles.legendRow}>
            <span className={styles.gradient} /> spread (low → high)
          </div>
          <div>edges: {encoding === 'mergeable' ? 'mergeable (≤ threshold)' : 'all, weighted'}</div>
        </div>
      </div>

      <ForceGraphControls
        range={range}
        threshold={threshold}
        setThreshold={setThresholdOverride}
        encoding={encoding}
        setEncoding={setEncoding}
        repulsion={repulsion}
        setRepulsion={setRepulsion}
        hasPins={userPinCount > 0}
        clearPins={clearPins}
      />
    </div>
  );
}
