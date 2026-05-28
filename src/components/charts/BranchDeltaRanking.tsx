/**
 * Per-branch contribution ranking for a drift-diff.
 *
 * Default sort order matches the selector's contribution magnitude (|Δ mass|
 * desc, name tie-break). Click the branch / Δ mass / Δ partners headers to
 * override. Hover publishes selectedBranch to DiffViewContext for cross-panel
 * linking with the delta matrix.
 */

import { useMemo, useState } from 'react';
import type { BranchDelta } from '../../data/selectors/dayReportDiff';
import { useDiffView } from '../../hooks/useDiffView';
import styles from './BranchDeltaRanking.module.css';

type SortKey = 'impact' | 'name' | 'deltaMass' | 'deltaPartners';

interface Props {
  branchDeltas: readonly BranchDelta[];
}

const COLUMNS: ReadonlyArray<{
  key: SortKey;
  label: string;
  numeric: boolean;
  defaultDir: 'asc' | 'desc';
  sortable: boolean;
}> = [
  { key: 'name', label: 'branch', numeric: false, defaultDir: 'asc', sortable: true },
  { key: 'impact', label: 'type', numeric: false, defaultDir: 'desc', sortable: false },
  { key: 'deltaMass', label: 'Δ mass', numeric: true, defaultDir: 'desc', sortable: true },
  { key: 'impact', label: 'mass from → to', numeric: true, defaultDir: 'desc', sortable: false },
  { key: 'deltaPartners', label: 'Δ partners', numeric: true, defaultDir: 'desc', sortable: true },
  {
    key: 'impact',
    label: 'partners from → to',
    numeric: true,
    defaultDir: 'desc',
    sortable: false,
  },
];

const numFmt = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});
const signedFmt = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

function signedNum(n: number): string {
  return signedFmt.format(n);
}
function num(n: number): string {
  return numFmt.format(n);
}

function deltaMassOf(d: BranchDelta): number {
  switch (d.kind) {
    case 'persisted':
      return d.deltaMass;
    case 'appeared':
      return d.toMass;
    case 'disappeared':
      return -d.fromMass;
  }
}

function deltaPartnersOf(d: BranchDelta): number {
  switch (d.kind) {
    case 'persisted':
      return d.deltaPartners;
    case 'appeared':
      return d.toPartners;
    case 'disappeared':
      return -d.fromPartners;
  }
}

function impactOf(d: BranchDelta): number {
  return Math.abs(deltaMassOf(d));
}

function compare(a: BranchDelta, b: BranchDelta, key: SortKey): number {
  if (key === 'name') return a.name.localeCompare(b.name, 'en-US');
  if (key === 'deltaMass') return deltaMassOf(a) - deltaMassOf(b);
  if (key === 'deltaPartners') return deltaPartnersOf(a) - deltaPartnersOf(b);
  // 'impact': by selector's contribution magnitude
  const diff = impactOf(a) - impactOf(b);
  if (diff !== 0) return diff;
  return a.name.localeCompare(b.name, 'en-US');
}

function chipClassFor(d: BranchDelta): string {
  if (d.kind === 'appeared') return styles.chipAppeared ?? '';
  if (d.kind === 'disappeared') return styles.chipDisappeared ?? '';
  if (d.deltaMass > 0) return styles.chipPersistedPos ?? '';
  if (d.deltaMass < 0) return styles.chipPersistedNeg ?? '';
  return styles.chipStable ?? '';
}

function chipLabel(d: BranchDelta): string {
  if (d.kind === 'appeared') return 'appeared';
  if (d.kind === 'disappeared') return 'disappeared';
  if (d.deltaMass > 0) return 'diverging';
  if (d.deltaMass < 0) return 'converging';
  return 'stable';
}

function massFromTo(d: BranchDelta): string {
  if (d.kind === 'appeared') return `— → ${num(d.toMass)}`;
  if (d.kind === 'disappeared') return `${num(d.fromMass)} → —`;
  return `${num(d.fromMass)} → ${num(d.toMass)}`;
}

function partnersFromTo(d: BranchDelta): string {
  if (d.kind === 'appeared') return `— → ${d.toPartners}`;
  if (d.kind === 'disappeared') return `${d.fromPartners} → —`;
  return `${d.fromPartners} → ${d.toPartners}`;
}

export default function BranchDeltaRanking({ branchDeltas }: Props) {
  const { selectedBranch, setSelectedBranch } = useDiffView();
  const [sortKey, setSortKey] = useState<SortKey>('impact');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo<BranchDelta[]>(() => {
    if (sortKey === 'impact' && sortDir === 'desc') return branchDeltas.slice();
    const copy = branchDeltas.slice();
    copy.sort((a, b) => {
      const c = compare(a, b, sortKey);
      return sortDir === 'asc' ? c : -c;
    });
    return copy;
  }, [branchDeltas, sortKey, sortDir]);

  const onHeaderClick = (col: (typeof COLUMNS)[number]) => () => {
    if (!col.sortable) return;
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
            {COLUMNS.map((col, i) => {
              const active = col.sortable && sortKey === col.key;
              const className = [
                col.numeric ? styles.numeric : undefined,
                !col.sortable ? styles.unsortable : undefined,
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <th
                  key={`${col.label}-${i}`}
                  className={className}
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
            const dm = deltaMassOf(row);
            const dp = deltaPartnersOf(row);
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
                </td>
                <td>
                  <span className={`${styles.chip} ${chipClassFor(row)}`}>{chipLabel(row)}</span>
                </td>
                <td className={styles.numeric}>
                  {dm === 0 ? <span className={styles.dim}>—</span> : signedNum(dm)}
                </td>
                <td className={`${styles.numeric} ${styles.dim}`}>{massFromTo(row)}</td>
                <td className={styles.numeric}>
                  {dp === 0 ? <span className={styles.dim}>—</span> : signedNum(dp)}
                </td>
                <td className={`${styles.numeric} ${styles.dim}`}>{partnersFromTo(row)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
