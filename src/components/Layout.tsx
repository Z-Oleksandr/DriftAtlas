import { Fragment, useEffect, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { fetchIndex } from '../data/client';
import type { RepoIndex } from '../data/types';
import styles from './Layout.module.css';

function Breadcrumb() {
  const { name, date } = useParams();
  const crumbs: Array<{ label: string; to?: string }> = [{ label: 'Portfolio', to: '/' }];
  if (name) crumbs.push({ label: name, to: date ? `/repo/${name}` : undefined });
  if (date) crumbs.push({ label: date });

  return (
    <nav className={styles.crumbs} aria-label="breadcrumb">
      {crumbs.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={styles['crumb-sep']}>/</span>}
          {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
        </Fragment>
      ))}
    </nav>
  );
}

export default function Layout() {
  const [index, setIndex] = useState<RepoIndex | null>(null);

  useEffect(() => {
    fetchIndex()
      .then(setIndex)
      .catch(() => setIndex(null));
  }, []);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Link to="/">Driftatlas</Link>
        </div>
        <Breadcrumb />
      </header>
      <main className={styles.main}>
        <Outlet context={index} />
      </main>
      <footer className={styles.footer}>
        {index ? `data generated ${index.generatedAt}` : ' '}
      </footer>
    </div>
  );
}
