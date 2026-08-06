import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { authAPI } from './api/api';
import useAuthStore from './store/authStore';
import ProtectedRoute from './components/ProtectedRoute';
import RootRedirect from './pages/RootRedirect';
import MarketingAuthRedirect from './pages/MarketingAuthRedirect';
import Projects from './pages/Projects';
import Inventory from './pages/Inventory';
import EndpointDetail from './pages/EndpointDetail';
import ProjectSettings from './pages/ProjectSettings';
import Account from './pages/Account';

export default function App() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    authAPI
      .me()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [setUser, setLoading]);

  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<MarketingAuthRedirect path="/login" />} />
      <Route path="/register" element={<MarketingAuthRedirect path="/register" />} />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <Projects />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:projectId"
        element={
          <ProtectedRoute>
            <Inventory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:projectId/settings"
        element={
          <ProtectedRoute>
            <ProjectSettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:projectId/endpoints/:endpointId"
        element={
          <ProtectedRoute>
            <EndpointDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <Account />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
