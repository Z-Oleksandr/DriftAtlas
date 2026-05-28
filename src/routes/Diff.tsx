import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AttributionCard from '../components/charts/AttributionCard';
import BranchDeltaRanking from '../components/charts/BranchDeltaRanking';
import DeltaConflictMatrix from '../components/charts/DeltaConflictMatrix';
import { diffDayReports, type PairDelta } from '../data/selectors/dayReportDiff';
import { ALL_METRICS } from '../data/types';
import type { DriftMetric } from '../data/types';
import { useDayReportPair } from '../hooks/useDayReportPair';
import { useDiffView } from '../hooks/useDiffView';
import { useRepoIndex } from '../hooks/useRepoIndex';
import { DiffViewProvider } from '../state/DiffViewContext';
import styles from './Diff.module.css';

const METRIC_LABEL: Record<DriftMetric, string> = {
  line: 'line',
  conflict: 'conflict',
  file: 'file',
};

function MetricToggle() {
  const { metric, setMetric } = useDiffView();
  return (
    <div className={styles.metricGroup} role="tablist" aria-label="Drift metric">
      {ALL_METRICS.map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={m === metric}
          className={
            m === metric ? `${styles.metricBtn} ${styles.metricBtnActive}` : styles.metricBtn
          }
          onClick={() => setMetric(m)}
        >
          {METRIC_LABEL[m]} drift
        </button>
      ))}
    </div>
  );
}

interface PairNavProps {
  repo: string;
  from: string;
  to: string;
  available: readonly string[];
}

function PairPicker({ repo, from, to, available }: PairNavProps) {
  const navigate = useNavigate();
  // Each dropdown shows all analyzed days; the option matching the other side is
  // disabled to prevent a from===to pair (the route guards that anyway, but
  // disabling in the UI removes the dead choice). If the user picks a date that
  // would invert the ordering, swap so the URL always has from < to — the diff
  // math is signed and depends on `to - from` directionally.
  const go = (a: string, b: string) => {
    if (a === b) return;
    const [f, t] = a < b ? [a, b] : [b, a];
    navigate(`/repo/${encodeURIComponent(repo)}/diff/${f}/${t}`);
  };
  return (
    <div className={styles.pairPicker}>
      <label className={styles.pairPickerLabel}>from</label>
      <select
        className={styles.daySelect}
        value={from}
        onChange={(e) => go(e.target.value, to)}
        aria-label="From date"
      >
        {available.map((d) => (
          <option key={d} value={d} disabled={d === to}>
            {d}
          </option>
        ))}
      </select>
      <span className={styles.pairPickerArrow} aria-hidden>
        →
      </span>
      <label className={styles.pairPickerLabel}>to</label>
      <select
        className={styles.daySelect}
        value={to}
        onChange={(e) => go(from, e.target.value)}
        aria-label="To date"
      >
        {available.map((d) => (
          <option key={d} value={d} disabled={d === from}>
            {d}
          </option>
        ))}
      </select>
    </div>
  );
}

function PairNav({ repo, from, to, available }: PairNavProps) {
  const navigate = useNavigate();
  const iFrom = available.indexOf(from);
  const iTo = available.indexOf(to);
  const canShiftEarlier = iFrom > 0 && iTo > 0;
  const canShiftLater =
    iFrom >= 0 && iTo >= 0 && iFrom < available.length - 1 && iTo < available.length - 1;
  const shift = (delta: -1 | 1) => {
    const nf = available[iFrom + delta];
    const nt = available[iTo + delta];
    if (!nf || !nt) return;
    navigate(`/repo/${encodeURIComponent(repo)}/diff/${nf}/${nt}`);
  };
  return (
    <div className={styles.pairNav}>
      <button
        type="button"
        className={styles.dayNavBtn}
        disabled={!canShiftEarlier}
        onClick={() => shift(-1)}
        title="Shift window one analyzed day earlier"
      >
        ← earlier
      </button>
      <button
        type="button"
        className={styles.dayNavBtn}
        disabled={!canShiftLater}
        onClick={() => shift(1)}
        title="Shift window one analyzed day later"
      >
        later →
      </button>
    </div>
  );
}

interface DriftSummaryProps {
  driftFrom: number;
  driftTo: number;
  deltaDrift: number;
  deltaDriftPct: number | null;
  metric: DriftMetric;
}

const numFmt3 = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 3,
  minimumFractionDigits: 0,
});
const signedNumFmt3 = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 3,
  minimumFractionDigits: 0,
  signDisplay: 'exceptZero',
});
const signedPctFmt = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

function DriftSummary({ driftFrom, driftTo, deltaDrift, deltaDriftPct, metric }: DriftSummaryProps) {
  return (
    <div className={styles.driftStrip}>
      <span>
        {metric} drift from: <strong>{numFmt3.format(driftFrom)}</strong>
      </span>
      <span>
        → to: <strong>{numFmt3.format(driftTo)}</strong>
      </span>
      <span style={{ color: deltaDrift > 0 ? '#9a3412' : deltaDrift < 0 ? '#1e40af' : undefined }}>
        Δ: <strong>{signedNumFmt3.format(deltaDrift)}</strong>
        {deltaDriftPct !== null ? ` (${signedPctFmt.format(deltaDriftPct)})` : ''}
      </span>
    </div>
  );
}

interface TopPairListProps {
  pairs: readonly PairDelta[];
}

const pairSignedFmt = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

