/**
 * Storage Key Definitions for Project Time Planner
 * Centralized definitions for all localStorage keys
 */

// ============================================================
// DEFAULT PROJECT ID
// ============================================================

/**
 * Default project identifier for first 12-week period
 * Used when no specific projectId is provided
 */
export const DEFAULT_PROJECT_ID = 'project-1';

// ============================================================
// MULTI-PROJECT STORAGE KEY TEMPLATES
// ============================================================
// Use {projectId} as placeholder for project-specific keys
// Pattern: planner-v2-{projectId}-{setting}

/**
 * Column sizing storage key template
 * Stores individual column widths for table columns
 *
 * Example: planner-v2-project-1-column-sizing
 * Example: planner-v2-project-2-column-sizing
 */
export const COLUMN_SIZING_KEY_TEMPLATE = 'planner-v2-{projectId}-column-sizing';

/**
 * Size scale storage key template
 * Stores UI scale factor (0.5 to 3.0, default 1.0)
 * Affects row height, font size, and icon sizes
 *
 * Example: planner-v2-project-1-size-scale
 * Example: planner-v2-project-2-size-scale
 */
export const SIZE_SCALE_KEY_TEMPLATE = 'planner-v2-{projectId}-size-scale';

// ============================================================
// LEGACY KEYS (Backward Compatibility)
// ============================================================
// These keys are maintained in /src/constants/plannerConstants.js:
// - SETTINGS_STORAGE_KEY = 'listical-settings'
// - TASK_ROWS_STORAGE_KEY = 'listical-task-rows'
//
// Import these from plannerConstants.js when needed for backward compatibility
