import { useEffect, useState } from "react";
import { Navigate } from 'react-router-dom';
import CircularProgress from '@mui/material/CircularProgress';
import { useLocation, useNavigate } from "react-router-dom";
import { fetchSession, logout } from './api';
import { Layout } from './components/Layout';
import Button from '@mui/material/Button';
import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './Dashboard';
import { UserManagement } from './UserManagement';
import { IssuesPage } from './pages/IssuesPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectPage } from './pages/ProjectPage';
import { LoginPage } from './pages/Login';



export function App() {
  const [sessionUser, setSessionUser] = useState<{ id: string; username: string } | null>(null);

  // Router helpers
  const navigate = useNavigate();
  const location = useLocation();

  // Session: fetch session on mount and on location change
  const [sessionChecked, setSessionChecked] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const s = await fetchSession();
        setSessionUser(s);
      } catch {
        setSessionUser(null);
      } finally {
        setSessionChecked(true);
      }
    })();
  }, [location.pathname]);

  // Project/issue fetching and selection is now handled inside page components.
  // This file only manages session + global routing.




  const actionsNode = (
    <>
      {sessionUser ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="small">{sessionUser.username}</div>
          <Button variant="outlined" onClick={async () => { try { await logout(); setSessionUser(null); navigate('/login'); } catch {} }}>Logout</Button>
        </div>
      ) : (
        <Button variant="outlined" onClick={() => navigate('/login')}>Login</Button>
      )}
    </>
  );

  if (!sessionChecked) {
    // Wait for session check to finish before deciding what to render.
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </div>
    );
  }

  // Dev convenience: if you're running the Vite dev server directly (e.g. port 5173/5174)
  // the session cookie from the API server (usually on port 4000) won't be sent on cross-origin
  // fetches. Detect this and show a helpful message instead of an endless login redirect loop.
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port && window.location.port !== '4000' && !import.meta.env.VITE_API_BASE) {
    const serverUrl = `${window.location.protocol}//${window.location.hostname}:4000`;
    return (
      <div style={{ padding: 24 }}>
        <div style={{ maxWidth: 720, margin: '40px auto' }}>
          <h2>Dev server running on a different origin</h2>
          <p>
            It looks like you're browsing the app at <strong>{window.location.host}</strong>.
            The session-based login requires the API server's cookies (usually served at <strong>{serverUrl}</strong>).
          </p>
          <p>
            To fix this, either:
            <ul>
              <li>Open the app through the API server: <a href={serverUrl}>{serverUrl}</a> (recommended for dev)</li>
              <li>Or set <code>VITE_API_BASE</code> to <code>{serverUrl}</code> in your web environment and restart the web dev server.</li>
            </ul>
          </p>
          <p>
            Once you've done that, reload and sign in normally.
          </p>
        </div>
      </div>
    );
  }

  if (!sessionUser) {
    // Not authenticated: render only the Login page (outside of Layout)
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout actions={actionsNode}>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="issues/*" element={<IssuesPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectKey" element={<ProjectPage />} />
        <Route path="projects/:projectKey/*" element={<IssuesPage />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="users" element={<UserManagement />} />
      </Routes>
    </Layout>
  );
}
