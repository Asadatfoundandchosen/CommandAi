import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShellRoute } from '@/components/layout/AppShellRoute';
import { LoadingSpinner } from '@/components/layout/LoadingSpinner';
import {
  AgentsPage,
  DashboardPage,
  LoginPage,
  PerformancePage,
  SettingsPage,
  SignalsPage,
} from '@/routes/lazy-pages';

export default function App() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage label="Loading application…" />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/dashboard"
          element={
            <AppShellRoute loadingLabel="Loading dashboard…">
              <DashboardPage />
            </AppShellRoute>
          }
        />
        <Route path="/usage" element={<Navigate to="/dashboard" replace />} />

        <Route
          path="/agents/*"
          element={
            <AppShellRoute loadingLabel="Loading agents…">
              <AgentsPage />
            </AppShellRoute>
          }
        />
        <Route
          path="/agent-registry"
          element={<Navigate to="/agents" replace />}
        />
        <Route path="/my-agents" element={<Navigate to="/agents" replace />} />

        <Route
          path="/signals/*"
          element={
            <AppShellRoute loadingLabel="Loading signals…">
              <SignalsPage />
            </AppShellRoute>
          }
        />
        <Route path="/action-queue" element={<Navigate to="/signals" replace />} />

        <Route
          path="/performance"
          element={
            <AppShellRoute loadingLabel="Loading performance…">
              <PerformancePage />
            </AppShellRoute>
          }
        />
        <Route path="/platform-health" element={<Navigate to="/performance" replace />} />

        <Route
          path="/settings/*"
          element={
            <AppShellRoute loadingLabel="Loading settings…">
              <SettingsPage />
            </AppShellRoute>
          }
        />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}
