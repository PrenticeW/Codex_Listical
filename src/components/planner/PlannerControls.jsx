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
          className="px-3 py-1 rounded text-sm font-medium transition-colors"
          style={undoStack.length === 0
            ? { background:'#e5e7eb', color:'#9ca3af', cursor:'not-allowed' }
            : { background:'var(--brand-deep)', color:'#fff', cursor:'pointer' }
          }
          title={`Undo (${undoStack.length === 0 ? 'No actions' : `${undoStack.length} action${undoStack.length > 1 ? 's' : ''}`})`}
        >
          ↶ Undo
        </button>
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          className="px-3 py-1 rounded text-sm font-medium transition-colors"
          style={redoStack.length === 0
            ? { background:'#e5e7eb', color:'#9ca3af', cursor:'not-allowed' }
            : { background:'var(--brand-deep)', color:'#fff', cursor:'pointer' }
          }
          title={`Redo (${redoStack.length === 0 ? 'No actions' : `${redoStack.length} action${redoStack.length > 1 ? 's' : ''}`})`}
        >
          ↷ Redo
        </button>
      </div>
    </div>
  );
}

export default PlannerControls;
