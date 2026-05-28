import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BranchRanking from '../components/charts/BranchRanking';
import ConflictMatrix from '../components/charts/ConflictMatrix';
import ForceGraph from '../components/three/ForceGraph';
import PanelModeToggle from '../components/three/PanelModeToggle';
import PointCloud3D from '../components/three/PointCloud3D';
import { ALL_METRICS } from '../data/types';
import type { DriftMetric } from '../data/types';
import { useDayReport } from '../hooks/useDayReport';
import { useRepoIndex } from '../hooks/useRepoIndex';
import { useDayView } from '../hooks/useDayView';
import { DayViewProvider } from '../state/DayViewContext';
import styles from './Day.module.css';

const METRIC_LABEL: Record<DriftMetric, string> = {
  line: 'line',
  conflict: 'conflict',
  file: 'file',
};

function MetricToggle() {
  const { metric, setMetric } = useDayView();
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

interface DayNavProps {
  repo: string;
  date: string;
  available: readonly string[];
}

function DayNav({ repo, date, available }: DayNavProps) {
  const navigate = useNavigate();
  const idx = available.indexOf(date);
  const prev = idx > 0 ? available[idx - 1] : undefined;
  const next = idx >= 0 && idx < available.length - 1 ? available[idx + 1] : undefined;

  return (
    <div className={styles.dayNav}>
      <button
        type="button"
        className={styles.dayNavBtn}
        disabled={!prev}
        onClick={() => prev && navigate(`/repo/${encodeURIComponent(repo)}/${prev}`)}
      >
        ←
      </button>
      <span>{date}</span>
      <button
        type="button"
        className={styles.dayNavBtn}
        disabled={!next}
        onClick={() => next && navigate(`/repo/${encodeURIComponent(repo)}/${next}`)}
      >
        →
      </button>
      {idx >= 0 && (
        <span>
          ({idx + 1} of {available.length})
        </span>
      )}
    </div>
  );
}

function DayInner() {
  const { name, date } = useParams<{ name: string; date: string }>();
  const { metric, panelMode } = useDayView();
  const indexResult = useRepoIndex();
  const dayResult = useDayReport(name, date);

  const availableDays = useMemo<readonly string[]>(() => {
    if (indexResult.status !== 'success') return [];
    const repo = indexResult.data.repos.find((r) => r.name === name);
    return repo?.analyzedDays ?? [];
  }, [indexResult, name]);

  if (dayResult.status === 'loading') {
    return (
      <p className={styles.loading}>
        Loading {name} on {date}…
      </p>
    );
  }
  if (dayResult.status === 'error') {
    return (
      <div className={styles.error}>
        Could not load this day.{' '}
        <Link to={`/repo/${encodeURIComponent(name ?? '')}`}>Back to repo</Link>.
      </div>
    );
  }

  const day = dayResult.data;
  const drift = day.drift[metric];

  return (
    <div>
      <h1 className={styles.heading}>
        {day.repo} <span style={{ color: 'var(--fg-muted)', fontWeight: 400 }}>· {day.date}</span>
      </h1>
      <p className={styles.summary}>
        {day.branchCounts.final} branches analyzed
        {' · '}
        {day.branchCounts.total} total in repository
      </p>

      <div className={styles.toolbar}>
        <MetricToggle />
        <PanelModeToggle />
        {name && <DayNav repo={name} date={day.date} available={availableDays} />}
      </div>

      <div className={styles.section} style={{ marginBottom: '1.25rem' }}>
        <div className={styles.driftStrip}>
          <span>
            line drift: <strong>{day.drift.line.toFixed(2)}</strong>
          </span>
          <span>
            conflict drift: <strong>{day.drift.conflict.toFixed(3)}</strong>
          </span>
          <span>
            file drift: <strong>{day.drift.file.toFixed(3)}</strong>
          </span>
          <span style={{ color: 'var(--accent)' }}>
            current ({metric}): <strong>{drift.toFixed(3)}</strong>
          </span>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.column}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              {panelMode === 'mds'
                ? '3D MDS scatter'
                : panelMode === 'fdg3d'
                  ? 'Force graph (3D)'
                  : 'Force graph (2D)'}
            </div>
            {panelMode === 'mds' ? (
              <PointCloud3D report={day} />
            ) : (
              <ForceGraph report={day} dims={panelMode === 'fdg3d' ? 3 : 2} />
            )}
          </div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Branch ranking</div>
            <BranchRanking report={day} />
          </div>
        </div>
        <div className={styles.column}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Conflict matrix</div>
            <ConflictMatrix report={day} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DayWithKey() {
  // Remount the provider when the date changes so transient state (selection,
  // FDG pins) resets per the locked P3 decision "drag-pin resets on day change".
  const { date } = useParams<{ date: string }>();
  return (
    <DayViewProvider key={date ?? ''}>
      <DayInner />
    </DayViewProvider>
  );
}

export default function Day() {
  return <DayWithKey />;
}
