import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Portfolio from './routes/Portfolio';
import Repo from './routes/Repo';

const Day = lazy(() => import('./routes/Day'));
const Diff = lazy(() => import('./routes/Diff'));

function DayLoading() {
  return <p style={{ color: 'var(--fg-muted)', fontStyle: 'italic' }}>Loading day view…</p>;
}

function DiffLoading() {
  return <p style={{ color: 'var(--fg-muted)', fontStyle: 'italic' }}>Loading diff view…</p>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Portfolio />} />
        <Route path="/repo/:name" element={<Repo />} />
        {/* The diff route must match before :date so the literal "diff" segment
            cannot be interpreted as a date. */}
        <Route
          path="/repo/:name/diff/:from/:to"
          element={
            <Suspense fallback={<DiffLoading />}>
              <Diff />
            </Suspense>
          }
        />
        <Route
          path="/repo/:name/:date"
          element={
            <Suspense fallback={<DayLoading />}>
              <Day />
            </Suspense>
          }
        />
        <Route path="*" element={<div>Not found.</div>} />
      </Route>
    </Routes>
  );
}
