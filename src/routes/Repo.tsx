import { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DriftTimeSeries from '../components/charts/DriftTimeSeries';
import { useRepoIndex } from '../hooks/useRepoIndex';
import { useRepoTimeseries } from '../hooks/useRepoTimeseries';
import styles from './Repo.module.css';

export default function Repo() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const tsResult = useRepoTimeseries(name);
  const indexResult = useRepoIndex();

  const analyzedDays = useMemo<ReadonlySet<string>>(() => {
    if (indexResult.status !== 'success') return new Set();
    const repo = indexResult.data.repos.find((r) => r.name === name);
    return new Set(repo?.analyzedDays ?? []);
  }, [indexResult, name]);

  const isDayAnalyzed = useCallback((date: string) => analyzedDays.has(date), [analyzedDays]);

  const onDayClick = useCallback(
    (date: string) => {
      if (!name) return;
      navigate(`/repo/${encodeURIComponent(name)}/${date}`);
    },
    [name, navigate],
  );

  if (tsResult.status === 'error') {
    return (
      <div className={styles.error}>
        Could not load this repository. Did you run <code>npm run preprocess</code>?
      </div>
    );
  }

  if (tsResult.status === 'loading') {
    return <p className={styles.loading}>Loading {name}…</p>;
  }

  const series = tsResult.data;
  const withDrift = series.days.filter((d) => d.lineDrift !== null);
  const first = withDrift[0]?.date;
  const last = withDrift[withDrift.length - 1]?.date;

  return (
    <div>
      <h1 className={styles.heading}>{series.repo}</h1>
      <p className={styles.summary}>
        {withDrift.length} analyzed days
        {first && last ? ` · ${first} → ${last}` : ''}
        {series.releases.length > 0 ? ` · ${series.releases.length} releases` : ''}
      </p>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Drift over time</div>
        <DriftTimeSeries series={series} onDayClick={onDayClick} isDayAnalyzed={isDayAnalyzed} />
      </div>
    </div>
  );
}
