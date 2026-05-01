/**
 * 3D MDS point cloud for one (repo, day, metric).
 *
 * - Anchors `main` at the world origin so positions are visually stable across days
 *   even though MDS is invariant only up to translation/rotation/reflection (rule §10.1).
 * - Colors non-origin branch points by their distance-from-centroid (Viridis), so
 *   outliers stand out (rule §10.4-style perceptual palette).
 * - Origin pile-up (branches with no measured conflicts) is collapsed into a single
 *   labelled marker rather than a stack of identical spheres.
 * - Outlier rings at 1× and 2× the metric's drift value give a geometric reading of
 *   the scalar drift number.
 * - Hover sets the shared selectedBranch (rule §10.7 linked highlighting).
 */

import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Html, Instance, Instances, OrbitControls } from '@react-three/drei';
import { interpolateViridis } from 'd3';
import { useMemo, useState } from 'react';
import { DoubleSide } from 'three';
import type { DayReport, DriftMetric } from '../../data/types';
import { useDayView } from '../../hooks/useDayView';
import styles from './PointCloud3D.module.css';

const ZERO_EPSILON = 1e-9;
const MAIN_BRANCH = 'main';

interface Props {
  report: DayReport;
}

interface Prepared {
  positions: [number, number, number][];
  colors: string[];
  mainIndex: number;
  centroid: [number, number, number];
  originIndices: ReadonlySet<number>;
  cameraDistance: number;
  drift: number;
}

function isOrigin(p: readonly [number, number, number]): boolean {
  return (
    Math.abs(p[0]) < ZERO_EPSILON && Math.abs(p[1]) < ZERO_EPSILON && Math.abs(p[2]) < ZERO_EPSILON
  );
}

function prepare(report: DayReport, metric: DriftMetric): Prepared {
  const points = report.pointClouds[metric];
  const mad = report.madContribution[metric];
  const branches = report.branches;
  const drift = report.drift[metric];

  const mainIndex = branches.indexOf(MAIN_BRANCH);
  const mainPos: [number, number, number] =
    mainIndex >= 0 && points[mainIndex] ? points[mainIndex]! : [0, 0, 0];

  const positions: [number, number, number][] = points.map((p) => [
    p[0] - mainPos[0],
    p[1] - mainPos[1],
    p[2] - mainPos[2],
  ]);

  const originIndices = new Set<number>();
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (p && isOrigin(p)) originIndices.add(i);
  }

  let cx = 0;
  let cy = 0;
  let cz = 0;
  let countedForCentroid = 0;
  let maxRadius = 0;
  for (let i = 0; i < positions.length; i += 1) {
    if (i === mainIndex) continue;
    if (originIndices.has(i)) continue;
    const p = positions[i];
    if (!p) continue;
    cx += p[0];
    cy += p[1];
    cz += p[2];
    countedForCentroid += 1;
    const r = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
    if (r > maxRadius) maxRadius = r;
  }
  if (countedForCentroid > 0) {
    cx /= countedForCentroid;
    cy /= countedForCentroid;
    cz /= countedForCentroid;
  }

  const maxMad = Math.max(...mad, 1);
  const colors = mad.map((v) => interpolateViridis(v / maxMad));

  // Auto-fit: camera distance proportional to bounding radius. Add a floor so
  // tiny clouds (everything near origin) are still framed sensibly.
  const cameraDistance = Math.max(maxRadius * 2.6, 12);

  return {
    positions,
    colors,
    mainIndex,
    centroid: [cx, cy, cz],
    originIndices,
    cameraDistance,
    drift,
  };
}

