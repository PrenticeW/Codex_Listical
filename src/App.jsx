import { useCallback, useEffect, useState } from "react";
import ProjectTimePlannerWireframe from "./pages/ProjectTimePlannerWireframe";
import ProjectTimePlannerV2 from "./pages/ProjectTimePlannerV2";
import StagingPage from "./pages/StagingPage";
import TacticsPage from "./pages/TacticsPage";

const isBrowser = () => typeof window !== "undefined";

export default function App() {
  const [currentPath, setCurrentPath] = useState(() =>
    isBrowser() ? window.location.pathname : "/"
  );

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

  if (currentPath === "/staging") {
    return (
      <StagingPage
        currentPath={currentPath}
        onNavigate={navigate}
      />
    );
  }

  if (currentPath === "/tactics") {
    return (
      <TacticsPage
        currentPath={currentPath}
        onNavigate={navigate}
      />
    );
  }

  // Default to v2 (new implementation)
  // To see old implementation, go to /v1
  if (currentPath === "/v1") {
    return (
      <div className="p-4">
        <ProjectTimePlannerWireframe
          currentPath={currentPath}
          onNavigate={navigate}
        />
      </div>
    );
  }

  return <ProjectTimePlannerV2 currentPath={currentPath} onNavigate={navigate} />;
}
