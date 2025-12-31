import React, { useEffect, useRef, useState } from 'react';
import { Archive } from 'lucide-react';
import { useYear } from '../../contexts/YearContext';
import YearSelector from '../YearSelector';

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
  handleNewSubproject,
  handleDuplicateRow,
  handleAddWeek,
  startDate,
  onStartDateChange,
  selectedSortStatuses,
  onToggleSortStatus,
  selectedSortPlannerStatuses,
  onToggleSortPlannerStatus,
  handleSortInbox,
  handleSortPlanner,
  handleArchiveWeek,
  handleHideWeek,
  handleShowWeek,
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
  onOpenArchiveModal,
}) {
  const { currentYear, isCurrentYearArchived } = useYear();
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [expandedSections, setExpandedSections] = useState({
    viewControls: true,
    history: false,
    timeline: false,
    rowOps: false,
    batchOps: false,
    archive: false,
    manageYear: false,
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

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
          className="absolute z-20 mt-2 rounded border border-[#ced3d0] bg-[#f2fdf6] shadow-lg"
          style={{ width: '600px' }}
        >
          <div className="flex flex-col text-[12px] text-slate-800" style={{ padding: '16px', gap: '16px' }}>
            {/* Row Operations Section */}
            <div className="border border-[#ced3d0] rounded overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('rowOps')}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/40 transition-colors"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Insert
                </span>
                <span className="text-slate-500 text-sm">
                  {expandedSections.rowOps ? '▼' : '▶'}
                </span>
              </button>
              {expandedSections.rowOps && (
                <div className="px-4 bg-white/20" style={{ paddingTop: '12px', paddingBottom: '12px', gap: '12px', display: 'flex', flexDirection: 'column' }}>
                  {/* Add Tasks */}
                  <div className="flex items-center" style={{ gap: '4px' }}>
                    <span className="text-[12px] font-semibold text-slate-800">Add Tasks</span>
                    <input
                      type="number"
                      min="0"
                      max="9999"
                      value={addTasksCount}
                      onChange={(e) => onAddTasksCountChange(e.target.value)}
                      className="rounded border border-[#ced3d0] px-2 py-1.5 text-[12px] text-slate-800 bg-white"
                      style={{ width: '80px' }}
                      placeholder="0"
                    />
                    <button
                      type="button"
                      className="rounded border border-[#ced3d0] bg-white px-4 py-1.5 text-[12px] font-semibold text-[#065f46] transition hover:bg-[#e6f7ed]"
                      onClick={handleAddTasks}
                    >
                      Add
                    </button>
                  </div>
                  {/* Action Buttons */}
                  <button
                    type="button"
                    className="rounded border border-[#ced3d0] bg-white px-4 py-2 text-[12px] font-semibold text-[#065f46] transition hover:bg-[#e6f7ed] text-left"
                    onClick={handleNewSubproject}
                    title="Create a new subproject under the selected row"
                  >
                    New Subproject
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[#ced3d0] bg-white px-4 py-2 text-[12px] font-semibold text-[#065f46] transition hover:bg-[#e6f7ed] text-left"
                    onClick={handleDuplicateRow}
                    title="Duplicate the highlighted row"
                  >
                    Duplicate Row
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[#ced3d0] bg-white px-4 py-2 text-[12px] font-semibold text-[#065f46] transition hover:bg-[#e6f7ed] text-left"
                    onClick={handleAddWeek}
                    title="Add 7 more days to the end of the calendar"
                  >
                    Add Week
                  </button>
                </div>
              )}
            </div>

            {/* Sort Section */}
            <div className="border border-[#ced3d0] rounded overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('batchOps')}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/40 transition-colors"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Sort
                </span>
                <span className="text-slate-500 text-sm">
                  {expandedSections.batchOps ? '▼' : '▶'}
                </span>
              </button>
              {expandedSections.batchOps && (
                <div className="px-4 bg-white/20" style={{ paddingTop: '12px', paddingBottom: '12px', gap: '12px', display: 'flex', flexDirection: 'column' }}>
                  {/* Sort Inbox Section */}
                  <div className="flex flex-col" style={{ gap: '8px' }}>
                    <span className="text-[13px] font-bold text-slate-700">Sort Inbox</span>
                    <div className="ml-4 flex flex-col" style={{ gap: '8px' }}>
                      <span className="text-[12px] font-semibold text-slate-800">Statuses to move:</span>
                      <div className="flex flex-wrap gap-3">
                        {sortableStatuses.map((status) => (
                          <label key={status} className="flex items-center gap-1.5 text-[12px] font-semibold">
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
                      <button
                        type="button"
                        className="rounded border border-[#ced3d0] bg-white px-4 py-2 text-[12px] font-semibold text-[#065f46] transition hover:bg-[#e6f7ed] text-left"
                        onClick={handleSortInbox}
                      >
                        Sort Inbox
                      </button>
                    </div>
                  </div>

                  {/* Sort Planner Section */}
                  <div className="flex flex-col" style={{ gap: '8px' }}>
                    <span className="text-[13px] font-bold text-slate-700">Sort Planner</span>
                    <div className="ml-4 flex flex-col" style={{ gap: '8px' }}>
                      <span className="text-[12px] font-semibold text-slate-800">Statuses to move:</span>
                      <div className="flex flex-wrap gap-3">
                        {sortableStatuses.map((status) => (
                          <label key={`planner-${status}`} className="flex items-center gap-1.5 text-[12px] font-semibold">
                            <input
                              type="checkbox"
                              className={checkboxInputClass}
                              checked={selectedSortPlannerStatuses.has(status)}
                              onChange={() => onToggleSortPlannerStatus(status)}
                            />
                            <span>{status}</span>
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="rounded border border-[#ced3d0] bg-white px-4 py-2 text-[12px] font-semibold text-[#065f46] transition hover:bg-[#e6f7ed] text-left"
                        onClick={handleSortPlanner}
                      >
                        Sort Planner
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Archive Section */}
            <div className="border border-[#ced3d0] rounded overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('archive')}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/40 transition-colors"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Archive
                </span>
                <span className="text-slate-500 text-sm">
                  {expandedSections.archive ? '▼' : '▶'}
                </span>
              </button>
              {expandedSections.archive && (
                <div className="px-4 bg-white/20" style={{ paddingTop: '12px', paddingBottom: '12px', gap: '6px', display: 'flex', flexDirection: 'column' }}>
                  <button
                    type="button"
                    className="rounded border border-[#ced3d0] bg-white px-4 py-2 text-[12px] font-semibold text-[#065f46] transition hover:bg-[#e6f7ed] text-left"
                    onClick={handleArchiveWeek}
                  >
                    Archive Week
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[#ced3d0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#065f46] transition hover:bg-[#e6f7ed] text-left"
                    onClick={handleHideWeek}
                    title="Hide the next 7 days"
                  >
                    Hide Week
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[#ced3d0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#065f46] transition hover:bg-[#e6f7ed] text-left"
                    onClick={handleShowWeek}
                    title="Show the previous 7 days"
                  >
                    Show Week
                  </button>
                </div>
              )}
            </div>

            {/* Manage Year Section */}
            <div className="border border-[#ced3d0] rounded overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('manageYear')}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/40 transition-colors"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Manage Year
                </span>
                <span className="text-slate-500 text-sm">
                  {expandedSections.manageYear ? '▼' : '▶'}
                </span>
              </button>
              {expandedSections.manageYear && (
                <div className="px-4 bg-white/20" style={{ paddingTop: '12px', paddingBottom: '12px', gap: '12px', display: 'flex', flexDirection: 'column' }}>
                  {!isCurrentYearArchived && (
                    <button
                      type="button"
                      className="rounded border border-[#ced3d0] bg-white px-4 py-2 text-[12px] font-semibold text-[#065f46] transition hover:bg-[#e6f7ed] text-left flex items-center gap-2"
                      onClick={onOpenArchiveModal}
                    >
                      <Archive className="w-4 h-4" />
                      Archive Year {currentYear}
                    </button>
                  )}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 mb-2 block">
                      Year Selector
                    </label>
                    <YearSelector />
                  </div>
                </div>
              )}
            </div>

            {/* History Section */}
            <div className="border border-[#ced3d0] rounded overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('history')}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/40 transition-colors"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  History
                </span>
                <span className="text-slate-500 text-sm">
                  {expandedSections.history ? '▼' : '▶'}
                </span>
              </button>
              {expandedSections.history && (
                <div className="px-4 bg-white/20" style={{ paddingTop: '12px', paddingBottom: '12px' }}>
                  <div className="flex gap-2">
                    <button
                      onClick={undo}
                      disabled={undoStack.length === 0}
                      className={`flex-1 px-3 py-1.5 rounded text-[12px] font-semibold transition-colors ${
                        undoStack.length === 0
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300'
                          : 'bg-white text-[#065f46] hover:bg-[#e6f7ed] border border-[#ced3d0]'
                      }`}
                      title={`Undo (⌘Z) - ${undoStack.length === 0 ? 'No actions' : `${undoStack.length} action${undoStack.length > 1 ? 's' : ''}`}`}
                    >
                      ↶ Undo
                    </button>
                    <button
                      onClick={redo}
                      disabled={redoStack.length === 0}
                      className={`flex-1 px-3 py-1.5 rounded text-[12px] font-semibold transition-colors ${
                        redoStack.length === 0
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300'
                          : 'bg-white text-[#065f46] hover:bg-[#e6f7ed] border border-[#ced3d0]'
                      }`}
                      title={`Redo (⌘⇧Z) - ${redoStack.length === 0 ? 'No actions' : `${redoStack.length} action${redoStack.length > 1 ? 's' : ''}`}`}
                    >
                      ↷ Redo
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* View Controls Section */}
            <div className="border border-[#ced3d0] rounded overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('viewControls')}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/40 transition-colors"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Settings
                </span>
                <span className="text-slate-500 text-sm">
                  {expandedSections.viewControls ? '▼' : '▶'}
                </span>
              </button>
              {expandedSections.viewControls && (
                <div className="px-4 py-3 flex flex-col bg-white/20" style={{ gap: '12px' }}>
                  {/* Page Size Section */}
                  <div className="flex flex-col border-b border-[#ced3d0]/30" style={{ paddingBottom: '12px', paddingTop: '12px', gap: '8px' }}>
                    <span className="text-[13px] font-bold text-slate-700">Page Size</span>
                    <div className="flex flex-col ml-4" style={{ gap: '8px' }}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={decreaseSize}
                          className="px-4 py-2 rounded text-sm font-semibold bg-white border border-[#ced3d0] text-[#065f46] hover:bg-[#e6f7ed] transition-colors"
                          title="Decrease size"
                        >
                          Smaller
                        </button>
                        <div className="text-2xl font-bold text-[#065f46] min-w-[70px] text-center">
                          {Math.round(sizeScale * 100)}%
                        </div>
                        <button
                          onClick={increaseSize}
                          className="px-4 py-2 rounded text-sm font-semibold bg-white border border-[#ced3d0] text-[#065f46] hover:bg-[#e6f7ed] transition-colors"
                          title="Increase size"
                        >
                          Larger
                        </button>
                      </div>
                      <button
                        onClick={resetSize}
                        className="px-3 py-1 rounded text-xs font-medium bg-white border border-[#ced3d0] text-slate-600 hover:bg-gray-100 transition-colors self-start"
                        title="Reset to default size"
                      >
                        Reset to 100%
                      </button>
                    </div>
                  </div>

                  {/* Start Date Section */}
                  <div className="flex flex-col" style={{ gap: '8px' }}>
                    <span className="text-[13px] font-bold text-slate-700">Start Date</span>
                    <div className="ml-4">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => onStartDateChange(e.target.value)}
                        className="rounded border border-[#ced3d0] px-2 py-1.5 text-[12px] text-slate-800 bg-white"
                      />
                    </div>
                  </div>

                  {/* View Toggles Section */}
                  <div className="flex flex-col" style={{ gap: '8px' }}>
                    <span className="text-[13px] font-bold text-slate-700">Display Options</span>
                    <div className="flex flex-col ml-4">
                      <div className="flex flex-col" style={{ gap: '3px' }}>
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
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
