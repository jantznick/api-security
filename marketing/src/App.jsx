import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AuthModal from './components/AuthModal';
import Layout from './components/Layout';
import { AuthModalProvider } from './context/AuthModalContext';
import AuthDeepLink from './pages/AuthDeepLink';
import GetStarted from './pages/GetStarted';
import Home from './pages/Home';
import HowItWorks from './pages/HowItWorks';
import NotFound from './pages/NotFound';
import Privacy from './pages/Privacy';
import Pricing from './pages/Pricing';
import Terms from './pages/Terms';

function AppRoutes() {
  return (
    <>
      <AuthModal />
      <Routes>
        <Route path="/login" element={<AuthDeepLink mode="login" />} />
        <Route path="/register" element={<AuthDeepLink mode="register" />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="get-started" element={<GetStarted />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="docs" element={<Navigate to="/get-started" replace />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthModalProvider>
        <AppRoutes />
      </AuthModalProvider>
    </BrowserRouter>
  );
}
