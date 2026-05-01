import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import DriftTimeSeries from '../components/charts/DriftTimeSeries';
import { fetchRepoTimeSeries } from '../data/client';
import type { RepoTimeSeries } from '../data/types';
import styles from './Repo.module.css';

export default function Repo() {
  const { name } = useParams<{ name: string }>();
  const [series, setSeries] = useState<RepoTimeSeries | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    setSeries(null);
    setError(null);
    fetchRepoTimeSeries(name)
      .then(setSeries)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [name]);

  if (error) {
    return (
      <div className={styles.error}>
        Failed to load repo data: {error}. Did you run <code>npm run preprocess</code>?
      </div>
    );
  }

  if (!series) {
    return <p className={styles.loading}>Loading {name}…</p>;
  }

  const withDrift = series.days.filter((d) => d.lineDrift !== null);
  const first = withDrift[0]?.date;
  const last = withDrift[withDrift.length - 1]?.date;

  return (
    <div>
      <h1 className={styles.heading}>{series.repo}</h1>
      <p className={styles.summary}>
        {withDrift.length} analyzed days
        {first && last ? ` · ${first} → ${last}` : ''}
      </p>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Drift over time</div>
        <DriftTimeSeries series={series} />
      </div>
    </div>
  );
}