export default function PointCloud3D({ report }: Props) {
  const { metric, selectedBranch, setSelectedBranch } = useDayView();
  const prepared = useMemo(() => prepare(report, metric), [report, metric]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const branches = report.branches;
  const visibleIndices = useMemo<number[]>(() => {
    const out: number[] = [];
    for (let i = 0; i < branches.length; i += 1) {
      if (i === prepared.mainIndex) continue;
      if (prepared.originIndices.has(i)) continue;
      out.push(i);
    }
    return out;
  }, [branches.length, prepared.mainIndex, prepared.originIndices]);

  if (visibleIndices.length === 0 && prepared.mainIndex < 0) {
    return <div className={styles.empty}>No spatial data for this metric.</div>;
  }

  const cam = prepared.cameraDistance;
  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const id = e.instanceId;
    if (id === undefined) return;
    const branchIdx = visibleIndices[id];
    if (branchIdx === undefined) return;
    setHoverIdx(branchIdx);
    const name = branches[branchIdx];
    if (name) setSelectedBranch(name);
  };
  const handlePointerOut = () => {
    setHoverIdx(null);
    setSelectedBranch(null);
  };

  const showOriginCluster = prepared.originIndices.size > 0;
  const originVisualPos: [number, number, number] = (() => {
    // After translating so main is at origin, origin-pile-up branches sit at -mainPos.
    // Use the first origin-branch's translated position; they all coincide.
    const first = prepared.originIndices.values().next().value;
    if (first === undefined) return [0, 0, 0];
    return prepared.positions[first] ?? [0, 0, 0];
  })();

  return (
    <div className={styles.wrap}>
      <Canvas camera={{ position: [cam, cam, cam], fov: 45, near: 0.1, far: cam * 20 }}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[cam, cam, cam]} intensity={0.7} />
        <OrbitControls makeDefault enableDamping target={prepared.centroid} />

        {prepared.mainIndex >= 0 && (
          <group position={[0, 0, 0]}>
            <mesh>
              <sphereGeometry args={[Math.max(cam * 0.025, 0.4), 24, 24]} />
              <meshStandardMaterial color="#2a4d8f" />
            </mesh>
            <Html
              className={`${styles.label} ${styles.labelMain}`}
              center
              distanceFactor={cam * 1.4}
            >
              main
            </Html>
          </group>
        )}

        {showOriginCluster && (
          <group position={originVisualPos}>
            <mesh>
              <octahedronGeometry args={[Math.max(cam * 0.022, 0.4), 0]} />
              <meshStandardMaterial color="#94a3b8" />
            </mesh>
            <Html className={styles.label} center distanceFactor={cam * 1.4}>
              {prepared.originIndices.size} no-conflict branches
            </Html>
          </group>
        )}

        {visibleIndices.length > 0 && (
          <Instances
            limit={visibleIndices.length}
            onPointerMove={handlePointerMove}
            onPointerOut={handlePointerOut}
          >
            <sphereGeometry args={[Math.max(cam * 0.018, 0.35), 16, 16]} />
            <meshStandardMaterial />
            {visibleIndices.map((branchIdx, i) => {
              const pos = prepared.positions[branchIdx]!;
              const color = prepared.colors[branchIdx]!;
              return <Instance key={branches[branchIdx] ?? i} position={pos} color={color} />;
            })}
          </Instances>
        )}

        {/* Outlier rings: 1× and 2× drift */}
        {prepared.drift > 0 && (
          <group position={prepared.centroid}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[prepared.drift, prepared.drift + cam * 0.005, 64]} />
              <meshBasicMaterial color="#94a3b8" transparent opacity={0.45} side={DoubleSide} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[prepared.drift * 2, prepared.drift * 2 + cam * 0.005, 64]} />
              <meshBasicMaterial color="#cbd5e1" transparent opacity={0.35} side={DoubleSide} />
            </mesh>
          </group>
        )}

        {hoverIdx !== null && prepared.positions[hoverIdx] && (
          <group position={prepared.positions[hoverIdx]!}>
            <Html
              className={`${styles.label} ${styles.labelHover}`}
              center
              distanceFactor={cam * 1.4}
            >
              {branches[hoverIdx]}
            </Html>
          </group>
        )}

        {selectedBranch &&
          selectedBranch !== MAIN_BRANCH &&
          (() => {
            const idx = branches.indexOf(selectedBranch);
            if (idx < 0 || idx === hoverIdx) return null;
            const pos = prepared.positions[idx];
            if (!pos) return null;
            return (
              <group position={pos}>
                <mesh>
                  <sphereGeometry args={[Math.max(cam * 0.024, 0.45), 16, 16]} />
                  <meshBasicMaterial color="#f59e0b" wireframe />
                </mesh>
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
        <div>rings: 1× and 2× drift around centroid</div>
      </div>
    </div>
  );
}