function pairKindLabel(p: PairDelta): string {
  if (p.kind === 'new') return 'new';
  if (p.kind === 'gone') return 'gone';
  if (p.kind === 'increased') return 'up';
  return 'down';
}

function TopPairList({ pairs }: TopPairListProps) {
  const { selectedBranch, setSelectedBranch } = useDiffView();
  if (pairs.length === 0) {
    return <p className={styles.empty}>No pair changes.</p>;
  }
  return (
    <table className={styles.pairTable}>
      <thead>
        <tr>
          <th>pair</th>
          <th>kind</th>
          <th className={styles.numeric}>Δ weight</th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((p) => {
          const key = `${p.a}|${p.b}`;
          const isSelected =
            selectedBranch !== null && (selectedBranch === p.a || selectedBranch === p.b);
          return (
            <tr
              key={key}
              className={isSelected ? styles.pairRowSelected : undefined}
              onMouseEnter={() => setSelectedBranch(p.a)}
              onMouseLeave={() => setSelectedBranch(null)}
            >
              <td className={styles.branchName} title={`${p.a} ↔ ${p.b}`}>
                {p.a} ↔ {p.b}
              </td>
              <td>{pairKindLabel(p)}</td>
              <td className={styles.numeric}>{pairSignedFmt.format(p.deltaWeight)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DiffInner() {
  const { name, from, to } = useParams<{ name: string; from: string; to: string }>();
  const { metric } = useDiffView();
  const indexResult = useRepoIndex();
  const pairResult = useDayReportPair(name, from, to);

  const availableDays = useMemo<readonly string[]>(() => {
    if (indexResult.status !== 'success') return [];
    const repo = indexResult.data.repos.find((r) => r.name === name);
    return repo?.analyzedDays ?? [];
  }, [indexResult, name]);

  // Compute the diff unconditionally to keep hook order stable, even when
  // pairResult isn't success yet. Guarded by an early branch below the hooks.
  const diff = useMemo(() => {
    if (pairResult.status !== 'success') return null;
    return diffDayReports(pairResult.data.from, pairResult.data.to, metric);
  }, [pairResult, metric]);

  if (!name || !from || !to) {
    return (
      <div className={styles.error}>
        Missing repository or dates. <Link to="/">Back to portfolio</Link>.
      </div>
    );
  }

  if (from === to) {
    return (
      <div className={styles.error}>
        Cannot diff a day against itself.{' '}
        <Link to={`/repo/${encodeURIComponent(name)}/${to}`}>Open {to}</Link>.
      </div>
    );
  }

  if (
    indexResult.status === 'success' &&
    availableDays.length > 0 &&
    (!availableDays.includes(from) || !availableDays.includes(to))
  ) {
    return (
      <div className={styles.error}>
        One of these days is not analyzed for {name}.{' '}
        <Link to={`/repo/${encodeURIComponent(name)}`}>Back to repo</Link>.
      </div>
    );
  }

  if (pairResult.status === 'loading') {
    return (
      <p className={styles.loading}>
        Loading {name} · {from} → {to}…
      </p>
    );
  }
  if (pairResult.status === 'error') {
    return (
      <div className={styles.error}>
        Could not load this pair: {pairResult.message}.{' '}
        <Link to={`/repo/${encodeURIComponent(name)}`}>Back to repo</Link>.
      </div>
    );
  }
  if (!diff) {
    return <p className={styles.loading}>Computing diff…</p>;
  }

  return (
    <div>
      <h1 className={styles.heading}>
        {pairResult.data.from.repo}{' '}
        <span style={{ color: 'var(--fg-muted)', fontWeight: 400 }}>
          · diff · {from} → {to}
        </span>
      </h1>
      <p className={styles.summary}>
        {pairResult.data.from.branchCounts.final} → {pairResult.data.to.branchCounts.final}{' '}
        branches · {diff.unionBranches.length} in union · {diff.branchDeltas.length} ranked ·{' '}
        {diff.pairDeltas.length} pair changes
      </p>

      <div className={styles.toolbar}>
        <MetricToggle />
        {availableDays.length >= 2 && (
          <PairPicker repo={name} from={from} to={to} available={availableDays} />
        )}
        <PairNav repo={name} from={from} to={to} available={availableDays} />
        <Link to={`/repo/${encodeURIComponent(name)}/${to}`} className={styles.crumbLink}>
          open day view ({to}) →
        </Link>
      </div>

      <div className={styles.section} style={{ marginBottom: '1.25rem' }}>
        <DriftSummary
          driftFrom={diff.driftFrom}
          driftTo={diff.driftTo}
          deltaDrift={diff.deltaDrift}
          deltaDriftPct={diff.deltaDriftPct}
          metric={metric}
        />
      </div>

      <AttributionCard
        headline={diff.attribution.headline}
        bullets={diff.attribution.bullets}
      />

      <div className={styles.layout}>
        <div className={styles.column}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Delta conflict matrix</div>
            <DeltaConflictMatrix
              unionBranches={diff.unionBranches}
              pairDeltas={diff.pairDeltas}
            />
          </div>
        </div>
        <div className={styles.column}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Branch contributions</div>
            <BranchDeltaRanking branchDeltas={diff.branchDeltas} />
          </div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Top pair changes</div>
            <TopPairList pairs={diff.topPairs} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffWithKey() {
  const { from, to } = useParams<{ from: string; to: string }>();
  return (
    <DiffViewProvider key={`${from ?? ''}|${to ?? ''}`}>
      <DiffInner />
    </DiffViewProvider>
  );
}

export default function Diff() {
  return <DiffWithKey />;
}
