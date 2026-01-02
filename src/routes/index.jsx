import { createBrowserRouter } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import PublicRoute from '../components/PublicRoute';
import LoginPage from '../pages/LoginPage';
import SignupPage from '../pages/SignupPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import Layout from '../components/Layout';
import ProjectTimePlannerV2 from '../pages/ProjectTimePlannerV2';
import ProjectTimePlannerWireframe from '../pages/ProjectTimePlannerWireframe';
import StagingPageV2 from '../pages/StagingPageV2';
import TacticsPage from '../pages/TacticsPage';

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
        path: 'v1',
        element: (
          <div className="p-4">
            <ProjectTimePlannerWireframe />
          </div>
        ),
      },
    ],
  },
]);

export default router;
