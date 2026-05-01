/**
 * Per-branch summary table for one (repo, day, metric).
 *
 * Columns: branch name, conflict mass (Σ row weights), # partners, distance to main,
 * MAD contribution (distance from centroid).
 *
 * Hover → publishes selectedBranch to DayViewContext (rule §10.7 linked highlighting).
 * Click on a column header sorts; clicking again flips direction.
 */

import { useMemo, useState } from 'react';
import type { DayReport } from '../../data/types';
import { summarizeBranches, type BranchSummary } from '../../data/selectors/dayReport';
import { useDayView } from '../../hooks/useDayView';
import styles from './BranchRanking.module.css';

type SortKey = 'name' | 'conflictMass' | 'partnerCount' | 'distanceToMain' | 'madContribution';

interface Props {
  report: DayReport;
}

const COLUMNS: ReadonlyArray<{
  key: SortKey;
  label: string;
  numeric: boolean;
  defaultDir: 'asc' | 'desc';
}> = [
  { key: 'name', label: 'branch', numeric: false, defaultDir: 'asc' },
  { key: 'conflictMass', label: 'conflict mass', numeric: true, defaultDir: 'desc' },
  { key: 'partnerCount', label: 'partners', numeric: true, defaultDir: 'desc' },
  { key: 'distanceToMain', label: 'distance to main', numeric: true, defaultDir: 'desc' },
  { key: 'madContribution', label: 'spread', numeric: true, defaultDir: 'desc' },
];

function compare(a: BranchSummary, b: BranchSummary, key: SortKey): number {
  if (key === 'name') return a.name.localeCompare(b.name);
  const av = a[key];
  const bv = b[key];
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return av - bv;
}

export default function BranchRanking({ report }: Props) {
  const { metric, selectedBranch, setSelectedBranch } = useDayView();
  const [sortKey, setSortKey] = useState<SortKey>('conflictMass');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo<BranchSummary[]>(() => {
    const summaries = summarizeBranches(report, metric);
    summaries.sort((a, b) => {
      const c = compare(a, b, sortKey);
      return sortDir === 'asc' ? c : -c;
    });
    return summaries;
  }, [report, metric, sortKey, sortDir]);

  const onHeaderClick = (col: (typeof COLUMNS)[number]) => () => {
    if (sortKey === col.key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir(col.defaultDir);
    }
  };

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const active = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  className={col.numeric ? styles.numeric : undefined}
                  onClick={onHeaderClick(col)}
                  scope="col"
                >
                  {col.label}
                  {active && (
                    <span className={styles.sortArrow}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = selectedBranch === row.name;
            const isMain = row.name === 'main';
            const className = [
              styles.tableRow,
              isSelected && styles.tableRowSelected,
              isMain && styles.tableRowMain,
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <tr
                key={row.name}
                className={className}
                onMouseEnter={() => setSelectedBranch(row.name)}
                onMouseLeave={() => setSelectedBranch(null)}
              >
                <td>
                  <span className={styles.branchName} title={row.name}>
                    {row.name}
                  </span>
                  {row.isAtOrigin && <span className={styles.tag}>no conflicts</span>}
                </td>
                <td className={styles.numeric}>
                  {row.conflictMass > 0 ? (
                    row.conflictMass.toLocaleString(undefined, { maximumFractionDigits: 2 })
                  ) : (
                    <span className={styles.dim}>—</span>
                  )}
                </td>
                <td className={styles.numeric}>
                  {row.partnerCount > 0 ? row.partnerCount : <span className={styles.dim}>—</span>}
                </td>
                <td className={styles.numeric}>
                  {row.distanceToMain !== null ? (
                    row.distanceToMain.toFixed(2)
                  ) : (
                    <span className={styles.dim}>—</span>
                  )}
                </td>
                <td className={styles.numeric}>
                  {row.madContribution > 0 ? (
                    row.madContribution.toFixed(3)
                  ) : (
                    <span className={styles.dim}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
