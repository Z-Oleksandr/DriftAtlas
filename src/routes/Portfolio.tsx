/**
 * Portfolio (home) view.
 *
 * Per-repo row: label · sparkline · calendar heatmap · peak. Cells are colored
 * by per-repo-normalized drift (rule §10.4) so a "hot" cell means "high for
 * this repo", not "high overall". Click a cell → Day view; click the repo
 * label → Repo view.
 */

import { interpolateViridis } from 'd3';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Sparkline from '../components/charts/Sparkline';
import { ALL_METRICS } from '../data/types';
import type { DriftMetric, PortfolioRepo } from '../data/types';
import { usePortfolio } from '../hooks/usePortfolio';
import styles from './Portfolio.module.css';

type SortKey = 'name' | 'peak' | 'commits';

interface RowData extends PortfolioRepo {
  values: ReadonlyArray<number | null>;
  peak: number;
  min: number;
  commitsTotal: number;
}

const METRIC_COLOR: Record<DriftMetric, string> = {
  line: '#2a4d8f',
  conflict: '#d97706',
  file: '#059669',
};

const METRIC_LABEL: Record<DriftMetric, string> = {
  line: 'line drift',
  conflict: 'conflict drift',
  file: 'file drift',
};

const SORT_LABEL: Record<SortKey, string> = {
  name: 'alphabetical',
  peak: 'peak drift (desc)',
  commits: 'total commits (desc)',
};

function compareRows(a: RowData, b: RowData, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'peak':
      return b.peak - a.peak;
    case 'commits':
      return b.commitsTotal - a.commitsTotal;
  }
}

interface CellTooltip {
  x: number;
  y: number;
  repo: string;
  date: string;
  value: number | null;
}

export default function Portfolio() {
  const result = usePortfolio();
  const [metric, setMetric] = useState<DriftMetric>('line');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [tooltip, setTooltip] = useState<CellTooltip | null>(null);
  const navigate = useNavigate();

  const rows = useMemo<RowData[]>(() => {
    if (result.status !== 'success') return [];
    return result.data.repos
      .map((r) => {
        const values = r.drifts[metric];
        const positives = values.filter((v): v is number => v !== null);
        const peak = positives.length > 0 ? Math.max(...positives) : 0;
        const min = positives.length > 0 ? Math.min(...positives) : 0;
        const commitsTotal = r.commits.reduce<number>((sum, c) => sum + (c ?? 0), 0);
        return { ...r, values, peak, min, commitsTotal };
      })
      .sort((a, b) => compareRows(a, b, sortKey));
  }, [result, metric, sortKey]);

  if (result.status === 'loading') {
    return <p className={styles.empty}>Loading repositories…</p>;
  }
  if (result.status === 'error') {
    return <div className={styles.error}>Could not load the portfolio.</div>;
  }

  const dates = result.data.dates;

  return (
    <div>
      <h1 className={styles.heading}>Repositories</h1>
      <p className={styles.summary}>
        {rows.length} repositories · {dates.length} working days analyzed. Cells are colored by
        per-repo-normalized {METRIC_LABEL[metric]}; click any cell to open the day view.
      </p>

      <div className={styles.controls}>
        <div className={styles.metricGroup} role="tablist" aria-label="Drift metric">
          {ALL_METRICS.map((m) => (
            <button
              key={m}
              type="button"
              className={
                m === metric ? `${styles.metricBtn} ${styles.metricBtnActive}` : styles.metricBtn
              }
              onClick={() => setMetric(m)}
              aria-pressed={m === metric}
            >
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
        <label className={styles.sortLabel}>
          sort:{' '}
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className={styles.sortSelect}
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.matrixWrap}>
        <div className={styles.matrix}>
          <div className={styles.headerRow}>
            <div className={styles.headerCell}>repo</div>
            <div className={styles.headerCell}>{METRIC_LABEL[metric]}</div>
            <div className={`${styles.headerCell} ${styles.headerCellTimeline}`}>
              <div className={styles.timelineHeader}>
                <span>{dates[0] ?? ''}</span>
                <span>{dates[dates.length - 1] ?? ''}</span>
              </div>
            </div>
            <div className={`${styles.headerCell} ${styles.headerCellRight}`}>peak</div>
          </div>

          {rows.map((row, rowIdx) => {
            const span = row.peak - row.min || 1;
            const isLast = rowIdx === rows.length - 1;
            const lastClass = isLast ? styles.rowCellLast : '';
            return (
              <div key={row.name} className={styles.row}>
                <div className={`${styles.rowCell} ${lastClass}`}>
                  <Link to={`/repo/${encodeURIComponent(row.name)}`} className={styles.repoLink}>
                    {row.name}
                  </Link>
                </div>
                <div className={`${styles.rowCell} ${lastClass}`}>
                  <Sparkline
                    values={row.values}
                    width={120}
                    height={26}
                    color={METRIC_COLOR[metric]}
                  />
                </div>
                <div className={`${styles.rowCell} ${lastClass}`}>
                  <div className={styles.cellsTrack}>
                    {row.values.map((v, i) => {
                      const date = dates[i];
                      if (date === undefined) return null;
                      if (v === null) {
                        return (
                          <div
                            key={i}
                            className={`${styles.cell} ${styles.cellNull}`}
                            aria-label={`${row.name} ${date}: no data`}
                          />
                        );
                      }
                      const t = (v - row.min) / span;
                      const fill = interpolateViridis(t);
                      return (
                        <div
                          key={i}
                          className={styles.cell}
                          style={{ backgroundColor: fill }}
                          onMouseEnter={(e) =>
                            setTooltip({
                              x: e.clientX,
                              y: e.clientY,
                              repo: row.name,
                              date,
                              value: v,
                            })
                          }
                          onMouseMove={(e) =>
                            setTooltip((prev) =>
                              prev ? { ...prev, x: e.clientX, y: e.clientY } : prev,
                            )
                          }
                          onMouseLeave={() => setTooltip(null)}
                          onClick={() => navigate(`/repo/${encodeURIComponent(row.name)}/${date}`)}
                          aria-label={`${row.name} ${date}: ${v.toFixed(2)}`}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className={`${styles.rowCell} ${styles.peakValue} ${lastClass}`}>
                  {row.peak.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {tooltip && (
        <div className={styles.tooltip} style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
          <strong>{tooltip.repo}</strong> · {tooltip.date}
          <br />
          {METRIC_LABEL[metric]}: {tooltip.value !== null ? tooltip.value.toFixed(3) : '—'}
        </div>
      )}
    </div>
  );
}
