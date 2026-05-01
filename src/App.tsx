import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Portfolio from './routes/Portfolio';
import Repo from './routes/Repo';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Portfolio />} />
        <Route path="/repo/:name" element={<Repo />} />
        <Route
          path="/repo/:name/:date"
          element={<div>Day view — coming in Phase 2.</div>}
        />
        <Route path="*" element={<div>Not found.</div>} />
      </Route>
    </Routes>
  );
}
