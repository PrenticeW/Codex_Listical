import React from 'react';
import useClickOutside from '../../hooks/useClickOutside';

const FilterPanel = React.memo(function FilterPanel({
  projectFilterMenu,
  projectFilterMenuRef,
  projectFilterButtonRef,
  projectNames,
  selectedProjectFilters,
  handleProjectFilterSelect,
  closeProjectFilterMenu,
  statusFilterMenu,
  statusFilterMenuRef,
  statusFilterButtonRef,
  statusNames,
  selectedStatusFilters,
  handleStatusFilterSelect,
  closeStatusFilterMenu,
  recurringFilterMenu,
  recurringFilterMenuRef,
  recurringFilterButtonRef,
  recurringNames,
  selectedRecurringFilters,
  handleRecurringFilterSelect,
  closeRecurringFilterMenu,
  estimateFilterMenu,
  estimateFilterMenuRef,
  estimateFilterButtonRef,
  estimateNames,
  selectedEstimateFilters,
  handleEstimateFilterSelect,
  closeEstimateFilterMenu,
}) {
  // Handle click-outside and escape key for all filter menus
  useClickOutside({
    isOpen: projectFilterMenu.open,
    menuRef: projectFilterMenuRef,
    buttonRef: projectFilterButtonRef,
    onClose: closeProjectFilterMenu,
  });

  useClickOutside({
    isOpen: statusFilterMenu.open,
    menuRef: statusFilterMenuRef,
    buttonRef: statusFilterButtonRef,
    onClose: closeStatusFilterMenu,
  });

  useClickOutside({
    isOpen: recurringFilterMenu.open,
    menuRef: recurringFilterMenuRef,
    buttonRef: recurringFilterButtonRef,
    onClose: closeRecurringFilterMenu,
  });

  useClickOutside({
    isOpen: estimateFilterMenu.open,
    menuRef: estimateFilterMenuRef,
    buttonRef: estimateFilterButtonRef,
    onClose: closeEstimateFilterMenu,
  });

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
});

export default FilterPanel;
