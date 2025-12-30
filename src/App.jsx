import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { UserProvider } from './contexts/UserContext';
import router from './routes';

/**
 * App Component
 *
 * Root application component that sets up:
 * - Authentication context (AuthProvider)
 * - User data context (UserProvider)
 * - Routing (RouterProvider)
 *
 * Note: Migration handling has been moved to user-specific flow in Layout component.
 * The app no longer blocks on global migration checks.
 */
export default function App() {
  return (
    <AuthProvider>
      <UserProvider>
        <RouterProvider router={router} />
      </UserProvider>
    </AuthProvider>
  );
}
