import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { CardModal } from './components/card/CardModal';
import { RequireAuth } from './components/RequireAuth';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './lib/toast';
import { AuthPage } from './pages/AuthPage';
import { BoardPage } from './pages/BoardPage';
import { BoardsPage } from './pages/BoardsPage';
import { SettingsPage } from './pages/SettingsPage';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2_000,
      // Don't retry client errors (401/403/404...).
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
  },
});

const router = createBrowserRouter([
  { path: '/login', element: <AuthPage mode="login" /> },
  { path: '/register', element: <AuthPage mode="register" /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/boards" replace /> },
      { path: '/boards', element: <BoardsPage /> },
      {
        path: '/boards/:boardId',
        element: <BoardPage />,
        children: [{ path: 'cards/:cardId', element: <CardModal /> }],
      },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/boards" replace /> },
]);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
