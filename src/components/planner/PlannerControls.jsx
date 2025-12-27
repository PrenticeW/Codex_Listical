/**
 * PlannerControls Component
 * Renders the header controls: undo/redo
 */
function PlannerControls({
  undoStack,
  redoStack,
  undo,
  redo,
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex gap-2 items-end">
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
    </div>
  );
}

export default PlannerControls;
