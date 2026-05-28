/**
 * Divergent heatmap of pairwise conflict deltas between two day reports.
 *
 * - Sibling of `ConflictMatrix.tsx`; built as a separate component because the
 *   semantics differ (signed deltas, union branches, no per-day cluster ordering).
 * - Color scheme: `d3.interpolateRdBu` (perceptually balanced diverging,
 *   colorblind-safe). With t = (Δ + M) / (2M) this gives:
 *     dark red for the most negative Δ (drift improved on that pair),
 *     near-white at Δ ≈ 0,
 *     dark blue for the most positive Δ (drift worsened on that pair).
 *   Blue-for-worse aligns with the project's `--accent: #2a4d8f`.
 * - Domain is symmetric around 0; M = max |Δ| across rendered cells.
 * - Ordering: union branches alphabetical only. `report.ordering[metric]` is
 *   per-day and has no canonical extension to a two-day union.
 * - Hover on a row/col label or non-zero cell publishes `selectedBranch` to
 *   `DiffViewContext` for cross-panel linking with `BranchDeltaRanking`.
 */

import { interpolateRdBu } from 'd3';
import { useMemo, useState } from 'react';
import type { PairDelta } from '../../data/selectors/dayReportDiff';
import { useDiffView } from '../../hooks/useDiffView';
import styles from './DeltaConflictMatrix.module.css';

const CELL = 14;
const LEFT_LABEL_W = 150;
const TOP_LABEL_H = 110;
const PAD = 8;
const ZERO_FILL = '#fafaf8';

interface Props {
  unionBranches: readonly string[];
  pairDeltas: readonly PairDelta[];
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

interface Prepared {
  ordered: string[];
  matrix: number[][];
  maxAbs: number;
}

function prepareMatrix(unionBranches: readonly string[], pairDeltas: readonly PairDelta[]): Prepared {
  const ordered = unionBranches.slice().sort((a, b) => a.localeCompare(b, 'en-US'));
  const indexOf = new Map<string, number>();
  for (let i = 0; i < ordered.length; i += 1) {
    const name = ordered[i];
    if (name !== undefined) indexOf.set(name, i);
  }
  const n = ordered.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let maxAbs = 0;
  for (const p of pairDeltas) {
    const i = indexOf.get(p.a);
    const j = indexOf.get(p.b);
    if (i === undefined || j === undefined) continue;
    const row = matrix[i];
    const otherRow = matrix[j];
    if (!row || !otherRow) continue;
    row[j] = p.deltaWeight;
    otherRow[i] = p.deltaWeight;
    const a = Math.abs(p.deltaWeight);
    if (a > maxAbs) maxAbs = a;
  }
  return { ordered, matrix, maxAbs };
}

const signedFmt = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

export default function DeltaConflictMatrix({ unionBranches, pairDeltas }: Props) {
  const { selectedBranch, setSelectedBranch } = useDiffView();
  const [logScale, setLogScale] = useState(true);

  const { ordered, matrix, maxAbs } = useMemo(
    () => prepareMatrix(unionBranches, pairDeltas),
    [unionBranches, pairDeltas],
  );

  if (ordered.length === 0) {
    return <div className={styles.empty}>No branches in the union.</div>;
  }
  if (maxAbs === 0) {
    return <div className={styles.empty}>No pairwise changes between these days.</div>;
  }

  const colorOf = (v: number): string => {
    if (v === 0) return ZERO_FILL;
    const sign = v > 0 ? 1 : -1;
    const t = logScale
      ? (sign * Math.log1p(Math.abs(v))) / Math.log1p(maxAbs) / 2 + 0.5
      : (v + maxAbs) / (2 * maxAbs);
    return interpolateRdBu(t);
  };

  const n = ordered.length;
  const width = LEFT_LABEL_W + n * CELL + PAD;
  const height = TOP_LABEL_H + n * CELL + PAD;

  const handleEnter = (name: string) => () => setSelectedBranch(name);
  const handleLeave = () => setSelectedBranch(null);

  return (
    <div>
      <div className={styles.controls}>
        <label>
          <input
            type="checkbox"
            checked={logScale}
            onChange={(e) => setLogScale(e.target.checked)}
          />
          symmetric log color scale
        </label>
      </div>

      <div className={styles.svgWrap}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className={styles.svg}
        >
          {ordered.map((name, i) => {
            const cx = LEFT_LABEL_W + i * CELL + CELL / 2;
            const cy = TOP_LABEL_H - 4;
            const isSelected = selectedBranch === name;
            return (
              <text
                key={`t-${name}`}
                x={cx}
                y={cy}
                transform={`rotate(-45 ${cx} ${cy})`}
                textAnchor="start"
                className={isSelected ? styles.labelSelected : styles.label}
                onMouseEnter={handleEnter(name)}
                onMouseLeave={handleLeave}
              >
                {truncate(name, 22)}
              </text>
            );
          })}

          {ordered.map((name, i) => {
            const isSelected = selectedBranch === name;
            return (
              <text
                key={`l-${name}`}
                x={LEFT_LABEL_W - 4}
                y={TOP_LABEL_H + i * CELL + CELL / 2 + 3}
                textAnchor="end"
                className={isSelected ? styles.labelSelected : styles.label}
                onMouseEnter={handleEnter(name)}
                onMouseLeave={handleLeave}
              >
                {truncate(name, 22)}
              </text>
            );
          })}

          {ordered.map((rowName, r) =>
            ordered.map((colName, c) => {
              const v = matrix[r]?.[c] ?? 0;
              const fill = r === c ? '#e7e7e2' : colorOf(v);
              const isSelected =
                selectedBranch !== null &&
                (selectedBranch === rowName || selectedBranch === colName) &&
                v !== 0;
              return (
                <rect
                  key={`${r}-${c}`}
                  x={LEFT_LABEL_W + c * CELL}
                  y={TOP_LABEL_H + r * CELL}
                  width={CELL - 1}
                  height={CELL - 1}
                  fill={fill}
                  className={isSelected ? `${styles.cell} ${styles.cellSelected}` : styles.cell}
                  onMouseEnter={v !== 0 ? handleEnter(rowName) : undefined}
                  onMouseLeave={v !== 0 ? handleLeave : undefined}
                >
                  {v !== 0 && (
                    <title>
                      {rowName} ↔ {colName}: {signedFmt.format(v)}
                    </title>
                  )}
                </rect>
              );
            }),
          )}
        </svg>
      </div>

      <div className={styles.legend}>
        <span>−{signedFmt.format(maxAbs).replace('+', '')}</span>
        <span className={styles.legendBar} />
        <span>+{signedFmt.format(maxAbs).replace('+', '')}</span>
        <span style={{ marginLeft: 'auto' }}>
          {logScale ? 'symmetric log scale' : 'linear scale'}
        </span>
      </div>
    </div>
  );
}
