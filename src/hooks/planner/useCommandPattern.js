/**
 * Command Pattern Hook
 * Manages undo/redo functionality using the command pattern
 */

import { useState, useCallback } from 'react';

/**
 * Hook to manage undo/redo command pattern
 * @param {Object} options - Hook options
 * @param {number} options.maxHistorySize - Maximum number of commands to keep in history (default: 100)
 * @returns {Object} Command pattern state and functions
 */
export default function useCommandPattern({ maxHistorySize = 100 } = {}) {
  const [undoStack, setUndoStack] = useState([]); // Array of commands
  const [redoStack, setRedoStack] = useState([]); // Array of commands

  /**
   * Execute a command and add it to the undo stack
   * @param {Object} command - Command object with execute() and undo() methods
   */
  const executeCommand = useCallback((command) => {
    // Execute the command
    command.execute();

    // Add to undo stack
    setUndoStack(prev => {
      const newStack = [...prev, command];
      // Limit stack size
      if (newStack.length > maxHistorySize) {
        return newStack.slice(-maxHistorySize);
      }
      return newStack;
    });

    // Clear redo stack when new command is executed
    setRedoStack([]);
  }, [maxHistorySize]);

  /**
   * Undo the last command
   */
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;

    const command = undoStack[undoStack.length - 1];
    command.undo();

    // Move command from undo to redo stack
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, command]);
  }, [undoStack]);

  /**
   * Redo the last undone command
   */
  const redo = useCallback(() => {
    if (redoStack.length === 0) return;

    const command = redoStack[redoStack.length - 1];
    command.execute();

    // Move command from redo to undo stack
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => {
      const newStack = [...prev, command];
      if (newStack.length > maxHistorySize) {
        return newStack.slice(-maxHistorySize);
      }
      return newStack;
    });
  }, [redoStack, undoStack, maxHistorySize]);

  return {
    undoStack,
    redoStack,
    executeCommand,
    undo,
    redo,
  };
}
