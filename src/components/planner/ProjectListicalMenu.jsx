import React, { useEffect, useRef } from 'react';

export default function ProjectListicalMenu({
  isOpen,
  onToggle,
  onClose,
  showRecurring,
  onToggleShowRecurring,
  showSubprojects,
  onToggleShowSubprojects,
  showMaxMinRows,
  onToggleShowMaxMinRows,
  addTasksCount,
  onAddTasksCountChange,
  handleAddTasks,
  startDate,
  onStartDateChange,
  selectedSortStatuses,
  onToggleSortStatus,
  handleSortInbox,
  handleArchiveWeek,
  checkboxInputClass,
  sortableStatuses,
  sizeScale,
  decreaseSize,
  increaseSize,
  resetSize,
  undoStack,
  redoStack,
  undo,
  redo,
}) {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      if (buttonRef.current?.contains(event.target)) return;
      onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div>
      <button
        type="button"
        ref={buttonRef}
        onClick={onToggle}
        aria-expanded={isOpen}
        className="inline-flex items-center gap-2 rounded border border-[#ced3d0] bg-white px-3 py-2 font-semibold text-[#065f46] shadow-sm transition hover:bg-[#f2fdf6] hover:shadow-md"
      >
        <span>Listical</span>
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className="absolute z-20 mt-2 w-[36rem] rounded border border-[#ced3d0] bg-[#f2fdf6] p-4 shadow-lg"
        >
          <div className="flex flex-col gap-3 text-[12px] text-slate-800">
            {/* Page Size Controls */}
            <div className="flex items-center gap-3 rounded border border-[#ced3d0] bg-white/60 p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Page Size</span>
              <div className="flex gap-1 items-center">
                <button
                  onClick={decreaseSize}
                  className="px-2 py-0.5 rounded text-sm font-medium bg-white border border-[#ced3d0] text-[#065f46] hover:bg-[#e6f7ed] transition-colors"
                  title="Decrease size"
                >
                  -
                </button>
                <span className="text-xs text-slate-700 font-mono min-w-[3ch] text-center">{Math.round(sizeScale * 100)}%</span>
                <button
                  onClick={increaseSize}
                  className="px-2 py-0.5 rounded text-sm font-medium bg-white border border-[#ced3d0] text-[#065f46] hover:bg-[#e6f7ed] transition-colors"
                  title="Increase size"
                >
                  +
                </button>
                <button
                  onClick={resetSize}
                  className="px-2 py-0.5 rounded text-xs font-medium bg-white border border-[#ced3d0] text-[#065f46] hover:bg-[#e6f7ed] transition-colors ml-1"
                  title="Reset to default size"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Undo/Redo Controls */}
            <div className="flex items-center gap-2 rounded border border-[#ced3d0] bg-white/60 p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">History</span>
              <button
                onClick={undo}
                disabled={undoStack.length === 0}
                className={`px-3 py-1 rounded text-[12px] font-semibold transition-colors ${
                  undoStack.length === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300'
                    : 'bg-white text-[#065f46] hover:bg-[#e6f7ed] border border-[#ced3d0]'
                }`}
                title={`Undo (${undoStack.length === 0 ? 'No actions' : `${undoStack.length} action${undoStack.length > 1 ? 's' : ''}`})`}
              >
                ↶ Undo
              </button>
              <button
                onClick={redo}
                disabled={redoStack.length === 0}
                className={`px-3 py-1 rounded text-[12px] font-semibold transition-colors ${
                  redoStack.length === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300'
                    : 'bg-white text-[#065f46] hover:bg-[#e6f7ed] border border-[#ced3d0]'
                }`}
                title={`Redo (${redoStack.length === 0 ? 'No actions' : `${redoStack.length} action${redoStack.length > 1 ? 's' : ''}`})`}
              >
                ↷ Redo
              </button>
            </div>

            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className={checkboxInputClass}
                checked={showRecurring}
                onChange={onToggleShowRecurring}
              />
              Show Recurring
            </label>
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className={checkboxInputClass}
                checked={showSubprojects}
                onChange={onToggleShowSubprojects}
              />
              Show Subprojects
            </label>
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className={checkboxInputClass}
                checked={showMaxMinRows}
                onChange={onToggleShowMaxMinRows}
              />
              Toggle Max/Min Hours
            </label>
            <div className="flex items-center gap-3 font-semibold text-slate-800">
              <span className="text-[11px] uppercase tracking-wide text-slate-600">Add Tasks</span>
              <input
                type="number"
                min="0"
                value={addTasksCount}
                onChange={(e) => onAddTasksCountChange(e.target.value)}
                className="w-24 rounded border border-[#ced3d0] px-2 py-1 text-[12px] font-normal uppercase tracking-normal text-slate-800"
                placeholder="0"
              />
              <button
                type="button"
                className="rounded border border-[#ced3d0] bg-white px-4 py-1 text-[12px] font-semibold text-[#065f46] transition hover:bg-[#e6f7ed]"
                onClick={handleAddTasks}
              >
                Ok
              </button>
            </div>
            <label className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              <span>Start Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="flex-1 rounded border border-[#ced3d0] px-2 py-1 text-[12px] font-normal uppercase tracking-normal text-slate-800"
              />
            </label>
            <div className="flex flex-col gap-2 rounded border border-[#ced3d0] bg-white/60 p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Sort Inbox: Move statuses
              </span>
              <div className="flex flex-wrap gap-3">
                {sortableStatuses.map((status) => (
                  <label key={status} className="flex items-center gap-2 text-[12px] font-semibold">
                    <input
                      type="checkbox"
                      className={checkboxInputClass}
                      checked={selectedSortStatuses.has(status)}
                      onChange={() => onToggleSortStatus(status)}
                    />
                    <span>{status}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="rounded border border-[#ced3d0] bg-white px-4 py-2 text-[12px] font-semibold text-[#065f46] transition hover:bg-[#e6f7ed]"
                onClick={handleSortInbox}
              >
                Sort Inbox
              </button>
              <button
                type="button"
                className="rounded border border-[#ced3d0] bg-white px-4 py-2 text-[12px] font-semibold text-[#065f46] transition hover:bg-[#e6f7ed]"
                onClick={handleArchiveWeek}
              >
                Archive Week
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
