import { Outlet } from 'react-router-dom';
import { YearProvider } from '../contexts/YearContext';
import { useUser } from '../contexts/UserContext';
import { useEffect, useState } from 'react';

/**
 * Layout Component
 *
 * Wraps all protected routes and provides:
 * - YearContext for year-based data management
 * - User-specific migration handling
 * - Common layout structure
 */
export default function Layout() {
  const { needsUserMigration } = useUser();
  const [isMigrationChecked, setIsMigrationChecked] = useState(false);

  useEffect(() => {
    // TODO: Implement user-specific migration check
    // For now, just mark as checked immediately
    // In production, this will check if the user needs data migration
    // and run it in the background if needed

    const checkMigration = async () => {
      try {
        const needsMigration = needsUserMigration();

        if (needsMigration) {
          // TODO: Run user-specific migration in background
          console.log('[Layout] User needs migration - will implement background migration');
        }
      } catch (error) {
        console.error('[Layout] Migration check failed:', error);
      } finally {
        setIsMigrationChecked(true);
      }
    };

    checkMigration();
  }, [needsUserMigration]);

  // Show loading state while checking migration
  // Note: For now this will be instant, but when migration is implemented
  // this provides a UI for the background process
  if (!isMigrationChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Setting up your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <YearProvider>
      <Outlet />
    </YearProvider>
  );
}
