import { Fragment } from 'react';
import { Link, Outlet, useMatch } from 'react-router-dom';
import { useRepoIndex } from '../hooks/useRepoIndex';
import styles from './Layout.module.css';

interface Crumb {
  label: string;
  to?: string;
}

function buildCrumbs(name: string | undefined, date: string | undefined): Crumb[] {
  const onPortfolio = !name && !date;
  const onRepo = !!name && !date;

  const crumbs: Crumb[] = [];
  crumbs.push(onPortfolio ? { label: 'Portfolio' } : { label: 'Portfolio', to: '/' });
  if (name) {
    crumbs.push(
      onRepo ? { label: name } : { label: name, to: `/repo/${encodeURIComponent(name)}` },
    );
  }
  if (date) {
    crumbs.push({ label: date });
  }
  return crumbs;
}

interface CrumbItemProps {
  to?: string;
  label: string;
}

function CrumbItem({ to, label }: CrumbItemProps) {
  if (!to) {
    return (
      <span className={styles.crumbCurrent} aria-current="page">
        {label}
      </span>
    );
  }
  return (
    <Link to={to} className={styles.crumbLink}>
      {label}
    </Link>
  );
}

function Breadcrumb() {
  // useParams() only reads the current RouteContext's own match. Because
  // Breadcrumb lives inside a path-less layout route, that match has no
  // params — descendant params (`:name`, `:date`) never reach this scope.
  // Match against the known patterns directly so we always see the live URL.
  const dayMatch = useMatch('/repo/:name/:date');
  const repoMatch = useMatch('/repo/:name');
  const name = dayMatch?.params.name ?? repoMatch?.params.name;
  const date = dayMatch?.params.date;
  const crumbs = buildCrumbs(name, date);

  return (
    <nav className={styles.crumbs} aria-label="breadcrumb">
      {crumbs.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className={styles['crumb-sep']} aria-hidden>
              /
            </span>
          )}
          {c.to ? <CrumbItem to={c.to} label={c.label} /> : <CrumbItem label={c.label} />}
        </Fragment>
      ))}
    </nav>
  );
}

export default function Layout() {
  const indexResult = useRepoIndex();
  const generatedAt = indexResult.status === 'success' ? indexResult.data.generatedAt : undefined;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Link to="/">Driftatlas</Link>
        </div>
        <Breadcrumb />
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        {generatedAt ? `data generated ${generatedAt}` : ' '}
      </footer>
    </div>
  );
}
