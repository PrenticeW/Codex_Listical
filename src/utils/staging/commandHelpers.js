/**
 * Command pattern helpers for undo/redo support
 */

import { cloneStagingState } from './planTableHelpers';

/**
 * Create a state mutation executor that optionally wraps mutations in commands for undo/redo.
 *
 * This helper eliminates the repetitive pattern:
 * ```javascript
 * let capturedState = null;
 * const command = {
 *   execute: () => {
 *     setState((prev) => {
 *       if (capturedState === null) capturedState = cloneStagingState(prev);
 *       // mutation
 *     });
 *   },
 *   undo: () => { if (capturedState) setState(capturedState); },
 * };
 * executeCommand(command);
 * ```
 *
 * Usage:
 * ```javascript
 * const executeStateMutation = createStateMutationExecutor(setState, executeCommand);
 * executeStateMutation((prev) => ({ ...prev, someField: newValue }));
 * ```
 *
 * @param {Function} setState - React state setter function
 * @param {Function|null} executeCommand - Optional command executor for undo/redo support
 * @returns {Function} A function that takes a mutation function and executes it with undo support
 */
export function createStateMutationExecutor(setState, executeCommand) {
  return (mutationFn) => {
    if (executeCommand) {
      // Capture current state for undo
      let capturedPrevState = null;

      const command = {
        execute: () => {
          setState((prev) => {
            // Capture state on first execute for undo (use cloneStagingState to preserve row metadata)
            if (capturedPrevState === null) {
              capturedPrevState = cloneStagingState(prev);
            }
            return mutationFn(prev);
          });
        },
        undo: () => {
          if (capturedPrevState !== null) {
            setState(capturedPrevState);
          }
        },
      };
      executeCommand(command);
    } else {
      // No command pattern, just execute directly
      setState(mutationFn);
    }
  };
}

/**
 * Create a command object for state mutation with undo support.
 * Use this when you need the command object itself (e.g., for manual execution timing).
 *
 * @param {Function} setState - React state setter function
 * @param {Function} mutationFn - Function that takes prev state and returns new state
 * @returns {Object} Command object with execute() and undo() methods
 */
export function createStateMutationCommand(setState, mutationFn) {
  let capturedPrevState = null;

  return {
    execute: () => {
      setState((prev) => {
        if (capturedPrevState === null) {
          capturedPrevState = cloneStagingState(prev);
        }
        return mutationFn(prev);
      });
    },
    undo: () => {
      if (capturedPrevState !== null) {
        setState(capturedPrevState);
      }
    },
  };
}
