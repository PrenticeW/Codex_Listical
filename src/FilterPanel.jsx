import React, { useEffect } from 'react';

const isBrowserEnvironment = () =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

export default function FilterPanel({
  projectFilterMenu,
  projectFilterMenuRef,
  projectFilterButtonRef,
  projectNames,
  selectedProjectFilters,
  handleProjectFilterSelect,
  handleProjectFilterButtonClick,
  closeProjectFilterMenu,
  statusFilterMenu,
  statusFilterMenuRef,
  statusFilterButtonRef,
  statusNames,
  selectedStatusFilters,
  handleStatusFilterSelect,
  handleStatusFilterButtonClick,
  closeStatusFilterMenu,
  recurringFilterMenu,
  recurringFilterMenuRef,
  recurringFilterButtonRef,
  recurringNames,
  selectedRecurringFilters,
  handleRecurringFilterSelect,
  handleRecurringFilterButtonClick,
  closeRecurringFilterMenu,
  estimateFilterMenu,
  estimateFilterMenuRef,
  estimateFilterButtonRef,
  estimateNames,
  selectedEstimateFilters,
  handleEstimateFilterSelect,
  handleEstimateFilterButtonClick,
  closeEstimateFilterMenu,
}) {
  useEffect(() => {
    if (!projectFilterMenu.open || !isBrowserEnvironment()) return undefined;
    const handleClickOutside = (event) => {
      const menuNode = projectFilterMenuRef.current;
      const buttonNode = projectFilterButtonRef.current;
      if (menuNode && menuNode.contains(event.target)) return;
      if (buttonNode && buttonNode.contains(event.target)) return;
      closeProjectFilterMenu();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeProjectFilterMenu();
      }
    };
    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [projectFilterMenu.open, projectFilterMenuRef, projectFilterButtonRef, closeProjectFilterMenu]);

  useEffect(() => {
    if (!statusFilterMenu.open || !isBrowserEnvironment()) return undefined;
    const handleClickOutside = (event) => {
      const menuNode = statusFilterMenuRef.current;
      const buttonNode = statusFilterButtonRef.current;
      if (menuNode && menuNode.contains(event.target)) return;
      if (buttonNode && buttonNode.contains(event.target)) return;
      closeStatusFilterMenu();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeStatusFilterMenu();
      }
    };
    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [statusFilterMenu.open, statusFilterMenuRef, statusFilterButtonRef, closeStatusFilterMenu]);

  useEffect(() => {
    if (!recurringFilterMenu.open || !isBrowserEnvironment()) return undefined;
    const handleClickOutside = (event) => {
      const menuNode = recurringFilterMenuRef.current;
      const buttonNode = recurringFilterButtonRef.current;
      if (menuNode && menuNode.contains(event.target)) return;
      if (buttonNode && buttonNode.contains(event.target)) return;
      closeRecurringFilterMenu();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeRecurringFilterMenu();
      }
    };
    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [recurringFilterMenu.open, recurringFilterMenuRef, recurringFilterButtonRef, closeRecurringFilterMenu]);

  useEffect(() => {
    if (!estimateFilterMenu.open || !isBrowserEnvironment()) return undefined;
    const handleClickOutside = (event) => {
      const menuNode = estimateFilterMenuRef.current;
      const buttonNode = estimateFilterButtonRef.current;
      if (menuNode && menuNode.contains(event.target)) return;
      if (buttonNode && buttonNode.contains(event.target)) return;
      closeEstimateFilterMenu();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeEstimateFilterMenu();
      }
    };
    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [estimateFilterMenu.open, estimateFilterMenuRef, estimateFilterButtonRef, closeEstimateFilterMenu]);

  return (
    <>
      {projectFilterMenu.open && (
        <div
          ref={projectFilterMenuRef}
          className="fixed z-50 mt-1 min-w-[200px] overflow-hidden rounded border border-[#ced3d0] bg-white text-[12px] shadow-lg"
          style={{ top: projectFilterMenu.top, left: projectFilterMenu.left }}
        >
          <div className="max-h-64 overflow-y-auto">
            {projectNames.length === 0 ? (
              <div className="px-3 py-2 text-slate-600">No projects available</div>
            ) : (
              projectNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-100 ${
                    selectedProjectFilters.has(name) ? 'font-semibold text-slate-900' : 'text-slate-800'
                  }`}
                  onClick={() => handleProjectFilterSelect(name)}
                >
                  <span>{name}</span>
                  {selectedProjectFilters.has(name) ? <span>✓</span> : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {statusFilterMenu.open && (
        <div
          ref={statusFilterMenuRef}
          className="fixed z-50 mt-1 min-w-[200px] overflow-hidden rounded border border-[#ced3d0] bg-white text-[12px] shadow-lg"
          style={{ top: statusFilterMenu.top, left: statusFilterMenu.left }}
        >
          <div className="max-h-64 overflow-y-auto">
            {statusNames.length === 0 ? (
              <div className="px-3 py-2 text-slate-600">No statuses available</div>
            ) : (
              statusNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-100 ${
                    selectedStatusFilters.has(name) ? 'font-semibold text-slate-900' : 'text-slate-800'
                  }`}
                  onClick={() => handleStatusFilterSelect(name)}
                >
                  <span>{name}</span>
                  {selectedStatusFilters.has(name) ? <span>✓</span> : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {recurringFilterMenu.open && (
        <div
          ref={recurringFilterMenuRef}
          className="fixed z-50 mt-1 min-w-[200px] overflow-hidden rounded border border-[#ced3d0] bg-white text-[12px] shadow-lg"
          style={{ top: recurringFilterMenu.top, left: recurringFilterMenu.left }}
        >
          <div className="max-h-64 overflow-y-auto">
            {recurringNames.map((name) => (
              <button
                key={name}
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-100 ${
                  selectedRecurringFilters.has(name) ? 'font-semibold text-slate-900' : 'text-slate-800'
                }`}
                onClick={() => handleRecurringFilterSelect(name)}
              >
                <span>{name}</span>
                {selectedRecurringFilters.has(name) ? <span>✓</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}
      {estimateFilterMenu.open && (
        <div
          ref={estimateFilterMenuRef}
          className="fixed z-50 mt-1 min-w-[200px] overflow-hidden rounded border border-[#ced3d0] bg-white text-[12px] shadow-lg"
          style={{ top: estimateFilterMenu.top, left: estimateFilterMenu.left }}
        >
          <div className="max-h-64 overflow-y-auto">
            {estimateNames.map((name) => (
              <button
                key={name}
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-100 ${
                  selectedEstimateFilters.has(name) ? 'font-semibold text-slate-900' : 'text-slate-800'
                }`}
                onClick={() => handleEstimateFilterSelect(name)}
              >
                <span>{name}</span>
                {selectedEstimateFilters.has(name) ? <span>✓</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
