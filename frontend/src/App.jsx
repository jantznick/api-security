import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { authAPI } from './api/api';
import useAuthStore from './store/authStore';
import AuthModal from './components/AuthModal';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthModalProvider } from './context/AuthModalContext';
import { ConfirmProvider } from './context/ConfirmContext';
import AuthDeepLink from './pages/AuthDeepLink';
import RootRedirect from './pages/RootRedirect';
import Projects from './pages/Projects';
import Inventory from './pages/Inventory';
import EndpointDetail from './pages/EndpointDetail';
import ProjectSettings from './pages/ProjectSettings';
import ProjectTopology from './pages/ProjectTopology';
import LegacyProjectRedirect from './pages/LegacyProjectRedirect';
import Account from './pages/Account';
import Billing from './pages/Billing';
import Usage from './pages/Usage';
import Admin from './pages/Admin';
import OrgMembers from './pages/OrgMembers';
import OrgSettings from './pages/OrgSettings';
import AcceptInvite from './pages/AcceptInvite';
import NotFound from './pages/NotFound';
import ProjectManage from './pages/ProjectManage';

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
    <AuthModalProvider>
      <ConfirmProvider>
        <AuthModal />
        <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<AuthDeepLink mode="login" />} />
        <Route path="/register" element={<AuthDeepLink mode="register" />} />
        <Route
          path="/projects"
          element={
            <ProtectedRoute>
              <Projects />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:projectId/topology"
          element={
            <ProtectedRoute>
              <ProjectTopology />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:projectId/services/:serviceId"
          element={
            <ProtectedRoute>
              <Inventory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:projectId/services/:serviceId/settings"
          element={
            <ProtectedRoute>
              <ProjectSettings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:projectId/services/:serviceId/endpoints/:endpointId"
          element={
            <ProtectedRoute>
              <EndpointDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:projectId"
          element={
            <ProtectedRoute>
              <LegacyProjectRedirect />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:projectId/settings"
          element={
            <ProtectedRoute>
              <ProjectManage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:projectId/endpoints/:endpointId"
          element={
            <ProtectedRoute>
              <LegacyProjectRedirect />
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
        <Route
          path="/orgs/:orgId/members"
          element={
            <ProtectedRoute>
              <OrgMembers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orgs/:orgId/settings"
          element={
            <ProtectedRoute>
              <OrgSettings />
            </ProtectedRoute>
          }
        />
        <Route path="/invites/:token" element={<AcceptInvite />} />
        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <Billing />
            </ProtectedRoute>
          }
        />
        <Route
          path="/usage"
          element={
            <ProtectedRoute>
              <Usage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </ConfirmProvider>
    </AuthModalProvider>
  );
}
