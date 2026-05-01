import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Portfolio from './routes/Portfolio';
import Repo from './routes/Repo';

const Day = lazy(() => import('./routes/Day'));

function DayLoading() {
  return <p style={{ color: 'var(--fg-muted)', fontStyle: 'italic' }}>Loading day view…</p>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Portfolio />} />
        <Route path="/repo/:name" element={<Repo />} />
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
