/**
 * PlannerControls Component
 * Renders the header controls: size scale, undo/redo, and start date
 */
function PlannerControls({
  sizeScale,
  decreaseSize,
  increaseSize,
  resetSize,
  undoStack,
  redoStack,
  undo,
  redo,
  startDate,
  setStartDate,
  totalDays,
  setData,
  createInitialData,
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex flex-col gap-2 items-end">
        <div className="flex gap-2">
          {/* Size controls */}
          <div className="flex gap-1 items-center border border-gray-300 rounded px-2 py-1 bg-white">
            <span className="text-xs text-gray-600 mr-1">Size:</span>
            <button
              onClick={decreaseSize}
              className="px-2 py-0.5 rounded text-sm font-medium bg-gray-200 hover:bg-gray-300 transition-colors"
              title="Decrease size"
            >
              -
            </button>
            <span className="text-xs text-gray-700 font-mono min-w-[3ch] text-center">{Math.round(sizeScale * 100)}%</span>
            <button
              onClick={increaseSize}
              className="px-2 py-0.5 rounded text-sm font-medium bg-gray-200 hover:bg-gray-300 transition-colors"
              title="Increase size"
            >
              +
            </button>
            <button
              onClick={resetSize}
              className="px-2 py-0.5 rounded text-xs font-medium bg-gray-200 hover:bg-gray-300 transition-colors ml-1"
              title="Reset to default size"
            >
              Reset
            </button>
          </div>

          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              undoStack.length === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'
            }`}
            title={`Undo (${undoStack.length === 0 ? 'No actions' : `${undoStack.length} action${undoStack.length > 1 ? 's' : ''}`})`}
          >
            ↶ Undo
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              redoStack.length === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'
            }`}
            title={`Redo (${redoStack.length === 0 ? 'No actions' : `${redoStack.length} action${redoStack.length > 1 ? 's' : ''}`})`}
          >
            ↷ Redo
          </button>
        </div>

        {/* Start date control */}
        <div className="flex gap-1 items-center border border-gray-300 rounded px-2 py-1 bg-white">
          <span className="text-xs text-gray-600 mr-1">Start Date:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setData(createInitialData(100, totalDays, e.target.value));
            }}
            className="text-xs border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}

export default PlannerControls;
