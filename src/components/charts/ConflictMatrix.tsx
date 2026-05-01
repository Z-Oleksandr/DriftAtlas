/**
 * Reordered conflict matrix heatmap for one (repo, day, metric).
 *
 * - Densifies the edge list inside this component (rule §6.5: loaders return edge
 *   lists; densification happens at the render boundary).
 * - Default ordering uses the precomputed hierarchical leaf order from preprocessing
 *   (rule §10.7-adjacent: avoid duplicating expensive math in the browser).
 *   Toggleable to alphabetical for sanity-checking.
 * - Symlog by default — drift values span orders of magnitude even within one day.
 * - Hover on a row/col label or a cell publishes `selectedBranch` to the shared
 *   DayViewContext (rule §10.7 linked highlighting).
 */

import { interpolateViridis } from 'd3';
import { useMemo, useState } from 'react';
import type { DayReport } from '../../data/types';
import { densifyEdges } from '../../data/selectors/dayReport';
import { useDayView } from '../../hooks/useDayView';
import styles from './ConflictMatrix.module.css';

const CELL = 14;
const LEFT_LABEL_W = 150;
const TOP_LABEL_H = 110;
const PAD = 8;
const ZERO_FILL = '#fafaf8';

interface Props {
  report: DayReport;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

interface Prepared {
  ordered: string[];
  matrix: number[][];
  maxWeight: number;
}

function prepareMatrix(
  report: DayReport,
  metric: 'line' | 'conflict' | 'file',
  orderMode: 'cluster' | 'alpha',
): Prepared {
  const branches = report.branches;
  const matrix = densifyEdges(branches, report.edges[metric]);

  let order: number[];
  if (orderMode === 'cluster') {
    order = report.ordering[metric].slice();
  } else {
    order = branches
      .map((_, i) => i)
      .sort((a, b) => (branches[a] ?? '').localeCompare(branches[b] ?? ''));
  }

  // Reorder: build a re-permuted matrix so cell access is trivial later.
  const orderedBranches = order.map((i) => branches[i] ?? '');
  const reordered = order.map((r) => order.map((c) => matrix[r]?.[c] ?? 0));

  let maxWeight = 0;
  for (const row of reordered) {
    for (const v of row) if (v > maxWeight) maxWeight = v;
  }

  return { ordered: orderedBranches, matrix: reordered, maxWeight };
}

export default function ConflictMatrix({ report }: Props) {
  const { metric, selectedBranch, setSelectedBranch } = useDayView();
  const [logScale, setLogScale] = useState(true);
  const [orderMode, setOrderMode] = useState<'cluster' | 'alpha'>('cluster');

  const { ordered, matrix, maxWeight } = useMemo(
    () => prepareMatrix(report, metric, orderMode),
    [report, metric, orderMode],
  );

  if (ordered.length === 0) {
    return <div className={styles.empty}>No branches in this report.</div>;
  }
  if (maxWeight === 0) {
    return <div className={styles.empty}>No conflicts on this metric.</div>;
  }

  const colorOf = (v: number): string => {
    if (v <= 0) return ZERO_FILL;
    const t = logScale ? Math.log1p(v) / Math.log1p(maxWeight) : v / maxWeight;
    return interpolateViridis(t);
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
          log color scale
        </label>
        <select
          value={orderMode}
          onChange={(e) => setOrderMode(e.target.value as 'cluster' | 'alpha')}
          aria-label="Ordering"
        >
          <option value="cluster">clustered</option>
          <option value="alpha">alphabetical</option>
        </select>
      </div>

      <div className={styles.svgWrap}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className={styles.svg}
        >
          {/* top labels (rotated 45°, anchored at the cell column) */}
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

          {/* left labels */}
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

          {/* cells */}
          {ordered.map((rowName, r) =>
            ordered.map((colName, c) => {
              const v = matrix[r]?.[c] ?? 0;
              const fill = r === c ? '#e7e7e2' : colorOf(v);
              const isSelected =
                selectedBranch !== null &&
                (selectedBranch === rowName || selectedBranch === colName) &&
                v > 0;
              return (
                <rect
                  key={`${r}-${c}`}
                  x={LEFT_LABEL_W + c * CELL}
                  y={TOP_LABEL_H + r * CELL}
                  width={CELL - 1}
                  height={CELL - 1}
                  fill={fill}
                  className={isSelected ? `${styles.cell} ${styles.cellSelected}` : styles.cell}
                  onMouseEnter={handleEnter(v > 0 ? rowName : '')}
                  onMouseLeave={handleLeave}
                >
                  {v > 0 && (
                    <title>
                      {rowName} ↔ {colName}: {v.toLocaleString()}
                    </title>
                  )}
                </rect>
              );
            }),
          )}
        </svg>
      </div>

      <div className={styles.legend}>
        <span>0</span>
        <span className={styles.legendBar} />
        <span>{maxWeight.toLocaleString()}</span>
        <span style={{ marginLeft: 'auto' }}>{logScale ? 'log scale' : 'linear scale'}</span>
      </div>
    </div>
  );
}
