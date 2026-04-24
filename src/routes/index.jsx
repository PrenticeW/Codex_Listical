import { createBrowserRouter } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import PublicRoute from '../components/PublicRoute';
import LoginPage from '../pages/LoginPage';
import SignupPage from '../pages/SignupPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import AccountDeletedPage from '../pages/AccountDeletedPage';
import Layout from '../components/Layout';
import ProjectTimePlannerV2 from '../pages/ProjectTimePlannerV2';
import StagingPageV2 from '../pages/StagingPageV2';
import TacticsPage from '../pages/TacticsPage';
import AccountSettingsPage from '../pages/AccountSettingsPage';
import NotFoundPage from '../pages/NotFoundPage';

/**
 * Application Routes Configuration
 *
 * Defines all routes in the application with proper authentication guards.
 */
export const router = createBrowserRouter([
  // Public routes (only accessible when NOT authenticated)
  {
    path: '/login',
    element: (
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    ),
  },
  {
    path: '/signup',
    element: (
      <PublicRoute>
        <SignupPage />
      </PublicRoute>
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <PublicRoute>
        <ForgotPasswordPage />
      </PublicRoute>
    ),
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '/account-deleted',
    element: <AccountDeletedPage />,
  },

  // Protected routes (require authentication)
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <ProjectTimePlannerV2 />,
      },
      {
        path: 'staging',
        element: <StagingPageV2 />,
      },
      {
        path: 'tactics',
        element: <TacticsPage />,
      },
      {
        path: 'settings',
        element: <AccountSettingsPage />,
      },
    ],
  },

  // Catch-all 404. Keep at the end so it only matches when nothing above
  // does. Rendered outside the ProtectedRoute tree so an unauthenticated
  // visitor to /non-existent does not bounce through /login first.
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);

export default router;
