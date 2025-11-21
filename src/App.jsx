import { useCallback, useEffect, useState } from "react";
import ProjectTimePlannerWireframe from "./ProjectTimePlannerWireframe";
import StagingPage from "./StagingPage";

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
    return <StagingPage onNavigateHome={() => navigate("/")} />;
  }

  return (
    <div className="p-4">
      <ProjectTimePlannerWireframe onNavigateToStaging={() => navigate("/staging")} />
    </div>
  );
}
