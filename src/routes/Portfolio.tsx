import { Link, useOutletContext } from 'react-router-dom';
import type { RepoIndex } from '../data/types';
import styles from './Portfolio.module.css';

export default function Portfolio() {
  const index = useOutletContext<RepoIndex | null>();

  if (!index) {
    return <p className={styles.empty}>Loading repositories…</p>;
  }

  return (
    <div>
      <h1 className={styles.heading}>Repositories</h1>
      <p className={styles.summary}>
        {index.repos.length} repositories analyzed. Pick one to see how its drift evolved.
      </p>
      <ul className={styles.list}>
        {index.repos.map((r) => (
          <li key={r.name}>
            <Link to={`/repo/${encodeURIComponent(r.name)}`} className={styles.card}>
              <div className={styles.name}>{r.name}</div>
              <div className={styles.meta}>
                <span>
                  {r.dateRange ? `${r.dateRange[0]} → ${r.dateRange[1]}` : 'no data'}
                </span>
                <span>{r.dayWithDriftCount} days</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
