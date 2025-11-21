import React, { useEffect, useState } from "react";

const STORAGE_KEY = "stagingPageSettings";
const defaultSettings = Object.freeze({
  projects: [],
  savedProjects: [],
});
const ROW_COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#a855f7",
  "#f97316",
  "#e11d48",
  "#14b8a6",
  "#6366f1",
  "#f59e0b",
];

const loadSettings = () => {
  if (typeof window === "undefined") return { ...defaultSettings };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw);
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      savedProjects: Array.isArray(parsed.savedProjects) ? parsed.savedProjects : [],
    };
  } catch (error) {
    console.error("Failed to read staging settings", error);
  }
  return { ...defaultSettings };
};

const saveSettings = (settings) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save staging settings", error);
  }
};

export default function StagingPage({ onNavigateHome }) {
  const [settings, setSettings] = useState(() => loadSettings());

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const handleAddProject = () => {
    const newId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : String(Date.now());

    setSettings((prev) => ({
      ...prev,
      projects: [
        ...prev.projects,
        {
          id: newId,
          name: "",
          nickname: "",
          weeklyQuota: "",
        },
      ],
    }));
  };

  const handleProjectFieldChange = (projectId, field) => (event) => {
    const value = event.target.value;
    setSettings((prev) => ({
      ...prev,
      projects: prev.projects.map((project) =>
        project.id === projectId ? { ...project, [field]: value } : project
      ),
    }));
  };

  const handleSaveProject = (projectId) => {
    setSettings((prev) => {
      const project = prev.projects.find((p) => p.id === projectId);
      if (!project) return prev;

      const uppercaseNickname = (project.nickname ?? "").toUpperCase();
      const updatedProjects = prev.projects.map((p) =>
        p.id === projectId ? { ...p, nickname: uppercaseNickname } : p
      );

      const existingIndex = prev.savedProjects.findIndex((p) => p.projectId === projectId);
      const existingColor =
        existingIndex >= 0 ? prev.savedProjects[existingIndex].color : null;
      const color =
        existingColor ??
        ROW_COLORS[prev.savedProjects.length % ROW_COLORS.length] ??
        "#0f172a";

      const savedEntry = {
        projectId,
        name: project.name || "Untitled",
        weeklyQuota: project.weeklyQuota || "-",
        nickname: uppercaseNickname,
        color,
      };

      const savedProjects =
        existingIndex >= 0
          ? prev.savedProjects.map((p, idx) => (idx === existingIndex ? savedEntry : p))
          : [...prev.savedProjects, savedEntry];

      return {
        ...prev,
        projects: updatedProjects,
        savedProjects,
      };
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 text-slate-800 flex flex-col items-center justify-center gap-10 p-6">
      <div className="text-center space-y-4 max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight">Staging</h1>
        <p className="text-lg leading-relaxed">
          Use this space to experiment and record notes that need to persist across reloads and
          updates. Changes are saved locally as you type.
        </p>
      </div>

      <div className="w-full max-w-4xl space-y-4 bg-white rounded-lg border border-[#ced3d0] p-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-xl font-semibold text-slate-800">Projects</h2>
          <button
            type="button"
            onClick={handleAddProject}
            className="inline-flex items-center gap-2 rounded border border-[#ced3d0] px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            Add Project
          </button>
        </div>

        {settings.projects.length === 0 ? (
          <p className="text-sm text-slate-600">No projects yet. Add your first one to get started.</p>
        ) : (
          <div className="grid gap-4">
            {settings.projects.map((project) => (
              <div
                key={project.id}
                className="rounded border border-[#ced3d0] p-4 shadow-inner bg-gray-50 space-y-3"
              >
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-700" htmlFor={`project-name-${project.id}`}>
                    Project Name
                  </label>
                  <input
                    id={`project-name-${project.id}`}
                    type="text"
                    value={project.name}
                    onChange={handleProjectFieldChange(project.id, "name")}
                    className="rounded border border-[#ced3d0] px-3 py-2 text-sm shadow-inner bg-white text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    placeholder="e.g., Q2 Mobile Redesign"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-700" htmlFor={`project-nickname-${project.id}`}>
                    Project Nickname
                  </label>
                  <input
                    id={`project-nickname-${project.id}`}
                    type="text"
                    value={project.nickname}
                    onChange={handleProjectFieldChange(project.id, "nickname")}
                    className="rounded border border-[#ced3d0] px-3 py-2 text-sm shadow-inner bg-white text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    placeholder="e.g., Aurora"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-700" htmlFor={`project-quota-${project.id}`}>
                    Project Weekly Quota
                  </label>
                  <input
                    id={`project-quota-${project.id}`}
                    type="text"
                    inputMode="decimal"
                    value={project.weeklyQuota}
                    onChange={handleProjectFieldChange(project.id, "weeklyQuota")}
                    className="rounded border border-[#ced3d0] px-3 py-2 text-sm shadow-inner bg-white text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    placeholder="e.g., 10h"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleSaveProject(project.id)}
                    className="inline-flex items-center gap-2 rounded border border-[#ced3d0] px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    Save Project
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {settings.savedProjects.length > 0 && (
        <div className="w-full max-w-4xl space-y-3">
          <h3 className="text-lg font-semibold text-slate-800">Saved Projects</h3>
          <div className="grid gap-3">
            {settings.savedProjects.map((saved) => (
              <div
                key={saved.projectId}
                className="flex items-center justify-between rounded px-4 py-3 shadow font-bold text-white"
                style={{ backgroundColor: saved.color }}
              >
                <span>{saved.name}</span>
                <span>{saved.weeklyQuota}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded border border-[#ced3d0] px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          onClick={() => onNavigateHome?.()}
        >
          Back to Listical
        </button>
      </div>
    </div>
  );
}
