import { Outlet } from 'react-router-dom';
import { YearProvider, useYear } from '../contexts/YearContext';
import { useUser } from '../contexts/UserContext';
import { useEffect, useState } from 'react';
import { GearPanelProvider } from '../contexts/GearPanelContext';
import { PagePanelProvider } from '../contexts/PagePanelContext';
import { SystemPanelProvider } from '../contexts/SystemPanelContext';
import { PlanPanelProvider } from '../contexts/PlanPanelContext';
import { GoalPanelProvider } from '../contexts/GoalPanelContext';
import { TaskRowPanelProvider } from '../contexts/TaskRowPanelContext';
import GearPanel from './GearPanel';
import SystemPanel from './SystemPanel';
import PlanPanel from './PlanPanel';
import GoalPanel from './GoalPanel';

function YearKeyedOutlet() {
  const { currentYear } = useYear();
  return <Outlet key={currentYear} />;
}

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
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ animation:'spin 1s linear infinite', margin:'0 auto 16px' }}>
            <circle cx="12" cy="12" r="10" stroke="rgba(43,89,182,0.15)" strokeWidth="2.5"/>
            <path d="M22 12a10 10 0 0 0-10-10" stroke="var(--brand-deep)" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <p className="text-gray-600">Setting up your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <GearPanelProvider>
      {/* Single shared open state for the three page panels — the panel
          stays open across page navigation; each panel route-gates itself */}
      <PagePanelProvider>
      <SystemPanelProvider>
        <PlanPanelProvider>
          <GoalPanelProvider>
            <TaskRowPanelProvider>
              <YearProvider>
                <YearKeyedOutlet />
                <GearPanel />
                <SystemPanel />
                <PlanPanel />
                <GoalPanel />
              </YearProvider>
            </TaskRowPanelProvider>
          </GoalPanelProvider>
        </PlanPanelProvider>
      </SystemPanelProvider>
      </PagePanelProvider>
    </GearPanelProvider>
  );
}
