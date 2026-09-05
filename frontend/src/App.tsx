import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './i18n/config';
import './styles/globals.css';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import GeometryLibrary from './pages/GeometryLibrary';
import GeometryUpload from './pages/GeometryUpload';
import SimulationNew from './pages/SimulationNew';
import SimulationResults from './pages/SimulationResults';
// Reads the token straight from localStorage on every render instead of caching
// it in state: this is a plain client-side SPA (no SSR hydration to protect
// against), and React reuses this same AuthGuard instance across the
// "/login" <-> "/*" route swap (same component type at the same tree
// position), so a state+effect-with-empty-deps version never re-checks after
// the initial mount and gets stuck on the pre-login "not authed" value —
// bouncing straight back to /login right after a successful login.
function AuthGuard({ children }) {
  const location = useLocation();
  const authed = !!localStorage.getItem('mmx_token');
  if (!authed && location.pathname !== '/login') return <Navigate to="/login" replace />;
  if (authed && location.pathname === '/login') return <Navigate to="/" replace />;
  return children;
}
export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<AuthGuard><Login /></AuthGuard>} />
        <Route path="/*" element={<AuthGuard><AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/geometry/upload" element={<GeometryUpload />} />
            <Route path="/library" element={<GeometryLibrary />} />
            <Route path="/simulation/new" element={<SimulationNew />} />
            <Route path="/simulation/:id" element={<SimulationResults />} />
            <Route path="/projects" element={<Dashboard />} />
            <Route path="/simulations" element={<Dashboard />} />
            <Route path="/settings" element={<Dashboard />} />
          </Routes>
        </AppLayout></AuthGuard>} />
      </Routes>
    </BrowserRouter>
  );
}
