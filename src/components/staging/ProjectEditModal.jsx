import React from 'react';

/**
 * ProjectEditModal - Inline modal for editing project properties
 *
 * Displays when user clicks the edit (pencil) button on a project header.
 * Allows editing project color, name, nickname, and plan status.
 *
 * @param {Object} props
 * @param {Object} props.item - The project item being edited
 * @param {Object} props.planModal - Modal state with color, projectName, projectNickname
 * @param {Function} props.updatePlanModal - Function to update modal state
 * @param {Function} props.handlePlanNext - Function to close modal and save changes
 * @param {Function} props.handleRemove - Function to delete the project
 * @param {Function} props.handleTogglePlanStatus - Function to toggle addedToPlan status
 */
export default function ProjectEditModal({
  item,
  planModal,
  updatePlanModal,
  handlePlanNext,
  handleRemove,
  handleTogglePlanStatus,
}) {
  return (
    <div
      className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-[#ced3d0] bg-white p-4 shadow-xl z-[9999]"
      style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
    >
      <div className="space-y-3">
        <div className="space-y-2" style={{ paddingTop: '15px' }}>
          <label
            className="text-sm font-semibold text-slate-700"
            htmlFor="plan-color-inline"
          >
            Project colour
          </label>
          <input
            id="plan-color-inline"
            type="color"
            className="h-10 w-full cursor-pointer rounded border border-[#ced3d0] p-1"
            value={planModal.color || '#c9daf8'}
            onChange={(e) => updatePlanModal({ color: e.target.value })}
          />
        </div>
        <div className="space-y-1" style={{ paddingTop: '15px' }}>
          <label
            className="text-sm font-semibold text-slate-700"
            htmlFor="plan-name-inline"
          >
            Project Name
          </label>
          <input
            id="plan-name-inline"
            type="text"
            value={planModal.projectName}
            onChange={(e) => updatePlanModal({ projectName: e.target.value })}
            className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          />
        </div>
        <div className="space-y-1" style={{ paddingTop: '15px' }}>
          <label
            className="text-sm font-semibold text-slate-700"
            htmlFor="plan-nickname-inline"
          >
            Project Nickname
          </label>
          <input
            id="plan-nickname-inline"
            type="text"
            value={planModal.projectNickname}
            onChange={(e) => {
              const nextValue = (e.target.value || '').toUpperCase();
              updatePlanModal({ projectNickname: nextValue });
            }}
            className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          />
        </div>
        <div
          className="flex flex-wrap items-center justify-between gap-2"
          style={{ paddingTop: '15px' }}
        >
          <button
            type="button"
            className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-100"
            onClick={() => handleRemove(item.id)}
          >
            Delete Project
          </button>
          <div className="flex gap-2">
            {item.addedToPlan ? (
              <button
                type="button"
                className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 shadow-sm hover:bg-orange-100"
                onClick={() => handleTogglePlanStatus(item.id, false)}
              >
                Remove From Plan
              </button>
            ) : (
              <button
                type="button"
                className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-100"
                onClick={() => handleTogglePlanStatus(item.id, true)}
              >
                Add To Plan
              </button>
            )}
            <button
              type="button"
              className="rounded border border-[#ced3d0] bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              onClick={handlePlanNext}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
