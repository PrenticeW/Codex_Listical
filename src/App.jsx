import { useCallback, useEffect, useState } from "react";
import ProjectTimePlannerWireframe from "./pages/ProjectTimePlannerWireframe";
import ProjectTimePlannerV2 from "./pages/ProjectTimePlannerV2";
import StagingPage from "./pages/StagingPage";
import TacticsPage from "./pages/TacticsPage";
import { YearProvider } from "./contexts/YearContext";
import { needsMigration, migrateToYearSystem } from "./utils/yearMigration";

const isBrowser = () => typeof window !== "undefined";

export default function App() {
  const [currentPath, setCurrentPath] = useState(() =>
    isBrowser() ? window.location.pathname : "/"
  );
  const [isMigrated, setIsMigrated] = useState(false);

  // Run migration on first load
  useEffect(() => {
    if (!isBrowser()) return;

    if (needsMigration()) {
      console.log('[App] Running year system migration...');
      const result = migrateToYearSystem();
      if (result.success) {
        console.log('[App] Migration successful:', result.migratedData);
      } else {
        console.error('[App] Migration failed:', result.error);
      }
    }
    setIsMigrated(true);
  }, []);

  useEffect(() => {
    if (!isBrowser()) return undefined;

    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((nextPath) => {
    if (!isBrowser()) {
      setCurrentPath(nextPath);
      return;
    }

    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setCurrentPath(nextPath);
  }, []);

  // Wait for migration to complete before rendering
  if (!isMigrated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <YearProvider>
      {currentPath === "/staging" && (
        <StagingPage
          currentPath={currentPath}
          onNavigate={navigate}
        />
      )}

      {currentPath === "/tactics" && (
        <TacticsPage
          currentPath={currentPath}
          onNavigate={navigate}
        />
      )}

      {currentPath === "/v1" && (
        <div className="p-4">
          <ProjectTimePlannerWireframe
            currentPath={currentPath}
            onNavigate={navigate}
          />
        </div>
      )}

      {currentPath !== "/staging" && currentPath !== "/tactics" && currentPath !== "/v1" && (
        <ProjectTimePlannerV2 currentPath={currentPath} onNavigate={navigate} />
      )}
    </YearProvider>
  );
}
