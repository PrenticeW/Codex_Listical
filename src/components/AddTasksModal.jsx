import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, AlertCircle } from 'lucide-react';

/**
 * AddTasksModal Component
 *
 * Custom modal for adding multiple tasks to the planner.
 */
export function AddTasksModal({ isOpen, onClose, onConfirm }) {
  const [count, setCount] = useState('5');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setCount('5');
      setError('');
      // Focus input when modal opens
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();

    const numCount = parseInt(count, 10);

    // Validate input
    if (!Number.isFinite(numCount) || numCount <= 0) {
      setError('Please enter a valid positive number');
      return;
    }

    if (numCount > 100) {
      setError('Maximum 100 tasks allowed at once');
      return;
    }

    // Call confirmation callback
    onConfirm(numCount);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl border border-[#ced3d0] w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#ced3d0]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#065f46] flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Add Tasks</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded hover:bg-slate-100"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5">
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="task-count" className="block text-sm font-semibold text-slate-700 mb-2">
                How many tasks would you like to add?
              </label>
              <input
                ref={inputRef}
                id="task-count"
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => {
                  setCount(e.target.value);
                  setError('');
                }}
                className="w-full rounded-lg border border-[#ced3d0] px-4 py-3 text-base text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#065f46]/30 focus:border-[#065f46] transition-all"
                placeholder="Enter number of tasks..."
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-200">
              <p>Tasks will be added below the currently selected row, or at the end if no row is selected.</p>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#ced3d0] bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="px-6 py-2 rounded-lg text-sm font-semibold text-white bg-[#065f46] hover:bg-[#047857] transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!count || count === '0'}
          >
            Add {count && count !== '0' ? count : ''} Task{count > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
